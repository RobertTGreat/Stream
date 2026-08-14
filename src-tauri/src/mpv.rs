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
    stopped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpvTrack {
    pub id: i64,
    pub track_type: String,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub selected: bool,
}

impl MpvSession {
    fn spawn(
        mpv_path: &std::path::Path,
        title: &str,
        url: Option<&str>,
        start_at: Option<f64>,
        hardware_acceleration: bool,
        default_subtitles: Option<&str>,
    ) -> Result<Self, String> {
        let ipc_path = create_playback_ipc_path();
        let log_path = create_playback_log_path();

        let mut command = Command::new(mpv_path);
        command
            .arg(format!("--input-ipc-server={ipc_path}"))
            .arg(format!("--log-file={}", log_path.display()))
            .arg("--idle=once")
            .arg("--force-window=yes")
            .arg("--osc=no")
            .arg("--osd-bar=no")
            .arg("--osd-level=1")
            .arg("--input-cursor=yes")
            .arg("--cursor-autohide=2500")
            .arg("--cursor-autohide-fs-only=no")
            .arg("--border=yes")
            .arg("--ontop=no")
            .arg("--show-in-taskbar=yes")
            .arg("--taskbar-progress=yes")
            .arg("--autofit-larger=85%x85%")
            .arg("--input-default-bindings=yes")
            .arg("--keep-open=yes")
            .arg(format!("--title={title}"))
            .arg("--no-terminal")
            .arg("--ytdl=no")
            .arg("--force-seekable=yes")
            .arg("--hr-seek=yes")
            .arg(if hardware_acceleration {
                "--hwdec=auto-safe"
            } else {
                "--hwdec=no"
            })
            .arg("--sub-auto=all")
            .arg("--sub-file-paths=sub:subtitles:subs")
            .arg(format!(
                "--slang={}",
                subtitle_langs(default_subtitles)
            ))
            .arg("--alang=jpn,ja,eng,en")
            .arg("--sid=auto")
            .arg("--cache=yes")
            .arg("--cache-pause=yes")
            .arg("--cache-pause-initial=yes")
            .arg("--cache-pause-wait=3")
            .arg("--demuxer-max-bytes=150M")
            .arg("--demuxer-readahead-secs=60")
            .arg("--stream-buffer-size=512KiB");

        if let Some(script) = stream_gui_script() {
            command.arg(format!("--script={}", script.display()));
        }

        if let Some(start) = start_at.filter(|t| *t > 5.0) {
            command.arg(format!("--start={start}"));
        }

        if let Some(u) = url {
            command.arg("--");
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
            stopped: false,
        })
    }

    pub fn stop(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;

        // If process already exited on its own, return immediately
        if let Ok(Some(_)) = self.process.try_wait() {
            return;
        }

        // Fast quit dispatch to MPV without waiting or retrying
        send_mpv_fire_and_forget(&self.ipc_path, json!(["quit"]));

        // Brief 50ms grace period for graceful process exit
        let deadline = Instant::now() + Duration::from_millis(50);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.process.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }

        // Clean termination
        let _ = self.process.kill();
        let _ = self.process.try_wait();
    }
}

impl Drop for MpvSession {
    fn drop(&mut self) {
        self.stop();
    }
}

