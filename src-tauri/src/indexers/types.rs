use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentSearchResult {
    pub id: String,
    pub title: String,
    pub magnet_url: String,
    pub torrent_url: Option<String>,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub seeders: u32,
    pub leechers: u32,
    pub quality: String,
    pub source_name: String,
    pub release_group: Option<String>,
    pub date_posted: String,
    pub media_type: String,
    pub is_best_release: bool,
}

#[derive(Debug, Clone)]
pub struct SearchOptions {
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub enable_nyaa: bool,
    pub enable_animetosho: bool,
    pub enable_seadex: bool,
    pub enable_torrentio: bool,
    pub enable_yts: bool,
    pub enable_eztv: bool,
    pub enable_subsplease: bool,
    pub enable_piratebay: bool,
    pub enable_jackett: bool,
    pub enable_prowlarr: bool,
    pub nyaa_url: String,
    pub jackett_url: String,
    pub jackett_api_key: String,
    pub prowlarr_url: String,
    pub prowlarr_api_key: String,
    pub seadex_best_only: bool,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            season: None,
            episode: None,
            enable_nyaa: true,
            enable_animetosho: true,
            enable_seadex: true,
            enable_torrentio: true,
            enable_yts: true,
            enable_eztv: true,
            enable_subsplease: true,
            enable_piratebay: true,
            enable_jackett: false,
            enable_prowlarr: false,
            nyaa_url: "https://nyaa.si".to_string(),
            jackett_url: String::new(),
            jackett_api_key: String::new(),
            prowlarr_url: String::new(),
            prowlarr_api_key: String::new(),
            seadex_best_only: true,
        }
    }
}
