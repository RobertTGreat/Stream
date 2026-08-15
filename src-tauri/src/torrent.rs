use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use librqbit::api::{Api, ApiTorrentListOpts, TorrentDetailsResponse, TorrentIdOrHash};
use librqbit::dht::PersistentDhtConfig;
use librqbit::http_api::HttpApi;
use librqbit::PeerConnectionOptions;
use librqbit::{AddTorrent, AddTorrentOptions, Session, SessionOptions, TorrentStats, TorrentStatsState};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "webm", "mov", "m4v", "flv", "ts", "wmv", "vob", "ogm", "mpg", "mpeg",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentFileItem {
    pub index: usize,
    pub name: String,
    pub length: u64,
    pub is_video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Streaming,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub title: String,
    pub media_type: String, // "anime", "movie", "tv"
    pub magnet_link: String,
    pub save_path: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub progress: f32,           // 0.0 - 100.0
    pub download_speed_bps: u64, // bytes/sec
    pub eta_seconds: u64,
    pub seeders: u32,
    pub peers: u32,
    pub status: DownloadStatus,
    pub created_at: u64,
    pub stream_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub task_id: String,
    pub stream_url: String,
    pub is_ready: bool,
    pub buffered_percent: f32,
    pub title: String,
    pub selected_file_index: usize,
    pub files: Vec<TorrentFileItem>,
    #[serde(default)]
    pub needs_file_pick: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentAddResult {
    pub task_id: String,
    pub title: String,
    pub files: Vec<TorrentFileItem>,
    pub recommended_file_index: usize,
}

#[derive(Clone)]
struct TaskMeta {
    title: String,
    display_title: String,
    media_type: String,
    magnet_link: String,
    seeders: u32,
    peers: u32,
    is_stream: bool,
    stream_file_idx: Option<usize>,
    created_at: u64,
}

pub struct StreamEngine {
    api: Api,
    http_port: u16,
    default_dir: PathBuf,
    meta: Arc<Mutex<HashMap<usize, TaskMeta>>>,
    max_concurrent: Arc<Mutex<u32>>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

const PUBLIC_TRACKERS: &[&str] = &[
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
    "https://tracker.tamersrealm.org:443/announce",
];

fn is_android_unwritable_path(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return true;
    }
    if trimmed.starts_with('~') {
        return true;
    }
    if trimmed.len() >= 2 && trimmed.as_bytes()[1] == b':' {
        return true;
    }
    if trimmed.starts_with('/') && !trimmed.starts_with("/data/") && !trimmed.starts_with("/storage/") {
        return true;
    }
    false
}

fn append_trackers_to_magnet(magnet: &str) -> String {
    let mut result = magnet.to_string();
    for tr in PUBLIC_TRACKERS {
        let tr_encoded = urlencoding::encode(tr);
        if !result.contains(&format!("tr={}", tr_encoded)) {
            result.push_str(&format!("&tr={}", tr_encoded));
        }
    }
    result
}

fn stream_add_opts(output_folder: String, only_files: Option<Vec<usize>>) -> AddTorrentOptions {
    AddTorrentOptions {
        overwrite: true,
        output_folder: Some(output_folder),
        only_files,
        peer_opts: Some(PeerConnectionOptions {
            connect_timeout: Some(Duration::from_secs(4)),
            read_write_timeout: Some(Duration::from_secs(8)),
            keep_alive_interval: Some(Duration::from_secs(15)),
        }),
        force_tracker_interval: Some(Duration::from_secs(20)),
        defer_writes: Some(true),
        trackers: Some(PUBLIC_TRACKERS.iter().map(|t| t.to_string()).collect()),
        ..Default::default()
    }
}

impl StreamEngine {
    pub async fn new(download_dir: PathBuf) -> anyhow::Result<Self> {
        let _ = std::fs::create_dir_all(&download_dir);
        let dht_path = download_dir.join("dht.json");
        let session_opts = SessionOptions {
            fastresume: true,
            concurrent_init_limit: Some(8),
            listen_port_range: Some(42442..42462),
            enable_upnp_port_forwarding: cfg!(not(target_os = "android")),
            defer_writes_up_to: Some(32),
            peer_opts: Some(PeerConnectionOptions {
                connect_timeout: Some(Duration::from_secs(4)),
                read_write_timeout: Some(Duration::from_secs(8)),
                keep_alive_interval: Some(Duration::from_secs(15)),
            }),
            dht_config: Some(PersistentDhtConfig {
                dump_interval: Some(Duration::from_secs(60)),
                config_filename: Some(dht_path),
            }),
            ..Default::default()
        };
        let session = match Session::new_with_opts(download_dir.clone(), session_opts).await {
            Ok(session) => session,
            Err(error) => {
                eprintln!("torrent session init failed ({error:#}); retrying without DHT");
                Session::new_with_opts(
                    download_dir.clone(),
                    SessionOptions {
                        fastresume: true,
                        concurrent_init_limit: Some(8),
                        listen_port_range: Some(42442..42462),
                        enable_upnp_port_forwarding: false,
                        defer_writes_up_to: Some(32),
                        peer_opts: Some(PeerConnectionOptions {
                            connect_timeout: Some(Duration::from_secs(4)),
                            read_write_timeout: Some(Duration::from_secs(8)),
                            keep_alive_interval: Some(Duration::from_secs(15)),
                        }),
                        disable_dht: true,
                        disable_dht_persistence: true,
                        ..Default::default()
                    },
                )
                .await?
            }
        };
        let api = Api::new(session, None, None);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let http_port = listener.local_addr()?.port();

        let http_api = HttpApi::new(api.clone(), None);
        tokio::spawn(http_api.make_http_api_and_run(listener, None));

        Ok(Self {
            api,
            http_port,
            default_dir: download_dir,
            meta: Arc::new(Mutex::new(HashMap::new())),
            max_concurrent: Arc::new(Mutex::new(3)),
        })
    }

    fn resolve_save_path(&self, requested: &str) -> String {
        #[cfg(target_os = "android")]
        {
            let fallback = self.default_dir.to_string_lossy().to_string();
            if is_android_unwritable_path(requested) {
                let _ = std::fs::create_dir_all(&self.default_dir);
                return fallback;
            }
            if std::fs::create_dir_all(requested).is_err() {
                let _ = std::fs::create_dir_all(&self.default_dir);
                return fallback;
            }
            return requested.to_string();
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = requested;
            if requested.trim().is_empty() {
                return self.default_dir.to_string_lossy().to_string();
            }
            requested.to_string()
        }
    }

    pub fn configure(&self, max_concurrent: Option<u32>, speed_limit_mbps: Option<f64>) {
        if let Some(max) = max_concurrent {
            *self.max_concurrent.lock().unwrap() = max.max(1);
            self.enforce_concurrency();
        }
        if let Some(mbps) = speed_limit_mbps {
            let bps = if mbps > 0.0 {
                NonZeroU32::new((mbps * 1_000_000.0) as u32)
            } else {
                None
            };
            self.api.session().ratelimits.set_download_bps(bps);
        }
    }

    fn enforce_concurrency(&self) {
        let max = *self.max_concurrent.lock().unwrap();
        let tasks = self.list_tasks();
        let mut active: Vec<&DownloadTask> = tasks
            .iter()
            .filter(|t| {
                matches!(
                    t.status,
                    DownloadStatus::Downloading | DownloadStatus::Streaming | DownloadStatus::Queued
                )
            })
            .collect();
        active.sort_by_key(|t| t.created_at);
        if active.len() as u32 <= max {
            return;
        }
        for extra in active.iter().skip(max as usize) {
            if extra.status == DownloadStatus::Streaming {
                continue;
            }
            let Ok(tid) = TorrentIdOrHash::parse(&extra.id) else {
                continue;
            };
            let api = self.api.clone();
            tauri::async_runtime::spawn(async move {
                let _ = api.api_torrent_action_pause(tid).await;
            });
        }
    }

    pub fn stream_url(&self, id: usize, file_idx: usize) -> String {
        format!(
            "http://127.0.0.1:{}/torrents/{}/stream/{}",
            self.http_port, id, file_idx
        )
    }

    /// Add a torrent magnet link and inspect its metadata & file contents.
    pub async fn add_magnet(
        &self,
        magnet_link: String,
        title: String,
        media_type: String,
        save_path: String,
    ) -> Result<TorrentAddResult, String> {
        let save_path = self.resolve_save_path(&save_path);
        let augmented_magnet = append_trackers_to_magnet(&magnet_link);
        let opts = stream_add_opts(save_path.clone(), None);

        let add = AddTorrent::from_url(augmented_magnet.as_str());
        let resp = self
            .api
            .api_add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to add torrent magnet: {e:#}"))?;

        let id = resp
            .id
            .ok_or_else(|| "Torrent metadata loaded but no session id was returned.".to_string())?;

        let files = extract_torrent_files(resp.details.files.as_deref().unwrap_or(&[]));
        let recommended_file_index = pick_best_video_file_from_items(&files).unwrap_or(0);
        let torrent_name = resp.details.name.unwrap_or_else(|| title.clone());

        self.meta.lock().unwrap().insert(
            id,
            TaskMeta {
                title: torrent_name.clone(),
                display_title: title,
                media_type,
                magnet_link: augmented_magnet,
                seeders: 0,
                peers: 0,
                is_stream: true,
                stream_file_idx: Some(recommended_file_index),
                created_at: now_secs(),
            },
        );

        Ok(TorrentAddResult {
            task_id: id.to_string(),
            title: torrent_name,
            files,
            recommended_file_index,
        })
    }

    /// Add a torrent once (or reuse it) and return an HTTP stream URL.
    /// If multiple videos exist and no file/episode can be chosen, `needs_file_pick` is set.
    pub async fn start_stream(
        &self,
        title: String,
        media_type: String,
        magnet_link: String,
        file_index: Option<u32>,
        save_path: String,
        season: Option<u32>,
        episode: Option<u32>,
    ) -> Result<StreamInfo, String> {
        if !is_valid_magnet(&magnet_link) && !looks_like_torrent_url(&magnet_link) {
            return Err("Invalid magnet link (missing a valid info hash).".to_string());
        }

        let save_path = self.resolve_save_path(&save_path);
        let augmented_magnet = append_trackers_to_magnet(&magnet_link);
        let hinted_file = file_index.map(|f| f as usize);
        let opts = stream_add_opts(save_path.clone(), hinted_file.map(|idx| vec![idx]));

        let add = AddTorrent::from_url(augmented_magnet.as_str());
        let resp = self
            .api
            .api_add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to start torrent stream: {e:#}"))?;

        let id = resp
            .id
            .ok_or_else(|| "Torrent metadata loaded but no session id was returned.".to_string())?;
        self.wait_until_initialized(id).await?;

        let files = extract_torrent_files(resp.details.files.as_deref().unwrap_or(&[]));
        let video_files: Vec<&TorrentFileItem> = files.iter().filter(|f| f.is_video).collect();
        if video_files.is_empty() {
            return Err("No video files found in torrent".to_string());
        }

        let chosen = file_index
            .map(|f| f as usize)
            .filter(|f| *f < files.len() && files[*f].is_video)
            .or_else(|| pick_episode_file(&files, season, episode))
            .or_else(|| {
                if video_files.len() == 1 || media_type == "movie" || episode.is_none() {
                    video_files
                        .iter()
                        .max_by_key(|f| f.length)
                        .map(|f| f.index)
                } else {
                    None
                }
            });

        let torrent_title = resp.details.name.unwrap_or_else(|| title.clone());
        let created_at = now_secs();

        if let Some(file_idx) = chosen {
            let tid = TorrentIdOrHash::parse(&id.to_string()).map_err(|e| e.to_string())?;
            let only = HashSet::from([file_idx]);
            self.api
                .api_torrent_action_update_only_files(tid, &only)
                .await
                .map_err(|e| format!("Could not select the video file: {e:#}"))?;
            self.api
                .api_stream(tid, file_idx)
                .map_err(|e| format!("Stream is not ready yet: {e:#}"))?;

            self.meta.lock().unwrap().insert(
                id,
                TaskMeta {
                    title: torrent_title.clone(),
                    display_title: title.clone(),
                    media_type,
                    magnet_link: augmented_magnet,
                    seeders: 0,
                    peers: 0,
                    is_stream: true,
                    stream_file_idx: Some(file_idx),
                    created_at,
                },
            );

            return Ok(StreamInfo {
                task_id: id.to_string(),
                stream_url: self.stream_url(id, file_idx),
                is_ready: true,
                buffered_percent: 0.0,
                title: torrent_title,
                selected_file_index: file_idx,
                files,
                needs_file_pick: false,
            });
        }

        self.meta.lock().unwrap().insert(
            id,
            TaskMeta {
                title: torrent_title.clone(),
                display_title: title,
                media_type,
                magnet_link: augmented_magnet,
                seeders: 0,
                peers: 0,
                is_stream: true,
                stream_file_idx: None,
                created_at,
            },
        );

        Ok(StreamInfo {
            task_id: id.to_string(),
            stream_url: String::new(),
            is_ready: false,
            buffered_percent: 0.0,
            title: torrent_title,
            selected_file_index: 0,
            files,
            needs_file_pick: true,
        })
    }

    async fn wait_until_initialized(&self, id: usize) -> Result<(), String> {
        let tid = TorrentIdOrHash::parse(&id.to_string()).map_err(|e| e.to_string())?;
        let handle = self.api.mgr_handle(tid).map_err(|e| e.to_string())?;
        tokio::time::timeout(Duration::from_secs(45), handle.wait_until_initialized())
            .await
            .map_err(|_| {
                "Timed out waiting for torrent metadata. Try another release."
                    .to_string()
            })?
            .map_err(|e| format!("Torrent failed to initialize: {e:#}"))?;

        if handle.live().is_none() {
            let _ = self.api.api_torrent_action_start(tid).await;
        }
        Ok(())
    }

    /// Add a torrent for full background download.
    pub async fn add_download(
        &self,
        title: String,
        media_type: String,
        magnet_link: String,
        save_path: String,
        seeders: u32,
        peers: u32,
    ) -> Result<DownloadTask, String> {
        let save_path = self.resolve_save_path(&save_path);
        let opts = AddTorrentOptions {
            overwrite: true,
            output_folder: Some(save_path.clone()),
            ..Default::default()
        };

        let add = AddTorrent::from_url(magnet_link.as_str());
        let resp = self
            .api
            .api_add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to add torrent download: {e:#}"))?;

        let id = resp
            .id
            .ok_or_else(|| "Torrent is already managed".to_string())?;

        self.meta.lock().unwrap().insert(
            id,
            TaskMeta {
                title: title.clone(),
                display_title: title,
                media_type,
                magnet_link,
                seeders,
                peers,
                is_stream: false,
                stream_file_idx: None,
                created_at: now_secs(),
            },
        );

        self.enforce_concurrency();
        self.list_tasks()
            .into_iter()
            .find(|t| t.id == id.to_string())
            .ok_or_else(|| "Failed to read back download task".to_string())
    }

    pub fn list_files(&self, id: &str) -> Result<Vec<TorrentFileItem>, String> {
        let tid = TorrentIdOrHash::parse(id).map_err(|e| e.to_string())?;
        let details = self.api.api_torrent_details(tid).map_err(|e| e.to_string())?;
        let raw_files = details.files.unwrap_or_default();
        Ok(extract_torrent_files(&raw_files))
    }

    pub fn list_tasks(&self) -> Vec<DownloadTask> {
        let list = self
            .api
            .api_torrent_list_ext(ApiTorrentListOpts { with_stats: true });
        let meta = self.meta.lock().unwrap();
        list.torrents
            .iter()
            .filter_map(|t| {
                let id = t.id?;
                let m = meta.get(&id)?;
                Some(self.map_task(t, m))
            })
            .collect()
    }

    pub async fn pause(&self, id: &str) -> Result<bool, String> {
        let tid = TorrentIdOrHash::parse(id).map_err(|e| e.to_string())?;
        self.api
            .api_torrent_action_pause(tid)
            .await
            .map_err(|e| e.to_string())?;
        Ok(true)
    }

    pub async fn resume(&self, id: &str) -> Result<bool, String> {
        let tid = TorrentIdOrHash::parse(id).map_err(|e| e.to_string())?;
        self.api
            .api_torrent_action_start(tid)
            .await
            .map_err(|e| e.to_string())?;
        self.enforce_concurrency();
        Ok(true)
    }

    pub async fn cancel(&self, id: &str) -> Result<bool, String> {
        let tid = TorrentIdOrHash::parse(id).map_err(|e| e.to_string())?;
        self.api
            .api_torrent_action_delete(tid)
            .await
            .map_err(|e| e.to_string())?;
        if let TorrentIdOrHash::Id(tid) = tid {
            self.meta.lock().unwrap().remove(&tid);
        }
        Ok(true)
    }

    fn map_task(&self, t: &TorrentDetailsResponse, m: &TaskMeta) -> DownloadTask {
        let (total_bytes, downloaded_bytes, speed_bps, eta, finished, error) =
            extract_stats(t.stats.as_ref());
        let status = if let Some(_err) = error {
            DownloadStatus::Error
        } else if finished {
            DownloadStatus::Completed
        } else {
            match t
                .stats
                .as_ref()
                .map(|s| s.state)
                .unwrap_or(TorrentStatsState::Initializing)
            {
                TorrentStatsState::Live => {
                    if m.is_stream {
                        DownloadStatus::Streaming
                    } else {
                        DownloadStatus::Downloading
                    }
                }
                TorrentStatsState::Paused => DownloadStatus::Paused,
                _ => DownloadStatus::Queued,
            }
        };

        let progress = if total_bytes > 0 {
            (downloaded_bytes as f64 / total_bytes as f64 * 100.0) as f32
        } else {
            0.0
        };

        let stream_url =
            t.id.and_then(|id| m.stream_file_idx.map(|idx| self.stream_url(id, idx)));

        DownloadTask {
            id: t.id.map(|id| id.to_string()).unwrap_or_default(),
            title: if m.display_title.trim().is_empty() {
                m.title.clone()
            } else {
                m.display_title.clone()
            },
            media_type: m.media_type.clone(),
            magnet_link: m.magnet_link.clone(),
            save_path: t.output_folder.clone(),
            total_bytes,
            downloaded_bytes,
            progress,
            download_speed_bps: speed_bps,
            eta_seconds: eta,
            seeders: m.seeders,
            peers: m.peers,
            status,
            created_at: m.created_at,
            stream_url,
        }
    }
}

fn extract_stats(stats: Option<&TorrentStats>) -> (u64, u64, u64, u64, bool, Option<String>) {
    let Some(s) = stats else {
        return (0, 0, 0, 0, false, None);
    };
    let mut speed_bps = 0.0;
    let mut eta_seconds = 0u64;
    if let Some(live) = &s.live {
        speed_bps = live.download_speed.mbps;
        eta_seconds = live
            .time_remaining
            .as_ref()
            .and_then(|tr| {
                serde_json::to_value(tr)
                    .ok()
                    .and_then(|v| v.get("duration").and_then(|d| d.as_f64()))
            })
            .unwrap_or(0.0) as u64;
    }
    (
        s.total_bytes,
        s.progress_bytes,
        (speed_bps * 1_000_000.0) as u64,
        eta_seconds,
        s.finished,
        s.error.clone(),
    )
}

fn extract_torrent_files(files: &[librqbit::api::TorrentDetailsResponseFile]) -> Vec<TorrentFileItem> {
    files
        .iter()
        .enumerate()
        .map(|(index, f)| {
            let ext = f.name.split('.').last().unwrap_or("").to_lowercase();
            let is_video = VIDEO_EXTENSIONS.contains(&ext.as_str());
            TorrentFileItem {
                index,
                name: f.name.clone(),
                length: f.length,
                is_video,
            }
        })
        .collect()
}

fn pick_best_video_file_from_items(files: &[TorrentFileItem]) -> Option<usize> {
    files
        .iter()
        .filter(|f| f.is_video)
        .max_by_key(|f| f.length)
        .map(|f| f.index)
        .or_else(|| files.iter().max_by_key(|f| f.length).map(|f| f.index))
}

fn is_valid_magnet(magnet: &str) -> bool {
    let trimmed = magnet.trim();
    if !trimmed.to_ascii_lowercase().starts_with("magnet:?") {
        return false;
    }
    regex::Regex::new(r"(?i)urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})")
        .ok()
        .map(|re| re.is_match(trimmed))
        .unwrap_or(false)
}

fn looks_like_torrent_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.ends_with(".torrent")
}

fn pick_episode_file(
    files: &[TorrentFileItem],
    season: Option<u32>,
    episode: Option<u32>,
) -> Option<usize> {
    let episode = episode?;
    let season = season.unwrap_or(1);
    let videos: Vec<&TorrentFileItem> = files.iter().filter(|f| f.is_video).collect();
    if videos.len() <= 1 {
        return videos.first().map(|f| f.index);
    }

    let padded_ep = format!("{episode:02}");
    let padded_season = format!("{season:02}");
    let mut scored: Vec<(i32, usize)> = videos
        .iter()
        .map(|file| {
            let name = file.name.to_ascii_lowercase();
            let mut score = 0;
            if name.contains(&format!("s{padded_season}e{padded_ep}"))
                || name.contains(&format!("s{season}e{episode}"))
                || name.contains(&format!("s{padded_season}e{episode}"))
                || name.contains(&format!("s{padded_season}.e{padded_ep}"))
                || name.contains(&format!("{season}x{padded_ep}"))
                || name.contains(&format!("{season}x{episode}"))
            {
                score += 100;
            }
            if name.contains(&format!(" - {padded_ep}"))
                || name.contains(&format!(" - {episode}."))
                || name.contains(&format!("e{padded_ep}"))
                || name.contains(&format!("ep{padded_ep}"))
                || name.contains(&format!("episode {episode}"))
            {
                score += 40;
            }
            if name.contains(&padded_ep) {
                score += 10;
            }
            (score, file.index)
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    if scored.len() == 1 || scored.get(0).zip(scored.get(1)).is_some_and(|(a, b)| a.0 > b.0) {
        return scored.first().map(|s| s.1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn video(index: usize, name: &str, length: u64) -> TorrentFileItem {
        TorrentFileItem {
            index,
            name: name.to_string(),
            length,
            is_video: true,
        }
    }

    #[test]
    fn picks_sxxexx_over_generic_number() {
        let files = vec![
            video(0, "Show.S01E02.1080p.mkv", 1_000),
            video(1, "Show.S01E03.1080p.mkv", 1_000),
            video(2, "extras-02.mkv", 200),
        ];
        assert_eq!(pick_episode_file(&files, Some(1), Some(3)), Some(1));
    }

    #[test]
    fn picks_1x02_style_names() {
        let files = vec![
            video(0, "Show.1x01.mkv", 1_000),
            video(1, "Show.1x02.mkv", 1_000),
        ];
        assert_eq!(pick_episode_file(&files, Some(1), Some(2)), Some(1));
    }
}
