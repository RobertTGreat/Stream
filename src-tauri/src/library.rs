use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMediaItem {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub parsed_title: String,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub media_type: String, // "anime", "movie", "tv"
    pub size_bytes: u64,
    pub extension: String,
    pub last_modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanLibraryResult {
    pub items: Vec<LocalMediaItem>,
    pub error: Option<String>,
}

pub fn scan_folder(folder_path: &str, media_type: &str) -> ScanLibraryResult {
    let mut items = Vec::new();
    let trimmed = folder_path.trim();
    if trimmed.is_empty() {
        return ScanLibraryResult {
            items,
            error: Some("No library folder is configured.".to_string()),
        };
    }

    let expanded = expand_home(trimmed);
    let root = Path::new(&expanded);

    if !root.exists() {
        return ScanLibraryResult {
            items,
            error: Some(format!("Folder does not exist: {expanded}")),
        };
    }
    if !root.is_dir() {
        return ScanLibraryResult {
            items,
            error: Some(format!("Path is not a folder: {expanded}")),
        };
    }

    // Video extension check
    let valid_exts = ["mp4", "mkv", "avi", "webm", "m4v", "mov"];

    // Regex for parsing patterns like S01E05, 1x05, - 05, Ep 05
    let re_season_ep = Regex::new(r"(?i)[sS](\d+)[eE](\d+)").unwrap();
    let re_alt_season = Regex::new(r"(?i)(\d{1,2})x(\d{1,3})").unwrap();
    let re_episode_only = Regex::new(r"(?i)(?:ep|e|-)\s*(\d{1,4})").unwrap();
    let re_brackets =
        Regex::new(r"\[.*?\]|\(.*?\)|1080p|720p|4k|x264|x265|hevc|web-dl|bluray").unwrap();

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if valid_exts.contains(&ext_lower.as_str()) {
                    let filename = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let metadata = entry.metadata().ok();
                    let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let last_modified = metadata
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    // Parse title and season/episode numbers
                    let stem = path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let mut season = None;
                    let mut episode = None;

                    if let Some(caps) = re_season_ep.captures(&stem) {
                        season = caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok());
                        episode = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
                    } else if let Some(caps) = re_alt_season.captures(&stem) {
                        season = caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok());
                        episode = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
                    } else if let Some(caps) = re_episode_only.captures(&stem) {
                        episode = caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok());
                    }

                    // Clean title: remove release group brackets like [SubsPlease] or [1080p]
                    let clean_title = re_brackets.replace_all(&stem, "").trim().to_string();
                    let clean_title_final = clean_title
                        .replace('.', " ")
                        .replace('_', " ")
                        .trim()
                        .to_string();

                    let id = format!("{:x}", md5_hash(&path.to_string_lossy()));

                    items.push(LocalMediaItem {
                        id,
                        path: path.to_string_lossy().to_string(),
                        filename,
                        parsed_title: if clean_title_final.is_empty() {
                            stem
                        } else {
                            clean_title_final
                        },
                        season,
                        episode,
                        media_type: media_type.to_string(),
                        size_bytes,
                        extension: ext_lower,
                        last_modified,
                    });
                }
            }
        }
    }

    ScanLibraryResult { items, error: None }
}

fn expand_home(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_home() {
            return format!("{}/{rest}", home.trim_end_matches(['/', '\\']));
        }
    } else if path == "~" {
        if let Some(home) = dirs_home() {
            return home;
        }
    }
    path.to_string()
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
}

fn md5_hash(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}
