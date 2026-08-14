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
use torrent::{DownloadTask, StreamEngine, StreamInfo, TorrentAddResult, TorrentFileItem};

pub struct AppState {
    pub engine: Arc<StreamEngine>,
}

#[tauri::command]
fn app_minimize_cmd(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn app_toggle_maximize_cmd(window: Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
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
    media_type: String,
    anilist_id: Option<u64>,
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
async fn select_directory_cmd(title: Option<String>, default_path: Option<String>) -> Option<String> {
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            let download_dir = app
                .path()
                .download_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let engine = tauri::async_runtime::block_on(StreamEngine::new(download_dir))?;
            app.manage(AppState {
                engine: Arc::new(engine),
            });
            app.manage(MpvState(std::sync::Mutex::new(None)));
            app.manage(DiscordState(std::sync::Mutex::new(None)));
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
