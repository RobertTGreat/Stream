use crate::indexers::common::{format_bytes, magnet_from_hash, result};
use crate::indexers::types::TorrentSearchResult;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
struct SeaDexTrFile {
    length: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct SeaDexTr {
    #[serde(rename = "infoHash")]
    info_hash: Option<String>,
    #[serde(rename = "releaseGroup")]
    release_group: Option<String>,
    url: Option<String>,
    #[serde(rename = "dualAudio")]
    dual_audio: Option<bool>,
    files: Option<Vec<SeaDexTrFile>>,
    created: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SeaDexExpand {
    trs: Option<Vec<SeaDexTr>>,
}

#[derive(Debug, Clone, Deserialize)]
struct SeaDexRecord {
    expand: Option<SeaDexExpand>,
}

#[derive(Debug, Clone, Deserialize)]
struct SeaDexResponse {
    items: Option<Vec<SeaDexRecord>>,
}

pub async fn fetch(
    client: &Client,
    anilist_id: u64,
    title: &str,
) -> Result<Vec<TorrentSearchResult>, Box<dyn std::error::Error>> {
    let url = format!(
        "https://releases.moe/api/collections/entries/records?page=1&perPage=1&filter=alID%3D%22{}%22&expand=trs",
        anilist_id
    );
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let data: SeaDexResponse = res.json().await?;
    let mut items = Vec::new();

    let Some(records) = data.items else {
        return Ok(items);
    };
    let Some(record) = records.first() else {
        return Ok(items);
    };
    let Some(expand) = &record.expand else {
        return Ok(items);
    };
    let Some(trs) = &expand.trs else {
        return Ok(items);
    };

    for (idx, tr) in trs.iter().enumerate() {
        let info_hash = tr.info_hash.clone().unwrap_or_default();
        if info_hash.is_empty() || info_hash == "<redacted>" {
            continue;
        }

        let group = tr
            .release_group
            .clone()
            .unwrap_or_else(|| "SeaDex".to_string());
        let dual_tag = if tr.dual_audio.unwrap_or(false) {
            " [Dual-Audio]"
        } else {
            ""
        };
        let release_title = format!("[{}] {}{}", group, title, dual_tag);
        let size_bytes: u64 = tr
            .files
            .as_ref()
            .map(|files| files.iter().map(|f| f.length.unwrap_or(0)).sum())
            .unwrap_or(0);
        let magnet = magnet_from_hash(&info_hash, &release_title);

        if let Some(item) = result(
            format!("seadex_{}_{}", idx, info_hash),
            release_title,
            magnet,
            tr.url.clone(),
            size_bytes,
            0,
            0,
            "1080p".to_string(),
            "SeaDex",
            Some(group),
            tr.created.clone().unwrap_or_else(|| "Today".to_string()),
            "anime",
            true,
        ) {
            let mut item = item;
            item.size_formatted = if size_bytes > 0 {
                format_bytes(size_bytes)
            } else {
                "Pack".to_string()
            };
            items.push(item);
        }
    }

    Ok(items)
}
