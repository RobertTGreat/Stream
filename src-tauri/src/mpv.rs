use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{State, Window};

pub struct MpvState(pub Mutex<Option<MpvSession>>);

pub struct MpvSession {
    process: Child,
    ipc_path: String,
    log_path: PathBuf,
    _host_window_id: Option<isize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpvTrack {
    pub id: i64,
    pub track_type: String, // "video", "audio", "sub"
    pub title: Option<String>,
    pub lang: Option<String>,
    pub selected: bool,
}

impl MpvSession {
    fn spawn(
        mpv_path: &std::path::Path,
        host_window_id: Option<isize>,
        title: &str,
        url: Option<&str>,
    ) -> Result<Self, String> {
        let ipc_path = create_playback_ipc_path();
        let log_path = create_playback_log_path();

        let mut command = Command::new(mpv_path);
        command
            .arg(format!("--input-ipc-server={ipc_path}"))
            .arg(format!("--log-file={}", log_path.display()))
            .arg("--idle=yes")
            .arg("--force-window=yes")
            .arg("--osc=yes")
            .arg("--script-opts=osc-layout=bottombar,osc-seekbarstyle=bar")
            .arg("--border=yes")
            .arg("--show-in-taskbar=yes")
            .arg("--taskbar-progress=yes")
            .arg("--autofit-larger=85%x85%")
            .arg("--keep-open=yes")
            .arg(format!("--title={title}"))
            .arg("--no-terminal")
            .arg("--really-quiet")
            .arg("--hwdec=auto-safe")
            .arg("--input-default-bindings=yes")
            .arg("--cache=yes")
            .arg("--cache-pause=yes")
            .arg("--cache-pause-initial=yes")
            .arg("--cache-pause-wait=3")
            .arg("--demuxer-max-bytes=150M")
            .arg("--demuxer-readahead-secs=60")
            .arg("--stream-buffer-size=512KiB");

        if let Some(u) = url {
            command.arg(u);
        }

        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_child_process_window(&mut command);

        let process = command
            .spawn()
            .map_err(|error| format!("Could not start mpv playback engine: {error}"))?;

        Ok(Self {
            process,
            ipc_path,
            log_path,
            _host_window_id: host_window_id,
        })
    }

    pub fn kill(&mut self) {
        let _ = self.process.kill();
        let _ = self.process.wait();
    }

