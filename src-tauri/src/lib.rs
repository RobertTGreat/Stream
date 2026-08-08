mod indexers;
mod library;
mod mpv;
mod torrent;

use indexers::{search_all_providers, TorrentSearchResult};
use library::{scan_folder, LocalMediaItem};
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
fn app_close_cmd(window: Window) {
    let _ = window.close();
}

#[tauri::command(rename_all = "snake_case")]
fn scan_library(path: String, media_type: String) -> Vec<LocalMediaItem> {
    scan_folder(&path, &media_type)
}

#[tauri::command(rename_all = "snake_case")]
async fn search_torrents_cmd(
    query: String,
    media_type: String,
    anilist_id: Option<u64>,
) -> Vec<TorrentSearchResult> {
    search_all_providers(&query, &media_type, anilist_id).await
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
fn get_download_queue_cmd(state: State<'_, AppState>) -> Vec<DownloadTask> {
    state.engine.list_tasks()
}

#[tauri::command(rename_all = "snake_case")]
async fn start_torrent_stream_cmd(
    state: State<'_, AppState>,
    title: String,
    media_type: String,
    magnet_link: String,
    file_index: Option<u32>,
    save_path: String,
) -> Result<StreamInfo, String> {
    state
        .engine
        .start_stream(title, media_type, magnet_link, file_index, save_path)
        .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
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
            mpv_play_cmd,
            mpv_command_cmd,
            mpv_get_properties_cmd,
            mpv_get_tracks_cmd,
            mpv_is_running_cmd,
            mpv_stop_cmd,
            mpv_resize_cmd,
            mpv_log_tail_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running stream application");
}
