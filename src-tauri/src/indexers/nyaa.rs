use crate::indexers::common::{detect_quality, guess_release_group, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;

pub async fn fetch(
    client: &Client,
    query: &str,
    base_url: &str,
    media_type: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let host = base_url.trim_end_matches('/');
    let category = if media_type == "anime" { "1_2" } else { "0_0" };
    let url = format!(
        "{}/?page=rss&q={}&c={}&s=seeders&o=desc",
        host,
        urlencoding::encode(query),
        category
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let rss_text = res.text().await?;
    let mut items = Vec::new();

    let re_item = regex::Regex::new(r"(?s)<item>(.*?)</item>")?;
    let re_title = regex::Regex::new(r"<title>(.*?)</title>")?;
    let re_link = regex::Regex::new(r"<link>(.*?)</link>")?;
    let re_seeders = regex::Regex::new(r"<nyaa:seeders>(\d+)</nyaa:seeders>")?;
    let re_leechers = regex::Regex::new(r"<nyaa:leechers>(\d+)</nyaa:leechers>")?;
    let re_infohash = regex::Regex::new(r"<nyaa:infoHash>([a-fA-F0-9]{40})</nyaa:infoHash>")?;
    let re_size = regex::Regex::new(r"<nyaa:size>([\d.]+)\s*(GiB|MiB|TiB|GB|MB|TB)</nyaa:size>")?;

    for (idx, cap) in re_item.captures_iter(&rss_text).enumerate() {
        let item_xml = &cap[1];
        let title = re_title
            .captures(item_xml)
            .map(|c| decode_xml(&c[1]))
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }

        let info_hash = re_infohash
            .captures(item_xml)
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        if info_hash.is_empty() {
            continue;
        }

        let torrent_url = re_link.captures(item_xml).map(|c| decode_xml(&c[1]));
        let seeders = re_seeders
            .captures(item_xml)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);
        let leechers = re_leechers
            .captures(item_xml)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);
        let size_bytes = re_size
            .captures(item_xml)
            .and_then(|c| parse_nyaa_size(&c[1], &c[2]))
            .unwrap_or(0);
        let magnet = magnet_from_hash(&info_hash, &title);

        if let Some(item) = result(
            format!("nyaa_{}_{}", idx, info_hash),
            title.clone(),
            magnet,
            torrent_url,
            size_bytes,
            seeders,
            leechers,
            detect_quality(&title),
            "Nyaa",
            guess_release_group(&title),
            "Today".to_string(),
            media_type,
            false,
        ) {
            items.push(item);
        }
    }

    Ok(items)
}

fn decode_xml(raw: &str) -> String {
    raw.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn parse_nyaa_size(value: &str, unit: &str) -> Option<u64> {
    let n: f64 = value.parse().ok()?;
    let bytes = match unit.to_ascii_uppercase().as_str() {
        "TIB" | "TB" => n * 1_099_511_627_776.0,
        "GIB" | "GB" => n * 1_073_741_824.0,
        "MIB" | "MB" => n * 1_048_576.0,
        _ => return None,
    };
    Some(bytes as u64)
}
