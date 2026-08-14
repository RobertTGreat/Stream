use crate::indexers::common::{detect_quality, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct JackettResponse {
    #[serde(rename = "Results")]
    results: Option<Vec<JackettResult>>,
}

#[derive(Debug, Deserialize)]
struct JackettResult {
    #[serde(rename = "Title")]
    title: Option<String>,
    #[serde(rename = "MagnetUri")]
    magnet_uri: Option<String>,
    #[serde(rename = "Link")]
    link: Option<String>,
    #[serde(rename = "InfoHash")]
    info_hash: Option<String>,
    #[serde(rename = "Seeders")]
    seeders: Option<u32>,
    #[serde(rename = "Peers")]
    peers: Option<u32>,
    #[serde(rename = "Size")]
    size: Option<u64>,
    #[serde(rename = "Tracker")]
    tracker: Option<String>,
    #[serde(rename = "PublishDate")]
    publish_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProwlarrResult {
    title: Option<String>,
    #[serde(rename = "magnetUrl")]
    magnet_url: Option<String>,
    #[serde(rename = "downloadUrl")]
    download_url: Option<String>,
    #[serde(rename = "infoHash")]
    info_hash: Option<String>,
    seeders: Option<u32>,
    leechers: Option<u32>,
    size: Option<u64>,
    indexer: Option<String>,
    #[serde(rename = "publishDate")]
    publish_date: Option<String>,
}

pub async fn fetch_jackett(
    client: &Client,
    base_url: &str,
    api_key: &str,
    query: &str,
    media_type: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    if base_url.trim().is_empty() || api_key.trim().is_empty() {
        return Ok(Vec::new());
    }
    let url = format!(
        "{}/api/v2.0/indexers/all/results?apikey={}&Query={}",
        base_url.trim_end_matches('/'),
        urlencoding::encode(api_key),
        urlencoding::encode(query)
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }
    let parsed: JackettResponse = res.json().await?;
    let mut items = Vec::new();
    for (idx, row) in parsed.results.unwrap_or_default().into_iter().enumerate() {
        let title = row.title.unwrap_or_else(|| format!("Jackett {idx}"));
        let magnet = row
            .magnet_uri
            .filter(|m| !m.is_empty())
            .or_else(|| {
                row.info_hash
                    .as_ref()
                    .filter(|h| !h.is_empty())
                    .map(|h| magnet_from_hash(h, &title))
            });
        let Some(magnet) = magnet else {
            continue;
        };
        let source = row.tracker.unwrap_or_else(|| "Jackett".to_string());
        if let Some(item) = result(
            format!("jackett_{idx}_{source}"),
            title.clone(),
            magnet,
            row.link,
            row.size.unwrap_or(0),
            row.seeders.unwrap_or(0),
            row.peers.unwrap_or(0),
            detect_quality(&title),
            "Jackett",
            Some(source),
            row.publish_date.unwrap_or_else(|| "Today".to_string()),
            media_type,
            false,
        ) {
            items.push(item);
        }
    }
    Ok(items)
}

pub async fn fetch_prowlarr(
    client: &Client,
    base_url: &str,
    api_key: &str,
    query: &str,
    media_type: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    if base_url.trim().is_empty() || api_key.trim().is_empty() {
        return Ok(Vec::new());
    }
    let url = format!(
        "{}/api/v1/search?query={}&type=search",
        base_url.trim_end_matches('/'),
        urlencoding::encode(query)
    );
    let res = client
        .get(&url)
        .header("X-Api-Key", api_key)
        .send()
        .await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }
    let rows: Vec<ProwlarrResult> = res.json().await?;
    let mut items = Vec::new();
    for (idx, row) in rows.into_iter().enumerate() {
        let title = row.title.unwrap_or_else(|| format!("Prowlarr {idx}"));
        let magnet = row
            .magnet_url
            .filter(|m| !m.is_empty())
            .or_else(|| {
                row.info_hash
                    .as_ref()
                    .filter(|h| !h.is_empty())
                    .map(|h| magnet_from_hash(h, &title))
            });
        let Some(magnet) = magnet else {
            continue;
        };
        let source = row.indexer.unwrap_or_else(|| "Prowlarr".to_string());
        if let Some(item) = result(
            format!("prowlarr_{idx}_{source}"),
            title.clone(),
            magnet,
            row.download_url,
            row.size.unwrap_or(0),
            row.seeders.unwrap_or(0),
            row.leechers.unwrap_or(0),
            detect_quality(&title),
            "Prowlarr",
            Some(source),
            row.publish_date.unwrap_or_else(|| "Today".to_string()),
            media_type,
            false,
        ) {
            items.push(item);
        }
    }
    Ok(items)
}
