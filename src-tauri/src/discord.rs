use std::{
    fs::OpenOptions,
    io::{Read, Write},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

const DEFAULT_DISCORD_CLIENT_ID: &str = "1214013410767114320";

pub struct DiscordState(pub Mutex<Option<DiscordClient>>);

pub struct DiscordClient {
    pipe: std::fs::File,
    _client_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordActivity {
    pub details: Option<String>,
    pub state: Option<String>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
}

impl DiscordClient {
    pub fn connect(client_id: Option<&str>) -> Result<Self, String> {
        let cid = client_id.unwrap_or(DEFAULT_DISCORD_CLIENT_ID).to_string();
        let pipe = open_discord_pipe()?;

        let mut client = Self {
            pipe,
            _client_id: cid.clone(),
        };

        // Handshake: opcode 0
        let handshake_payload = json!({
            "v": 1,
            "client_id": cid
        })
        .to_string();

        client.write_frame(0, &handshake_payload)?;
        let _ = client.read_frame();

        Ok(client)
    }

    pub fn set_activity(&mut self, activity: &DiscordActivity) -> Result<(), String> {
        let pid = std::process::id();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis().to_string())
            .unwrap_or_else(|_| "1".to_string());

        let mut act_json = serde_json::Map::new();

        if let Some(ref details) = activity.details {
            act_json.insert("details".to_string(), json!(details));
        }
        if let Some(ref state) = activity.state {
            act_json.insert("state".to_string(), json!(state));
        }

        let mut timestamps = serde_json::Map::new();
        if let Some(start) = activity.start_time {
            timestamps.insert("start".to_string(), json!(start));
        }
        if let Some(end) = activity.end_time {
            timestamps.insert("end".to_string(), json!(end));
        }
        if !timestamps.is_empty() {
            act_json.insert("timestamps".to_string(), json!(timestamps));
        }

        let mut assets = serde_json::Map::new();
        if let Some(ref img) = activity.large_image {
            assets.insert("large_image".to_string(), json!(img));
        }
        if let Some(ref txt) = activity.large_text {
            assets.insert("large_text".to_string(), json!(txt));
        }
        if let Some(ref img) = activity.small_image {
            assets.insert("small_image".to_string(), json!(img));
        }
        if let Some(ref txt) = activity.small_text {
            assets.insert("small_text".to_string(), json!(txt));
        }
        if !assets.is_empty() {
            act_json.insert("assets".to_string(), json!(assets));
        }

        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": pid,
                "activity": act_json
            },
            "nonce": nonce
        })
        .to_string();

        self.write_frame(1, &payload)
    }

    pub fn clear_activity(&mut self) -> Result<(), String> {
        let pid = std::process::id();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis().to_string())
            .unwrap_or_else(|_| "1".to_string());

        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": pid,
                "activity": null
            },
            "nonce": nonce
        })
        .to_string();

        self.write_frame(1, &payload)
    }

    fn write_frame(&mut self, opcode: u32, payload: &str) -> Result<(), String> {
        let bytes = payload.as_bytes();
        let len = bytes.len() as u32;

        let mut header = [0u8; 8];
        header[0..4].copy_from_slice(&opcode.to_le_bytes());
        header[4..8].copy_from_slice(&len.to_le_bytes());

        self.pipe
            .write_all(&header)
            .and_then(|_| self.pipe.write_all(bytes))
            .and_then(|_| self.pipe.flush())
            .map_err(|e| format!("Failed to write Discord IPC frame: {e}"))
    }

    fn read_frame(&mut self) -> Result<(u32, String), String> {
        let mut header = [0u8; 8];
        self.pipe
            .read_exact(&mut header)
            .map_err(|e| format!("Failed to read Discord IPC header: {e}"))?;

        let opcode = u32::from_le_bytes(header[0..4].try_into().unwrap());
        let len = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;

        let mut buf = vec![0u8; len];
        self.pipe
            .read_exact(&mut buf)
            .map_err(|e| format!("Failed to read Discord IPC body: {e}"))?;

        let body = String::from_utf8_lossy(&buf).to_string();
        Ok((opcode, body))
    }
}

fn open_discord_pipe() -> Result<std::fs::File, String> {
    for i in 0..10 {
        #[cfg(target_os = "windows")]
        let pipe_path = format!(r"\\.\pipe\discord-ipc-{}", i);

        #[cfg(not(target_os = "windows"))]
        let pipe_path = {
            let tmp = std::env::var("XDG_RUNTIME_DIR")
                .or_else(|_| std::env::var("TMPDIR"))
                .or_else(|_| std::env::var("TMP"))
                .or_else(|_| std::env::var("TEMP"))
                .unwrap_or_else(|_| "/tmp".to_string());
            format!("{}/discord-ipc-{}", tmp, i)
        };

        if let Ok(file) = OpenOptions::new().read(true).write(true).open(&pipe_path) {
            return Ok(file);
        }
    }
    Err("Discord is not running or IPC pipe unavailable.".to_string())
}

#[tauri::command]
pub fn set_discord_activity_cmd(
    state: State<'_, DiscordState>,
    activity: DiscordActivity,
    client_id: Option<String>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Discord state poisoned".to_string())?;

    if guard.is_none() {
        *guard = DiscordClient::connect(client_id.as_deref()).ok();
    }

    if let Some(ref mut client) = *guard {
        if let Err(_) = client.set_activity(&activity) {
            // Reconnect once on broken pipe
            if let Ok(mut new_client) = DiscordClient::connect(client_id.as_deref()) {
                let _ = new_client.set_activity(&activity);
                *guard = Some(new_client);
            } else {
                *guard = None;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn clear_discord_activity_cmd(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Discord state poisoned".to_string())?;
    if let Some(ref mut client) = *guard {
        let _ = client.clear_activity();
    }
    Ok(())
}
