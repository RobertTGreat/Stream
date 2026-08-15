mod aggregators;
mod common;
mod eztv;
mod nyaa;
mod piratebay;
mod seadex;
mod subsplease;
mod tosho;
mod torrentio;
mod types;
mod yts;

pub use types::{SearchOptions, TorrentSearchResult};

use common::{dedupe_results, http_client};

pub async fn search_all_providers(
    query: &str,
    media_type: &str,
    anilist_id: Option<u64>,
    options: SearchOptions,
) -> Vec<TorrentSearchResult> {
    let q_clean = query.trim();
    if q_clean.is_empty() {
        return Vec::new();
    }

    let client = http_client();
    let is_anime = media_type == "anime";
    let is_movie = media_type == "movie";
    let is_tv = media_type == "tv";
    let lookup_title = options
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(q_clean);

    let seadex_fut = async {
        if options.enable_seadex && is_anime {
            if let Some(al_id) = anilist_id {
                return seadex::fetch(&client, al_id, q_clean)
                    .await
                    .unwrap_or_default();
            }
        }
        Vec::new()
    };
    let tosho_fut = async {
        if options.enable_animetosho && is_anime {
            return tosho::fetch(&client, q_clean, media_type)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let nyaa_fut = async {
        if options.enable_nyaa && is_anime {
            return nyaa::fetch(&client, q_clean, &options.nyaa_url, media_type)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let torrentio_task = async {
        if options.enable_torrentio {
            let imdb_id = match options.imdb_id.as_deref().filter(|id| id.starts_with("tt")) {
                Some(id) => Some(id.to_string()),
                None => {
                    torrentio::resolve_imdb_id(
                        &client,
                        lookup_title,
                        is_movie,
                        options.tmdb_id,
                        options.year,
                    )
                    .await
                }
            };
            return torrentio::fetch(
                &client,
                lookup_title,
                media_type,
                imdb_id.as_deref(),
                options.season,
                options.episode,
            )
            .await
            .unwrap_or_default();
        }
        Vec::new()
    };
    let yts_fut = async {
        if options.enable_yts && is_movie {
            return yts::fetch(&client, q_clean, options.imdb_id.as_deref(), options.year)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let eztv_task = async {
        if options.enable_eztv && (is_tv || is_anime) {
            let imdb_id = match options.imdb_id.as_deref().filter(|id| id.starts_with("tt")) {
                Some(id) => Some(id.to_string()),
                None => {
                    torrentio::resolve_imdb_id(
                        &client,
                        lookup_title,
                        is_movie,
                        options.tmdb_id,
                        options.year,
                    )
                    .await
                }
            };
            return eztv::fetch(&client, imdb_id.as_deref(), options.season, options.episode)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let subsplease_fut = async {
        if options.enable_subsplease && is_anime {
            return subsplease::fetch(&client, q_clean, options.episode)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let tpb_fut = async {
        if options.enable_piratebay && (is_movie || is_tv) {
            return piratebay::fetch(&client, q_clean, media_type)
                .await
                .unwrap_or_default();
        }
        Vec::new()
    };
    let jackett_fut = async {
        if options.enable_jackett {
            return aggregators::fetch_jackett(
                &client,
                &options.jackett_url,
                &options.jackett_api_key,
                q_clean,
                media_type,
            )
            .await
            .unwrap_or_default();
        }
        Vec::new()
    };
    let prowlarr_fut = async {
        if options.enable_prowlarr {
            return aggregators::fetch_prowlarr(
                &client,
                &options.prowlarr_url,
                &options.prowlarr_api_key,
                q_clean,
                media_type,
            )
            .await
            .unwrap_or_default();
        }
        Vec::new()
    };

    let (
        seadex_res,
        tosho_res,
        nyaa_res,
        torrentio_res,
        yts_res,
        eztv_res,
        subsplease_res,
        tpb_res,
        jackett_res,
        prowlarr_res,
    ) = tokio::join!(
        seadex_fut,
        tosho_fut,
        nyaa_fut,
        torrentio_task,
        yts_fut,
        eztv_task,
        subsplease_fut,
        tpb_fut,
        jackett_fut,
        prowlarr_fut
    );

    let mut results = Vec::new();
    results.extend(seadex_res);
    results.extend(tosho_res);
    results.extend(nyaa_res);
    results.extend(torrentio_res);
    results.extend(yts_res);
    results.extend(eztv_res);
    results.extend(subsplease_res);
    results.extend(tpb_res);
    results.extend(jackett_res);
    results.extend(prowlarr_res);

    let mut unique = dedupe_results(results);
    if options.seadex_best_only {
        unique.retain(|r| r.source_name.to_ascii_lowercase() != "seadex" || r.is_best_release);
    }
    unique.sort_by(|a, b| {
        b.is_best_release
            .cmp(&a.is_best_release)
            .then_with(|| b.seeders.cmp(&a.seeders))
    });
    unique
}
