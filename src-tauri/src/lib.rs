mod discord;
mod indexers;
mod library;
mod mpv;
mod torrent;

use discord::{clear_discord_activity_cmd, set_discord_activity_cmd, DiscordState};
use indexers::{search_all_providers, SearchOptions, TorrentSearchResult};
use library::{scan_folder, ScanLibraryResult};
use mpv::{
    mpv_command_cmd, mpv_get_properties_cmd, mpv_get_tracks_cmd, mpv_is_running_cmd, mpv_log_tail_cmd, mpv_play_cmd,
    mpv_resize_cmd, mpv_stop_cmd, MpvState,
};
use std::sync::Arc;
use tauri::{Manager, State, Window};
use tauri_plugin_android_player::{AndroidPlayerExt, PlayerState};
use torrent::{DownloadStatus, DownloadTask, StreamEngine, StreamInfo, TorrentAddResult, TorrentFileItem};

pub struct AppState {
    pub engine: Arc<StreamEngine>,
}

#[tauri::command]
fn app_minimize_cmd(window: Window) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = window.minimize();
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = window;
    }
}

#[tauri::command]
fn app_toggle_maximize_cmd(window: Window) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Ok(is_max) = window.is_maximized() {
            if is_max {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = window;
    }
}

#[tauri::command]
fn app_close_cmd(window: Window, mpv_state: State<'_, MpvState>) {
    if let Ok(mut guard) = mpv_state.0.lock() {
        if let Some(mut session) = guard.take() {
            session.stop();
        }
    }
    let _ = window.close();
}

#[tauri::command(rename_all = "snake_case")]
fn scan_library(path: String, media_type: String) -> ScanLibraryResult {
    scan_folder(&path, &media_type)
}

#[tauri::command(rename_all = "snake_case")]
async fn search_torrents_cmd(
    query: String,
    title: Option<String>,
    media_type: String,
    anilist_id: Option<u64>,
    tmdb_id: Option<u64>,
    imdb_id: Option<String>,
    year: Option<u32>,
    season: Option<u32>,
    episode: Option<u32>,
    enable_nyaa: Option<bool>,
    enable_animetosho: Option<bool>,
    enable_seadex: Option<bool>,
    enable_torrentio: Option<bool>,
    enable_yts: Option<bool>,
    enable_eztv: Option<bool>,
    enable_subsplease: Option<bool>,
    enable_piratebay: Option<bool>,
    enable_jackett: Option<bool>,
    enable_prowlarr: Option<bool>,
    nyaa_url: Option<String>,
    jackett_url: Option<String>,
    jackett_api_key: Option<String>,
    prowlarr_url: Option<String>,
    prowlarr_api_key: Option<String>,
    seadex_best_only: Option<bool>,
) -> Vec<TorrentSearchResult> {
    let defaults = SearchOptions::default();
    search_all_providers(
        &query,
        &media_type,
        anilist_id,
        SearchOptions {
            title,
            tmdb_id,
            imdb_id,
            year,
            season,
            episode,
            enable_nyaa: enable_nyaa.unwrap_or(defaults.enable_nyaa),
            enable_animetosho: enable_animetosho.unwrap_or(defaults.enable_animetosho),
            enable_seadex: enable_seadex.unwrap_or(defaults.enable_seadex),
            enable_torrentio: enable_torrentio.unwrap_or(defaults.enable_torrentio),
            enable_yts: enable_yts.unwrap_or(defaults.enable_yts),
            enable_eztv: enable_eztv.unwrap_or(defaults.enable_eztv),
            enable_subsplease: enable_subsplease.unwrap_or(defaults.enable_subsplease),
            enable_piratebay: enable_piratebay.unwrap_or(defaults.enable_piratebay),
            enable_jackett: enable_jackett.unwrap_or(defaults.enable_jackett),
            enable_prowlarr: enable_prowlarr.unwrap_or(defaults.enable_prowlarr),
            nyaa_url: nyaa_url.unwrap_or(defaults.nyaa_url),
            jackett_url: jackett_url.unwrap_or(defaults.jackett_url),
            jackett_api_key: jackett_api_key.unwrap_or(defaults.jackett_api_key),
            prowlarr_url: prowlarr_url.unwrap_or(defaults.prowlarr_url),
            prowlarr_api_key: prowlarr_api_key.unwrap_or(defaults.prowlarr_api_key),
            seadex_best_only: seadex_best_only.unwrap_or(defaults.seadex_best_only),
        },
    )
    .await
}

