use crate::indexers::types::TorrentSearchResult;
use regex::Regex;
use reqwest::Client;
use std::sync::OnceLock;
use std::time::Duration;

pub fn http_client() -> Client {
    Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) StreamDesktop/1.0")
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(6))
        .build()
        .unwrap_or_else(|_| Client::new())
}

pub fn info_hash_from_magnet(magnet: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"(?i)urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})").expect("hash regex")
    });
    re.captures(magnet)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_ascii_lowercase())
}

pub fn is_valid_magnet(magnet: &str) -> bool {
    let trimmed = magnet.trim();
    trimmed.to_ascii_lowercase().starts_with("magnet:?") && info_hash_from_magnet(trimmed).is_some()
}

pub fn magnet_from_hash(info_hash: &str, display_name: &str) -> String {
    format!(
        "magnet:?xt=urn:btih:{}&dn={}",
        info_hash.trim(),
        urlencoding::encode(display_name)
    )
}

pub fn detect_quality(text: &str) -> String {
    let s = text.to_ascii_lowercase();
    if s.contains("2160") || s.contains("4k") || s.contains("uhd") {
        "2160p".to_string()
    } else if s.contains("1080") || s.contains("fhd") {
        "1080p".to_string()
    } else if s.contains("720") {
        "720p".to_string()
    } else if s.contains("480") {
        "480p".to_string()
    } else {
        "Unknown".to_string()
    }
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.2} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else if bytes > 0 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        "Unknown".to_string()
    }
}

pub fn parse_seeders_from_text(text: &str) -> Option<u32> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"👤\s*(\d+)").expect("seeder regex"));
    re.captures(text)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

pub fn parse_size_from_text(text: &str) -> Option<u64> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"(?i)💾\s*([\d.]+)\s*(GB|MB|TB)").expect("size emoji regex")
    });
    let cap = re.captures(text)?;
    let value: f64 = cap.get(1)?.as_str().parse().ok()?;
    let unit = cap.get(2)?.as_str().to_ascii_uppercase();
    let bytes = match unit.as_str() {
        "TB" => value * 1_099_511_627_776.0,
        "GB" => value * 1_073_741_824.0,
        "MB" => value * 1_048_576.0,
        _ => return None,
    };
    Some(bytes as u64)
}

pub fn guess_release_group(title: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^\[([^\]]+)\]").expect("group regex"));
    re.captures(title)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .filter(|s| !s.is_empty() && s.len() < 32)
}

pub fn result(
    id: String,
    title: String,
    magnet_url: String,
    torrent_url: Option<String>,
    size_bytes: u64,
    seeders: u32,
    leechers: u32,
    quality: String,
    source_name: &str,
    release_group: Option<String>,
    date_posted: String,
    media_type: &str,
    is_best_release: bool,
) -> Option<TorrentSearchResult> {
    if !is_valid_magnet(&magnet_url) {
        return None;
    }
    Some(TorrentSearchResult {
        id,
        title,
        magnet_url,
        torrent_url,
        size_bytes,
        size_formatted: format_bytes(size_bytes),
        seeders,
        leechers,
        quality,
        source_name: source_name.to_string(),
        release_group,
        date_posted,
        media_type: media_type.to_string(),
        is_best_release,
    })
}

pub fn dedupe_results(items: Vec<TorrentSearchResult>) -> Vec<TorrentSearchResult> {
    let mut unique = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in items {
        let key = info_hash_from_magnet(&item.magnet_url).unwrap_or_else(|| item.magnet_url.clone());
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        unique.push(item);
    }
    unique
}
