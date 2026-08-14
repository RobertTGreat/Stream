use crate::indexers::common::{
    detect_quality, magnet_from_hash, parse_seeders_from_text, parse_size_from_text, result,
};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

const CINEMETA_BASE_URL: &str = "https://v3-cinemeta.strem.io";
const TORRENTIO_BASE_URL: &str = "https://torrentio.strem.fun";

#[derive(Debug, Clone, Deserialize)]
struct TorrentioStream {
    name: Option<String>,
    title: Option<String>,
    #[serde(rename = "infoHash")]
    info_hash: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct TorrentioResponse {
    streams: Option<Vec<TorrentioStream>>,
}

#[derive(Debug, Clone, Deserialize)]
struct CinemetaItem {
    id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CinemetaResponse {
    metas: Option<Vec<CinemetaItem>>,
}

pub async fn resolve_imdb_id(
    client: &Client,
    title: &str,
    is_movie: bool,
) -> Option<String> {
    if let Some(id) = fetch_imdb_id_from_tmdb(client, title, is_movie).await {
        return Some(id);
    }
    let kinds = if is_movie {
        ["movie", "series"]
    } else {
        ["series", "movie"]
    };
    for kind in kinds {
        let search_url = format!(
            "{}/catalog/{}/top/search={}.json",
            CINEMETA_BASE_URL,
            kind,
            urlencoding::encode(title)
        );
        let Ok(res) = client.get(&search_url).send().await else {
            continue;
        };
        if !res.status().is_success() {
            continue;
        }
        let Ok(data) = res.json::<CinemetaResponse>().await else {
            continue;
        };
        if let Some(id) = data
            .metas
            .as_ref()
            .and_then(|metas| metas.first())
            .and_then(|item| item.id.clone())
            .filter(|id| id.starts_with("tt"))
        {
            return Some(id);
        }
    }
    None
}

async fn fetch_imdb_id_from_tmdb(client: &Client, title: &str, is_movie: bool) -> Option<String> {
    let auth_token = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxYjcwZWNhYjczY2U1Y2JkMGJhYWY0ODBhZDQ2MzVkZCIsIm5iZiI6MTc1ODE0NzExMC4yODMsInN1YiI6IjY4Y2IzMjI2ZDMyZjM1NGFhOGUzNjUwMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ZI_hoiq5k1Uofi_YTRDrmUYMc9ZgwrHe_gZWTqR5HQ4";
    let search_type = if is_movie { "movie" } else { "tv" };
    let search_url = format!(
        "https://api.themoviedb.org/3/search/{}?query={}",
        search_type,
        urlencoding::encode(title)
    );

    let res = client
        .get(&search_url)
        .header("accept", "application/json")
        .header("Authorization", format!("Bearer {auth_token}"))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }

    let json: serde_json::Value = res.json().await.ok()?;
    let tmdb_id = json.get("results")?.as_array()?.first()?.get("id")?.as_u64()?;
    let ext_url = format!("https://api.themoviedb.org/3/{search_type}/{tmdb_id}/external_ids");
    let ext_res = client
        .get(&ext_url)
        .header("accept", "application/json")
        .header("Authorization", format!("Bearer {auth_token}"))
        .send()
        .await
        .ok()?;
    if !ext_res.status().is_success() {
        return None;
    }
    let ext_json: serde_json::Value = ext_res.json().await.ok()?;
    let imdb_id = ext_json.get("imdb_id")?.as_str()?;
    if imdb_id.starts_with("tt") {
        Some(imdb_id.to_string())
    } else {
        None
    }
}

pub async fn fetch(
    client: &Client,
    title: &str,
    media_type: &str,
    imdb_id: Option<&str>,
    season: Option<u32>,
    episode: Option<u32>,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let is_movie = media_type == "movie";
    let imdb = match imdb_id.filter(|id| id.starts_with("tt")) {
        Some(id) => id.to_string(),
        None => match resolve_imdb_id(client, title, is_movie).await {
            Some(id) => id,
            None => return Ok(Vec::new()),
        },
    };

    let stream_path = if is_movie && season.is_none() && episode.is_none() {
        format!("movie/{imdb}")
    } else {
        format!(
            "series/{}:{}:{}",
            imdb,
            season.unwrap_or(1),
            episode.unwrap_or(1)
        )
    };

    let torrentio_url = format!("{TORRENTIO_BASE_URL}/stream/{stream_path}.json");
    let stream_res = client.get(&torrentio_url).send().await?;
    if !stream_res.status().is_success() {
        return Ok(Vec::new());
    }

    let torrentio_data: TorrentioResponse = stream_res.json().await?;
    let mut items = Vec::new();

    if let Some(streams) = torrentio_data.streams {
        for (idx, stream) in streams.into_iter().enumerate() {
            let info_hash = match stream.info_hash {
                Some(h) if !h.is_empty() => h,
                _ => continue,
            };
            let title_raw = stream
                .title
                .unwrap_or_else(|| format!("Torrentio Release {}", idx + 1));
            let name_raw = stream.name.unwrap_or_else(|| "Torrentio".to_string());
            let display_title = format!("[Torrentio] {title} - {name_raw}");
            let blob = format!("{name_raw} {title_raw}");
            let magnet = magnet_from_hash(&info_hash, &display_title);
            let seeders = parse_seeders_from_text(&title_raw).unwrap_or(0);
            let size_bytes = parse_size_from_text(&title_raw).unwrap_or(0);

            if let Some(item) = result(
                format!("torrentio_{idx}_{info_hash}"),
                format!("{} ({})", display_title, title_raw.replace('\n', " • ")),
                magnet,
                None,
                size_bytes,
                seeders,
                0,
                detect_quality(&blob),
                "Torrentio",
                Some("Torrentio".to_string()),
                "Today".to_string(),
                media_type,
                idx == 0,
            ) {
                items.push(item);
            }
        }
    }

    Ok(items)
}
