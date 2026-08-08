use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use librqbit::api::{Api, ApiTorrentListOpts, TorrentDetailsResponse, TorrentIdOrHash};
use librqbit::http_api::HttpApi;
use librqbit::{AddTorrent, AddTorrentOptions, Session, TorrentStats, TorrentStatsState};

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
    meta: Arc<Mutex<HashMap<usize, TaskMeta>>>,
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

impl StreamEngine {
    pub async fn new(download_dir: PathBuf) -> anyhow::Result<Self> {
        let _ = std::fs::create_dir_all(&download_dir);
        let session_opts = librqbit::SessionOptions {
            fastresume: true,
            concurrent_init_limit: Some(128),
            ..Default::default()
        };
        let session = Session::new_with_opts(download_dir, session_opts).await?;
        let api = Api::new(session, None, None);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let http_port = listener.local_addr()?.port();

        let http_api = HttpApi::new(api.clone(), None);
        tokio::spawn(http_api.make_http_api_and_run(listener, None));

        Ok(Self {
            api,
            http_port,
            meta: Arc::new(Mutex::new(HashMap::new())),
        })
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
        let augmented_magnet = append_trackers_to_magnet(&magnet_link);
        let opts = AddTorrentOptions {
            overwrite: true,
            output_folder: Some(save_path.clone()),
            ..Default::default()
        };

        let add = AddTorrent::from_url(augmented_magnet.as_str());
        let resp = self
            .api
            .api_add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to add torrent magnet: {e:#}"))?;

        let id = match resp.id {
            Some(id) => id,
            None => {
                let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: false });
                list.torrents.first().and_then(|t| t.id).unwrap_or(0)
            }
        };

        let files = extract_torrent_files(resp.details.files.as_deref().unwrap_or(&[]));
        let recommended_file_index = pick_best_video_file_from_items(&files).unwrap_or(0);
        let torrent_name = resp.details.name.unwrap_or_else(|| title.clone());

        self.meta.lock().unwrap().insert(
            id,
            TaskMeta {
                title: torrent_name.clone(),
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

    /// Add a torrent for streaming and immediately return the HTTP stream URL.
    /// If `file_index` is None, the largest video file is chosen.
    pub async fn start_stream(
        &self,
        title: String,
        media_type: String,
        magnet_link: String,
        file_index: Option<u32>,
        save_path: String,
    ) -> Result<StreamInfo, String> {
        let augmented_magnet = append_trackers_to_magnet(&magnet_link);
        let file_idx_hint = file_index.map(|f| f as usize);
        let opts = AddTorrentOptions {
            only_files: file_idx_hint.map(|f| vec![f]),
            overwrite: true,
            output_folder: Some(save_path.clone()),
            ..Default::default()
        };

        let add = AddTorrent::from_url(augmented_magnet.as_str());
        let resp = self
            .api
            .api_add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to start torrent stream: {e:#}"))?;

        let id = match resp.id {
            Some(id) => id,
            None => {
                let list = self.api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: false });
                list.torrents.first().and_then(|t| t.id).unwrap_or(0)
            }
        };
        let files_raw = resp.details.files.unwrap_or_default();
        let files = extract_torrent_files(&files_raw);

        let file_idx = match file_idx_hint {
            Some(f) if f < files.len() => f,
            _ => pick_best_video_file_from_items(&files)
                .ok_or_else(|| "No video files found in torrent".to_string())?,
        };

        let torrent_title = resp.details.name.unwrap_or_else(|| title.clone());
        let created_at = now_secs();

        self.meta.lock().unwrap().insert(
            id,
            TaskMeta {
                title: torrent_title.clone(),
                media_type,
                magnet_link,
                seeders: 0,
                peers: 0,
                is_stream: true,
                stream_file_idx: Some(file_idx),
                created_at,
            },
        );

        Ok(StreamInfo {
            task_id: id.to_string(),
            stream_url: self.stream_url(id, file_idx),
            is_ready: true,
            buffered_percent: 0.0,
            title: torrent_title,
            selected_file_index: file_idx,
            files,
        })
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
                title,
                media_type,
                magnet_link,
                seeders,
                peers,
                is_stream: false,
                stream_file_idx: None,
                created_at: now_secs(),
            },
        );

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
            title: m.title.clone(),
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