#[tauri::command(rename_all = "snake_case")]
async fn add_magnet_cmd(
    state: State<'_, AppState>,
    magnet_link: String,
    title: String,
    media_type: String,
    save_path: String,
) -> Result<TorrentAddResult, String> {
    state
        .engine
        .add_magnet(magnet_link, title, media_type, save_path)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn start_download_cmd(
    state: State<'_, AppState>,
    title: String,
    media_type: String,
    magnet_link: String,
    save_path: String,
    seeders: u32,
    peers: u32,
) -> Result<DownloadTask, String> {
    state
        .engine
        .add_download(title, media_type, magnet_link, save_path, seeders, peers)
        .await
}

#[tauri::command(rename_all = "snake_case")]
async fn list_torrent_files_cmd(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<TorrentFileItem>, String> {
    state.engine.list_files(&id)
}

#[tauri::command(rename_all = "snake_case")]
async fn pause_download_cmd(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.engine.pause(&id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn resume_download_cmd(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.engine.resume(&id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn cancel_download_cmd(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.engine.cancel(&id).await
}

#[tauri::command(rename_all = "snake_case")]
async fn configure_engine_cmd(
    state: State<'_, AppState>,
    max_concurrent: Option<u32>,
    speed_limit_mbps: Option<f64>,
) -> Result<bool, String> {
    state.engine.configure(max_concurrent, speed_limit_mbps);
    Ok(true)
}

#[tauri::command(rename_all = "snake_case")]
async fn get_download_queue_cmd(state: State<'_, AppState>) -> Result<Vec<DownloadTask>, String> {
    let engine = state.engine.clone();
    tokio::task::spawn_blocking(move || engine.list_tasks())
        .await
        .map_err(|e| format!("Failed to list download tasks: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
async fn start_torrent_stream_cmd(
    state: State<'_, AppState>,
    title: String,
    media_type: String,
    magnet_link: String,
    file_index: Option<u32>,
    save_path: String,
    season: Option<u32>,
    episode: Option<u32>,
) -> Result<StreamInfo, String> {
    state
        .engine
        .start_stream(
            title,
            media_type,
            magnet_link,
            file_index,
            save_path,
            season,
            episode,
        )
        .await
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HealthCheckResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[tauri::command(rename_all = "snake_case")]
fn android_player_play_cmd(app: tauri::AppHandle, url: String, start_at: Option<f64>) -> Result<(), String> {
    app.android_player().play(url, start_at)
}

#[tauri::command]
fn android_player_pause_cmd(app: tauri::AppHandle) -> Result<(), String> {
    app.android_player().pause()
}

#[tauri::command]
fn android_player_resume_cmd(app: tauri::AppHandle) -> Result<(), String> {
    app.android_player().resume()
}

#[tauri::command]
fn android_player_toggle_cmd(app: tauri::AppHandle) -> Result<(), String> {
    app.android_player().toggle_pause()
}

#[tauri::command]
fn android_player_stop_cmd(app: tauri::AppHandle) -> Result<(), String> {
    app.android_player().stop()
}

#[tauri::command(rename_all = "snake_case")]
fn android_player_seek_cmd(app: tauri::AppHandle, position: f64) -> Result<(), String> {
    app.android_player().seek(position)
}

#[tauri::command(rename_all = "snake_case")]
fn android_player_set_speed_cmd(app: tauri::AppHandle, speed: f64) -> Result<(), String> {
    app.android_player().set_speed(speed)
}

#[tauri::command]
fn android_player_get_state_cmd(app: tauri::AppHandle) -> Result<PlayerState, String> {
    app.android_player().get_state()
}

#[tauri::command(rename_all = "snake_case")]
async fn select_directory_cmd(title: Option<String>, default_path: Option<String>) -> Option<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (title, default_path);
        None
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        tokio::task::spawn_blocking(move || {
            let mut dialog = rfd::FileDialog::new();
            if let Some(t) = title {
                dialog = dialog.set_title(&t);
            }
            if let Some(p) = default_path {
                dialog = dialog.set_directory(&p);
            }
            dialog.pick_folder().map(|p| p.to_string_lossy().to_string())
        })
        .await
        .ok()
        .flatten()
    }
}

#[tauri::command(rename_all = "snake_case")]
async fn check_indexer_health_cmd(
    url: String,
    api_key: Option<String>,
    indexer_type: String,
) -> HealthCheckResult {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .unwrap_or_default();

    let start = std::time::Instant::now();
    let trimmed_url = url.trim().trim_end_matches('/');

    let key_ref = api_key.as_deref().unwrap_or_default();
    let test_url = match indexer_type.as_str() {
        "jackett" => {
            format!("{trimmed_url}/api/v2.0/indexers/all/results/torznab/api?apikey={key_ref}&t=caps")
        }
        "prowlarr" => {
            format!("{trimmed_url}/api/v1/health?apikey={key_ref}")
        }
        "tmdb" => {
            if key_ref.starts_with("eyJ") {
                "https://api.themoviedb.org/3/authentication".to_string()
            } else {
                format!("https://api.themoviedb.org/3/authentication?api_key={key_ref}")
            }
        }
        _ => trimmed_url.to_string(),
    };

    let mut req = client.get(&test_url);
    if indexer_type == "tmdb" && key_ref.starts_with("eyJ") {
        req = req.header("Authorization", format!("Bearer {key_ref}"));
    }

    match req.send().await {
        Ok(resp) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            if resp.status().is_success() {
                HealthCheckResult {
                    ok: true,
                    latency_ms,
                    message: format!("Connected (HTTP {}, {}ms)", resp.status().as_u16(), latency_ms),
                }
            } else {
                HealthCheckResult {
                    ok: false,
                    latency_ms,
                    message: format!("HTTP {}: {}", resp.status().as_u16(), resp.status().canonical_reason().unwrap_or("Failed")),
                }
            }
        }
        Err(e) => HealthCheckResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            message: format!("Connection failed: {e}"),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_android_player::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                if let Some(mpv_state) = window.try_state::<MpvState>() {
                    if let Ok(mut guard) = mpv_state.0.lock() {
                        if let Some(mut session) = guard.take() {
                            session.stop();
                        }
                    }
                }
            }
        })
        .setup(|app| {
            let download_dir = {
                #[cfg(target_os = "android")]
                {
                    app.path()
                        .app_data_dir()
                        .or_else(|_| app.path().app_cache_dir())
                        .unwrap_or_else(|_| std::env::temp_dir())
                        .join("downloads")
                }
                #[cfg(not(target_os = "android"))]
                {
                    app.path()
                        .download_dir()
                        .unwrap_or_else(|_| std::env::temp_dir())
                }
            };
            let engine = Arc::new(tauri::async_runtime::block_on(StreamEngine::new(download_dir))?);
            app.manage(AppState {
                engine: engine.clone(),
            });
            app.manage(MpvState(std::sync::Mutex::new(None)));
            app.manage(DiscordState(std::sync::Mutex::new(None)));
            #[cfg(target_os = "android")]
            start_android_download_notifier(app.handle().clone(), engine);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_minimize_cmd,
            app_toggle_maximize_cmd,
            app_close_cmd,
            scan_library,
            search_torrents_cmd,
            add_magnet_cmd,
            start_download_cmd,
            list_torrent_files_cmd,
            pause_download_cmd,
            resume_download_cmd,
            cancel_download_cmd,
            get_download_queue_cmd,
            start_torrent_stream_cmd,
            configure_engine_cmd,
            select_directory_cmd,
            android_player_play_cmd,
            android_player_pause_cmd,
            android_player_resume_cmd,
            android_player_toggle_cmd,
            android_player_stop_cmd,
            android_player_seek_cmd,
            android_player_set_speed_cmd,
            android_player_get_state_cmd,
            check_indexer_health_cmd,
            mpv_play_cmd,
            mpv_command_cmd,
            mpv_get_properties_cmd,
            mpv_get_tracks_cmd,
            mpv_is_running_cmd,
            mpv_stop_cmd,
            mpv_resize_cmd,
            mpv_log_tail_cmd,
            set_discord_activity_cmd,
            clear_discord_activity_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running stream application");
}

fn format_bytes_short(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

fn format_speed(bps: u64) -> String {
    if bps >= 1_000_000 {
        format!("{:.1} MB/s", bps as f64 / 1_000_000.0)
    } else if bps >= 1000 {
        format!("{:.0} KB/s", bps as f64 / 1000.0)
    } else {
        format!("{bps} B/s")
    }
}

fn format_eta(seconds: u64) -> String {
    if seconds == 0 {
        return "…".to_string();
    }
    if seconds >= 3600 {
        format!("{}h {:02}m", seconds / 3600, (seconds % 3600) / 60)
    } else if seconds >= 60 {
        format!("{}m", seconds / 60)
    } else {
        format!("{seconds}s")
    }
}

fn clean_notification_title(raw: &str) -> String {
    let mut title = raw.trim().to_string();
    if title.starts_with('[') {
        if let Some(end) = title.find(']') {
            title = title[end + 1..].trim().to_string();
        }
    }
    title = title.replace('.', " ");
    for token in [
        "1080p", "720p", "2160p", "480p", "4k", "uhd", "webrip", "web-dl", "bluray",
        "blu-ray", "x264", "x265", "h264", "h265", "hevc", "av1", "aac", "dts",
        "hdr", "hdr10", "dv", "remux", "proper", "repack",
    ] {
        let re = regex::Regex::new(&format!(r"(?i)\b{}\b", regex::escape(token))).ok();
        if let Some(re) = re {
            title = re.replace_all(&title, " ").into_owned();
        }
    }
    title = regex::Regex::new(r"(?i)\bS\d{1,2}E\d{1,2}\b")
        .ok()
        .map(|re| re.replace_all(&title, " ").into_owned())
        .unwrap_or(title);
    title = regex::Regex::new(r"\s+")
        .ok()
        .map(|re| re.replace_all(&title, " ").into_owned())
        .unwrap_or(title);
    let cleaned = title.trim().trim_matches('-').trim().to_string();
    if cleaned.is_empty() {
        raw.trim().to_string()
    } else {
        cleaned
    }
}

fn summarize_download_notification(tasks: &[DownloadTask]) -> Option<(String, String, i32, bool, bool)> {
    let active: Vec<&DownloadTask> = tasks
        .iter()
        .filter(|t| {
            matches!(
                t.status,
                DownloadStatus::Downloading | DownloadStatus::Streaming | DownloadStatus::Queued
            )
        })
        .collect();
    if active.is_empty() {
        return None;
    }

    let count = active.len();
    let primary = active
        .iter()
        .max_by(|a, b| {
            a.download_speed_bps
                .cmp(&b.download_speed_bps)
                .then_with(|| {
                    (a.progress as i32).cmp(&(b.progress as i32))
                })
        })
        .copied()
        .unwrap_or(active[0]);
    let progress = if count == 1 {
        primary.progress.round() as i32
    } else {
        (active.iter().map(|t| t.progress as f64).sum::<f64>() / count as f64).round() as i32
    };
    let pretty = clean_notification_title(&primary.title);
    let title = if count == 1 {
        pretty.clone()
    } else {
        format!("{} downloads", count)
    };
    let size = if primary.total_bytes > 0 {
        format!(
            "{} / {}",
            format_bytes_short(primary.downloaded_bytes),
            format_bytes_short(primary.total_bytes)
        )
    } else {
        format_bytes_short(primary.downloaded_bytes)
    };
    let text = if matches!(primary.status, DownloadStatus::Queued) {
        if count == 1 {
            "Waiting for peers…".to_string()
        } else {
            format!("{} queued · {}", count, pretty)
        }
    } else if count == 1 {
        format!(
            "{}% · {} · {} · ETA {}",
            progress.max(0),
            size,
            format_speed(primary.download_speed_bps),
            format_eta(primary.eta_seconds)
        )
    } else {
        format!(
            "{}% · {} · {}",
            progress.max(0),
            format_speed(primary.download_speed_bps),
            pretty
        )
    };
    let indeterminate = matches!(primary.status, DownloadStatus::Queued) || primary.total_bytes == 0;
    Some((title, text, progress.clamp(0, 100), indeterminate, true))
}

#[cfg(target_os = "android")]
fn start_android_download_notifier<R: tauri::Runtime>(app: tauri::AppHandle<R>, engine: Arc<StreamEngine>) {
    tauri::async_runtime::spawn(async move {
        let mut last_signature = String::new();
        let mut showing = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let tasks = engine.list_tasks();
            let summary = summarize_download_notification(&tasks);
            let signature = match &summary {
                Some((title, text, progress, indeterminate, _)) => {
                    format!("{title}|{text}|{progress}|{indeterminate}")
                }
                None => String::new(),
            };
            if signature == last_signature {
                continue;
            }
            last_signature = signature;
            let player = app.android_player();
            let result = if let Some((title, text, progress, indeterminate, ongoing)) = summary {
                showing = true;
                player.update_download_notification(
                    title,
                    text,
                    progress,
                    indeterminate,
                    ongoing,
                    false,
                )
            } else if showing {
                showing = false;
                player.update_download_notification(
                    String::new(),
                    String::new(),
                    0,
                    false,
                    false,
                    true,
                )
            } else {
                Ok(())
            };
            if let Err(err) = result {
                eprintln!("download notification update failed: {err}");
            }
        }
    });
}
