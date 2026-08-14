use crate::indexers::common::{detect_quality, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;

pub async fn fetch(
    client: &Client,
    query: &str,
    episode: Option<u32>,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let url = format!(
        "https://subsplease.org/api/?f=search&tz=UTC&s={}",
        urlencoding::encode(query)
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let raw: serde_json::Value = res.json().await?;
    let mut items = Vec::new();
    let Some(map) = raw.as_object() else {
        return Ok(items);
    };

    for (idx, (name, value)) in map.iter().enumerate() {
        if let Some(ep) = episode {
            if !title_matches_episode(name, ep)
                && !title_matches_episode(value.get("episode").and_then(|v| v.as_str()).unwrap_or(""), ep)
            {
                continue;
            }
        }

        let date_posted = value
            .get("release_date")
            .and_then(|v| v.as_str())
            .unwrap_or("Today")
            .to_string();

        for (quality, magnet) in extract_downloads(value.get("downloads")) {
            let title = format!("[SubsPlease] {name} [{quality}]");
            if let Some(item) = result(
                format!("subsplease_{idx}_{quality}"),
                title,
                magnet,
                None,
                0,
                0,
                0,
                quality,
                "SubsPlease",
                Some("SubsPlease".to_string()),
                date_posted.clone(),
                "anime",
                false,
            ) {
                items.push(item);
            }
        }
    }

    Ok(items)
}

fn title_matches_episode(text: &str, episode: u32) -> bool {
    let padded = format!("{episode:02}");
    let lower = text.to_ascii_lowercase();
    lower.contains(&format!(" {padded}"))
        || lower.contains(&format!("-{padded}"))
        || lower.contains(&format!("e{padded}"))
        || lower.contains(&format!(" {episode} "))
        || text.trim() == padded
        || text.trim() == episode.to_string()
}

fn extract_downloads(value: Option<&serde_json::Value>) -> Vec<(String, String)> {
    let Some(value) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();

    if let Some(arr) = value.as_array() {
        for entry in arr {
            let magnet = entry
                .get("magnet")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if magnet.is_empty() {
                continue;
            }
            let quality = entry
                .get("res")
                .and_then(|v| v.as_str())
                .map(|res| {
                    if res.ends_with('p') {
                        res.to_string()
                    } else {
                        format!("{res}p")
                    }
                })
                .unwrap_or_else(|| detect_quality(&magnet));
            out.push((quality, magnet));
        }
        return out;
    }

    if let Some(map) = value.as_object() {
        for (key, entry) in map {
            let magnet = entry
                .get("magnet")
                .and_then(|v| v.as_str())
                .or_else(|| entry.as_str())
                .unwrap_or("")
                .to_string();
            if magnet.is_empty() {
                continue;
            }
            let quality = if key.ends_with('p') {
                key.clone()
            } else {
                format!("{key}p")
            };
            out.push((quality, magnet));
        }
    }

    out
}
