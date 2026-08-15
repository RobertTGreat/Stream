use crate::indexers::common::{magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct YtsResponse {
    data: Option<YtsData>,
}

#[derive(Debug, Deserialize)]
struct YtsData {
    movies: Option<Vec<YtsMovie>>,
}

#[derive(Debug, Deserialize)]
struct YtsMovie {
    title_long: Option<String>,
    title: Option<String>,
    year: Option<u32>,
    torrents: Option<Vec<YtsTorrent>>,
}

#[derive(Debug, Deserialize)]
struct YtsTorrent {
    hash: Option<String>,
    quality: Option<String>,
    #[serde(rename = "type")]
    source_type: Option<String>,
    seeds: Option<u32>,
    peers: Option<u32>,
    size_bytes: Option<u64>,
    url: Option<String>,
}

pub async fn fetch(
    client: &Client,
    query: &str,
    imdb_id: Option<&str>,
    year: Option<u32>,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let term = imdb_id
        .filter(|id| id.starts_with("tt"))
        .unwrap_or(query);
    let url = format!(
        "https://yts.mx/api/v2/list_movies.json?query_term={}&limit=20&sort_by=seeds",
        urlencoding::encode(term)
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }
    let parsed: YtsResponse = res.json().await?;
    let mut items = Vec::new();

    for movie in parsed.data.and_then(|d| d.movies).unwrap_or_default() {
        let movie_title = movie
            .title_long
            .or(movie.title)
            .unwrap_or_else(|| query.to_string());
        if let Some(year) = year {
            if movie.year != Some(year) && !movie_title.contains(&year.to_string()) {
                continue;
            }
        }
        for torrent in movie.torrents.unwrap_or_default() {
            let Some(hash) = torrent.hash.filter(|h| !h.is_empty()) else {
                continue;
            };
            let quality = torrent.quality.unwrap_or_else(|| "1080p".to_string());
            let kind = torrent.source_type.unwrap_or_default();
            let title = if kind.is_empty() {
                format!("{movie_title} [{quality}]")
            } else {
                format!("{movie_title} [{quality} {kind}]")
            };
            let magnet = magnet_from_hash(&hash, &title);
            if let Some(item) = result(
                format!("yts_{hash}"),
                title,
                magnet,
                torrent.url,
                torrent.size_bytes.unwrap_or(0),
                torrent.seeds.unwrap_or(0),
                torrent.peers.unwrap_or(0),
                quality,
                "YTS",
                Some("YTS".to_string()),
                "Today".to_string(),
                "movie",
                false,
            ) {
                items.push(item);
            }
        }
    }

    Ok(items)
}
