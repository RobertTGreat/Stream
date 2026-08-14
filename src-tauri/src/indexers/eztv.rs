use crate::indexers::common::{detect_quality, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct EztvResponse {
    torrents: Option<Vec<EztvTorrent>>,
}

#[derive(Debug, Deserialize)]
struct EztvTorrent {
    title: Option<String>,
    magnet_url: Option<String>,
    hash: Option<String>,
    seeds: Option<u32>,
    peers: Option<u32>,
    size_bytes: Option<serde_json::Value>,
    season: Option<serde_json::Value>,
    episode: Option<serde_json::Value>,
}

pub async fn fetch(
    client: &Client,
    imdb_id: Option<&str>,
    season: Option<u32>,
    episode: Option<u32>,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let Some(imdb) = imdb_id.filter(|id| id.starts_with("tt")) else {
        return Ok(Vec::new());
    };
    let numeric = imdb.trim_start_matches("tt");
    let url = format!("https://eztv.re/api/get-torrents?limit=50&imdb_id={numeric}");
    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => {
            let fallback = format!("https://eztvx.to/api/get-torrents?limit=50&imdb_id={numeric}");
            client.get(&fallback).send().await?
        }
    };
    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let parsed: EztvResponse = res.json().await?;
    let mut items = Vec::new();

    for (idx, torrent) in parsed.torrents.unwrap_or_default().into_iter().enumerate() {
        let title = torrent.title.unwrap_or_else(|| format!("EZTV {idx}"));
        if let (Some(want_s), Some(have_s)) = (season, json_u32(torrent.season.as_ref())) {
            if want_s != have_s {
                continue;
            }
        }
        if let (Some(want_e), Some(have_e)) = (episode, json_u32(torrent.episode.as_ref())) {
            if want_e != have_e {
                continue;
            }
        }

        let magnet = torrent
            .magnet_url
            .filter(|m| !m.is_empty())
            .or_else(|| {
                torrent
                    .hash
                    .as_ref()
                    .filter(|h| !h.is_empty())
                    .map(|h| magnet_from_hash(h, &title))
            });
        let Some(magnet) = magnet else {
            continue;
        };
        let size_bytes = json_u64(torrent.size_bytes.as_ref()).unwrap_or(0);

        if let Some(item) = result(
            format!("eztv_{idx}_{}", torrent.hash.unwrap_or_default()),
            title.clone(),
            magnet,
            None,
            size_bytes,
            torrent.seeds.unwrap_or(0),
            torrent.peers.unwrap_or(0),
            detect_quality(&title),
            "EZTV",
            Some("EZTV".to_string()),
            "Today".to_string(),
            "tv",
            false,
        ) {
            items.push(item);
        }
    }

    Ok(items)
}

fn json_u32(value: Option<&serde_json::Value>) -> Option<u32> {
    match value? {
        serde_json::Value::Number(n) => n.as_u64().map(|v| v as u32),
        serde_json::Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn json_u64(value: Option<&serde_json::Value>) -> Option<u64> {
    match value? {
        serde_json::Value::Number(n) => n.as_u64(),
        serde_json::Value::String(s) => s.parse().ok(),
        _ => None,
    }
}