#[tauri::command]
pub async fn mpv_play_cmd(
    state: State<'_, MpvState>,
    url: String,
    title: Option<String>,
    start_at: Option<f64>,
    hardware_acceleration: Option<bool>,
    default_subtitles: Option<String>,
) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("No media path or stream URL was provided.".to_string());
    }

    let mpv_path = locate_mpv().ok_or_else(|| {
        "mpv was not found. Install mpv and make sure mpv.exe is on PATH.".to_string()
    })?;
    let display_title = title.unwrap_or_else(|| "Stream Playback".to_string());

    let previous = {
        let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
        guard.take()
    };
    if let Some(mut previous) = previous {
        tokio::task::spawn_blocking(move || previous.stop())
            .await
            .ok();
    }

    let use_hwdec = hardware_acceleration.unwrap_or(true);
    let session = tokio::task::spawn_blocking(move || {
        let session = MpvSession::spawn(
            &mpv_path,
            &display_title,
            Some(&url),
            start_at,
            use_hwdec,
            default_subtitles.as_deref(),
        )?;
        if let Some(start) = start_at.filter(|t| *t > 5.0) {
            let _ = wait_for_mpv_ipc(&session.ipc_path);
            seek_when_ready(&session.ipc_path, start);
        }
        Ok::<_, String>(session)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
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
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active mpv session.".to_string())?;
        session.ipc_path.clone()
    };

    tokio::task::spawn_blocking(move || mpv_command_with_response(&ipc_path, json!(command)))
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
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active mpv session.".to_string())?;
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
        let session = guard
            .as_ref()
            .ok_or_else(|| "No active mpv session.".to_string())?;
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
                let selected = item
                    .get("selected")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

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
pub async fn mpv_stop_cmd(
    state: State<'_, MpvState>,
    window: Window,
) -> Result<(), String> {
    let previous = {
        let mut guard = state.0.lock().map_err(|_| "mpv state poisoned".to_string())?;
        guard.take()
    };
    if let Some(mut previous) = previous {
        tokio::task::spawn_blocking(move || previous.stop())
            .await
            .ok();
    }
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn mpv_is_running_cmd(state: State<'_, MpvState>) -> bool {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(ref mut session) = *guard {
            match session.process.try_wait() {
                Ok(Some(_)) => false,
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
pub fn mpv_resize_cmd() -> Result<(), String> {
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

fn subtitle_langs(pref: Option<&str>) -> String {
    let fallback = "eng,en,fre,spa,ger,jpn,ja";
    let Some(raw) = pref.map(str::trim).filter(|s| !s.is_empty()) else {
        return fallback.to_string();
    };
    let normalized = raw.to_ascii_lowercase();
    let token = match normalized.as_str() {
        "english" | "en" | "eng" => "eng,en",
        "japanese" | "ja" | "jpn" | "jp" => "jpn,ja",
        "spanish" | "es" | "spa" => "spa,es",
        "french" | "fr" | "fre" | "fra" => "fre,fr",
        "german" | "de" | "ger" | "deu" => "ger,de",
        _ => raw,
    };
    format!("{token},{fallback}")
}

fn stream_gui_script() -> Option<PathBuf> {
    const EMBEDDED_SCRIPT: &str = include_str!("../scripts/stream-gui.lua");

    let temp_script = std::env::temp_dir().join("stream-mpv-gui.lua");
    if fs::write(&temp_script, EMBEDDED_SCRIPT).is_ok() {
        return Some(temp_script);
    }

    let mut candidates = Vec::new();
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("scripts").join("stream-gui.lua"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("scripts").join("stream-gui.lua"));
            candidates.push(dir.join("stream-gui.lua"));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn wait_for_mpv_ipc(ipc_path: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if open_mpv_ipc_stream(ipc_path).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(40));
    }
    Err("Timed out waiting for mpv IPC".to_string())
}

fn seek_when_ready(ipc_path: &str, start_at: f64) {
    for _ in 0..40 {
        let props = read_mpv_properties(
            ipc_path,
            &["duration".to_string(), "seekable".to_string(), "time-pos".to_string()],
        );
        let ready = props.as_ref().is_some_and(|p| {
            let duration_ok = p.get("duration").and_then(Value::as_f64).unwrap_or(0.0) > start_at;
            let seekable = p.get("seekable").and_then(Value::as_bool).unwrap_or(false);
            let has_pos = p.get("time-pos").and_then(Value::as_f64).is_some();
            duration_ok || seekable || has_pos
        });
        if ready {
            let _ = mpv_command_with_response(ipc_path, json!(["seek", start_at, "absolute"]));
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let _ = mpv_command_with_response(ipc_path, json!(["seek", start_at, "absolute"]));
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
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(ipc_path)
        .map_err(|error| format!("Could not open mpv IPC pipe: {error}"))
}

fn send_mpv_fire_and_forget(ipc_path: &str, command: Value) {
    if let Ok(mut ipc_stream) = open_mpv_ipc_stream(ipc_path) {
        let payload = json!({ "command": command }).to_string();
        let _ = ipc_stream.write_all(payload.as_bytes());
        let _ = ipc_stream.write_all(b"\n");
        let _ = ipc_stream.flush();
    }
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
        if reader
            .read_line(&mut response_line)
            .map_err(|e| e.to_string())?
            == 0
        {
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

        if ipc_stream.write_all(payload.as_bytes()).is_err() || ipc_stream.write_all(b"\n").is_err()
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

fn hide_child_process_window(_command: &mut Command) {}
