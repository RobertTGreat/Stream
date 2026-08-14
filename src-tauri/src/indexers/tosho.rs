use crate::indexers::common::{detect_quality, guess_release_group, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
struct ToshoItem {
    title: Option<String>,
    #[serde(alias = "magnet", alias = "magnet_uri")]
    magnet: Option<String>,
    torrent_url: Option<String>,
    #[serde(alias = "size_bytes", alias = "total_size")]
    size_bytes: Option<u64>,
    seeders: Option<u32>,
    leechers: Option<u32>,
    release_group: Option<String>,
    resolution: Option<String>,
    info_hash: Option<String>,
    #[serde(alias = "date_added", alias = "timestamp")]
    date_added: Option<serde_json::Value>,
}

pub async fn fetch(
    client: &Client,
    query: &str,
    media_type: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let encoded = urlencoding::encode(query);
    let urls = [
        format!("https://feed.animetosho.org/json?only_tor=1&q={encoded}"),
        format!("https://feed.animetosho.xyz/json/v1/search?q={encoded}&limit=30"),
    ];

    let mut last_items: Vec<ToshoItem> = Vec::new();
    for url in urls {
        let Ok(res) = client.get(&url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        if let Ok(parsed) = res.json::<Vec<ToshoItem>>().await {
            last_items = parsed;
            break;
        }
    }

    let mut items = Vec::new();
    for (idx, item) in last_items.into_iter().enumerate() {
        let title = item.title.unwrap_or_else(|| format!("Release {idx}"));
        let magnet = item
            .magnet
            .filter(|m| !m.is_empty())
            .or_else(|| {
                item.info_hash
                    .as_ref()
                    .filter(|h| h.len() >= 32)
                    .map(|h| magnet_from_hash(h, &title))
            });
        let Some(magnet) = magnet else {
            continue;
        };

        let date_posted = match item.date_added {
            Some(serde_json::Value::String(s)) => s,
            Some(serde_json::Value::Number(n)) => n.to_string(),
            _ => "Today".to_string(),
        };
        let quality = item
            .resolution
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| detect_quality(&title));

        if let Some(row) = result(
            format!(
                "tosho_{}_{}",
                idx,
                item.info_hash.clone().unwrap_or_default()
            ),
            title.clone(),
            magnet,
            item.torrent_url,
            item.size_bytes.unwrap_or(0),
            item.seeders.unwrap_or(0),
            item.leechers.unwrap_or(0),
            quality,
            "AnimeTosho",
            item.release_group.or_else(|| guess_release_group(&title)),
            date_posted,
            media_type,
            false,
        ) {
            items.push(row);
        }
    }

    Ok(items)
}
