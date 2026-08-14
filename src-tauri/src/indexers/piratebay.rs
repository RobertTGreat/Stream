use crate::indexers::common::{detect_quality, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ApibayItem {
    name: Option<String>,
    info_hash: Option<String>,
    seeders: Option<serde_json::Value>,
    leechers: Option<serde_json::Value>,
    size: Option<serde_json::Value>,
}

pub async fn fetch(
    client: &Client,
    query: &str,
    media_type: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let cats: &[&str] = match media_type {
        "movie" => &["201", "207", "202"],
        "tv" => &["205", "208"],
        _ => &["205", "208", "201"],
    };

    let mut items = Vec::new();
    for cat in cats {
        let url = format!(
            "https://apibay.org/q.php?q={}&cat={cat}",
            urlencoding::encode(query)
        );
        let Ok(res) = client.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(rows) = res.json::<Vec<ApibayItem>>().await else {
            continue;
        };
        for (idx, row) in rows.into_iter().enumerate() {
            let title = row.name.unwrap_or_default();
            let hash = row.info_hash.unwrap_or_default();
            if title.is_empty() || hash.len() < 32 || hash == "0000000000000000000000000000000000000000" {
                continue;
            }
            let magnet = magnet_from_hash(&hash, &title);
            if let Some(item) = result(
                format!("tpb_{cat}_{idx}_{hash}"),
                title.clone(),
                magnet,
                None,
                json_u64(row.size.as_ref()).unwrap_or(0),
                json_u32(row.seeders.as_ref()).unwrap_or(0),
                json_u32(row.leechers.as_ref()).unwrap_or(0),
                detect_quality(&title),
                "PirateBay",
                None,
                "Today".to_string(),
                media_type,
                false,
            ) {
                items.push(item);
            }
        }
        if items.len() >= 40 {
            break;
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