    fn stop(mut self) {
        self.kill();
    }
}

#[tauri::command]
pub async fn mpv_play_cmd(
    state: State<'_, MpvState>,
    window: Window,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    let mpv_path = locate_mpv().ok_or_else(|| {
        "mpv executable was not found. Please install mpv or place mpv.exe in system PATH."
            .to_string()
    })?;

    let host_window_id = window.hwnd().map(|h| h.0 as isize).ok();
    let display_title = title.unwrap_or_else(|| "Stream Playback".to_string());

    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
    if let Some(existing) = guard.take() {
        existing.stop();
    }

    let session = MpvSession::spawn(
        &mpv_path,
        host_window_id,
        &display_title,
        Some(&url),
    )?;

    *guard = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn mpv_command_cmd(
    state: State<'_, MpvState>,
    command: Vec<Value>,
) -> Result<Value, String> {
    let ipc_path = {
        let guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
        let session = guard.as_ref().ok_or_else(|| "No active mpv session.".to_string())?;
        session.ipc_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        mpv_command_with_response(&ipc_path, json!(command))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mpv_get_properties_cmd(
    state: State<'_, MpvState>,
    names: Vec<String>,
) -> Result<HashMap<String, Value>, String> {
    let ipc_path = {
        let guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
        let session = guard.as_ref().ok_or_else(|| "No active mpv session.".to_string())?;
        session.ipc_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        read_mpv_properties(&ipc_path, &names)
            .ok_or_else(|| "Could not read mpv property state.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mpv_get_tracks_cmd(state: State<'_, MpvState>) -> Result<Vec<MpvTrack>, String> {
    let ipc_path = {
        let guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
        let session = guard.as_ref().ok_or_else(|| "No active mpv session.".to_string())?;
        session.ipc_path.clone()
    };

    tokio::task::spawn_blocking(move || {
        let res = mpv_command_with_response(&ipc_path, json!(["get_property", "track-list"]))?;
        let data = res.get("data").cloned().unwrap_or(Value::Array(vec![]));

        let mut tracks = Vec::new();
        if let Value::Array(items) = data {
            for item in items {
                let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                let track_type = item
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let title = item.get("title").and_then(|v| v.as_str()).map(String::from);
                let lang = item.get("lang").and_then(|v| v.as_str()).map(String::from);
                let selected = item.get("selected").and_then(|v| v.as_bool()).unwrap_or(false);

                if !track_type.is_empty() {
                    tracks.push(MpvTrack {
                        id,
                        track_type,
                        title,
                        lang,
                        selected,
                    });
                }
            }
        }
        Ok(tracks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn mpv_stop_cmd(state: State<'_, MpvState>) -> Result<(), String> {
    stop_existing_session(&state);
    Ok(())
}

#[tauri::command]
pub fn mpv_is_running_cmd(state: State<'_, MpvState>) -> bool {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(ref mut session) = *guard {
            match session.process.try_wait() {
                Ok(Some(_status)) => false,
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            false
        }
    } else {
        false
    }
}

#[tauri::command]
pub fn mpv_resize_cmd(
    _state: State<'_, MpvState>,
    _window: Window,
    _width: f64,
    _height: f64,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn mpv_log_tail_cmd(state: State<'_, MpvState>, lines: usize) -> Result<String, String> {
    let session = current_session(&state)?;
    let session = session
        .as_ref()
        .ok_or_else(|| "No active mpv session.".to_string())?;
    log_tail(&session.log_path, lines).ok_or_else(|| "No mpv log available.".to_string())
}

fn stop_existing_session(state: &State<'_, MpvState>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(session) = guard.take() {
            session.stop();
        }
    }
}

fn current_session<'a>(
    state: &'a State<'_, MpvState>,
) -> Result<std::sync::MutexGuard<'a, Option<MpvSession>>, String> {
    let guard = state
        .0
        .lock()
        .map_err(|_| "mpv state poisoned".to_string())?;
    if guard.is_none() {
        return Err("No active mpv session.".to_string());
    }
    Ok(guard)
}

fn locate_mpv() -> Option<PathBuf> {
    bundled_mpv_candidates()
        .into_iter()
        .chain(path_mpv_candidates())
        .find(|candidate| candidate.is_file())
}

fn bundled_mpv_candidates() -> Vec<PathBuf> {
    let mut base_directories = Vec::new();

    if let Ok(current_executable_path) = std::env::current_exe() {
        if let Some(executable_directory) = current_executable_path.parent() {
            base_directories.push(executable_directory.to_path_buf());
        }
    }
    base_directories.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));

    let executable_name = if cfg!(target_os = "windows") {
        "mpv.exe"
    } else {
        "mpv"
    };

    base_directories
        .into_iter()
        .flat_map(|base_directory| {
            [
                base_directory.join(executable_name),
                base_directory
                    .join("tools")
                    .join("mpv")
                    .join(executable_name),
                base_directory.join("bin").join(executable_name),
            ]
        })
        .collect()
}

fn path_mpv_candidates() -> Vec<PathBuf> {
    let executable_name = if cfg!(target_os = "windows") {
        "mpv.exe"
    } else {
        "mpv"
    };

    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|path_value| std::env::split_paths(&path_value).collect::<Vec<_>>())
        .map(|path_directory| path_directory.join(executable_name))
        .collect()
}

fn create_playback_ipc_path() -> String {
    let timestamp_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();

    if cfg!(target_os = "windows") {
        format!(
            r"\\.\pipe\stream-mpv-{}-{timestamp_millis}",
            std::process::id()
        )
    } else {
        std::env::temp_dir()
            .join(format!(
                "stream-mpv-{}-{timestamp_millis}.sock",
                std::process::id()
            ))
            .display()
            .to_string()
    }
}

fn create_playback_log_path() -> PathBuf {
    let timestamp_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let log_directory = std::env::temp_dir().join("stream-mpv-logs");
    let _ = fs::create_dir_all(&log_directory);

    log_directory.join(format!(
        "stream-mpv-{}-{timestamp_millis}.log",
        std::process::id()
    ))
}

fn open_mpv_ipc_stream(ipc_path: &str) -> Result<std::fs::File, String> {
    for _ in 0..25 {
        if let Ok(file) = OpenOptions::new().read(true).write(true).open(ipc_path) {
            return Ok(file);
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(ipc_path)
        .map_err(|error| format!("Could not open mpv IPC pipe: {error}"))
}

fn _wait_for_mpv_ipc(ipc_path: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if open_mpv_ipc_stream(ipc_path).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    Err("Timed out waiting for mpv IPC server".to_string())
}

fn _send_mpv_ipc_command(ipc_path: &str, command: Value) -> bool {
    let request_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1);

    let payload = json!({
        "command": command,
        "request_id": request_id,
    })
    .to_string();

    for _ in 0..40 {
        if _write_mpv_ipc_payload(ipc_path, &payload) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }

    false
}

fn _write_mpv_ipc_payload(ipc_path: &str, payload: &str) -> bool {
    let Ok(mut ipc_stream) = open_mpv_ipc_stream(ipc_path) else {
        return false;
    };

    ipc_stream.write_all(payload.as_bytes()).is_ok()
        && ipc_stream.write_all(b"\n").is_ok()
        && ipc_stream.flush().is_ok()
}

fn mpv_command_with_response(ipc_path: &str, command: Value) -> Result<Value, String> {
    let mut ipc_stream = open_mpv_ipc_stream(ipc_path)?;

    let request_id: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1);

    let payload = json!({
        "command": command,
        "request_id": request_id,
    })
    .to_string();

    ipc_stream
        .write_all(payload.as_bytes())
        .and_then(|_| ipc_stream.write_all(b"\n"))
        .and_then(|_| ipc_stream.flush())
        .map_err(|error| format!("Could not send mpv command: {error}"))?;

    let mut reader = BufReader::new(ipc_stream);
    for _ in 0..64 {
        let mut response_line = String::new();
        if reader.read_line(&mut response_line).map_err(|e| e.to_string())? == 0 {
            break;
        }
        let response: Value = serde_json::from_str(&response_line)
            .map_err(|error| format!("Invalid mpv IPC response: {error}"))?;
        if response.get("request_id").and_then(Value::as_u64) == Some(request_id) {
            return Ok(response);
        }
    }

    Err("mpv did not respond to the command.".to_string())
}

fn read_mpv_properties(
    ipc_path: &str,
    property_names: &[String],
) -> Option<HashMap<String, Value>> {
    let mut ipc_stream = open_mpv_ipc_stream(ipc_path).ok()?;
    let mut responses = HashMap::new();
    let mut id_to_name = HashMap::new();

    for (idx, property_name) in property_names.iter().enumerate() {
        let req_id = (idx + 1) as u64;
        id_to_name.insert(req_id, property_name.clone());

        let payload = json!({
            "command": ["get_property", property_name],
            "request_id": req_id,
        })
        .to_string();

        if ipc_stream.write_all(payload.as_bytes()).is_err()
            || ipc_stream.write_all(b"\n").is_err()
        {
            return None;
        }
    }

    let _ = ipc_stream.flush();
    let mut reader = BufReader::new(ipc_stream);

    for _ in 0..(property_names.len() * 4) {
        let mut response_line = String::new();
        if reader.read_line(&mut response_line).ok()? == 0 {
            break;
        }
        let Ok(response) = serde_json::from_str::<Value>(&response_line) else {
            continue;
        };
        if response.get("error").and_then(Value::as_str) != Some("success") {
            continue;
        }
        let Some(req_id) = response.get("request_id").and_then(Value::as_u64) else {
            continue;
        };
        if let Some(prop_name) = id_to_name.get(&req_id) {
            if let Some(data) = response.get("data") {
                responses.insert(prop_name.clone(), data.clone());
            }
        }
        if responses.len() == property_names.len() {
            break;
        }
    }

    Some(responses)
}

fn log_tail(log_path: &Path, lines: usize) -> Option<String> {
    let contents = fs::read_to_string(log_path).ok()?;
    let tail: Vec<&str> = contents.lines().rev().take(lines).collect();
    let result = tail
        .iter()
        .rev()
        .map(|line| line.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    if result.trim().is_empty() {
        None
    } else {
        Some(result)
    }
}

#[cfg(target_os = "windows")]
fn hide_child_process_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW_FLAG);
}

#[cfg(not(target_os = "windows"))]
fn hide_child_process_window(_command: &mut Command) {}
