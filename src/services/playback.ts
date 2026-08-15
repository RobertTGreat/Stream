import { AppSettings, Episode, MediaItem, RememberedTorrent, StreamInfo, StreamProgress, TorrentResult } from "../types";
import { StorageService } from "./storage";

export function isValidMagnet(magnet?: string): boolean {
  if (!magnet) return false;
  return /magnet:\?.*xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i.test(magnet);
}

export function resolvePlayEpisode(
  media: MediaItem,
  requested: Episode | undefined,
  watchProgress: StreamProgress[]
): Episode {
  if (requested) {
    return {
      ...requested,
      seasonNumber: requested.seasonNumber || 1,
    };
  }

  const history = watchProgress
    .filter((p) => p.mediaId === media.id)
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  const latest = history[0];
  if (latest) {
    const finished = latest.percentage >= 90;
    const next = finished ? latest.episodeNumber + 1 : latest.episodeNumber;
    const total = media.episodesCount || 0;
    const episodeNumber = total > 0 ? Math.min(next, total) : next;
    return {
      id: `ep_auto_${media.id}_${episodeNumber}`,
      episodeNumber,
      seasonNumber: latest.seasonNumber || 1,
      title: `Episode ${episodeNumber}`,
    };
  }

  return {
    id: `ep_auto_${media.id}_1`,
    episodeNumber: 1,
    seasonNumber: 1,
    title: media.title,
  };
}

export function westernSearchQuery(media: MediaItem, episode?: Episode): string {
  const title = media.title.trim();
  if (media.mediaType === "movie") {
    return media.year ? `${title} ${media.year}` : title;
  }
  if (episode?.episodeNumber) {
    const season = String(episode.seasonNumber || 1).padStart(2, "0");
    const ep = String(episode.episodeNumber).padStart(2, "0");
    return `${title} S${season}E${ep}`;
  }
  return title;
}

export function buildSearchInvokeArgs(
  media: MediaItem,
  episode: Episode | undefined,
  settings: AppSettings
): Record<string, unknown> {
  const isMovie = media.mediaType === "movie";
  const isAnime = media.mediaType === "anime";
  return {
    query: isAnime ? media.title : westernSearchQuery(media, episode),
    title: media.title,
    media_type: media.mediaType,
    anilist_id: media.anilistId || undefined,
    tmdb_id: media.tmdbId || undefined,
    imdb_id: media.imdbId || undefined,
    year: media.year || undefined,
    season: isMovie ? undefined : episode?.seasonNumber || 1,
    episode: isMovie ? undefined : episode?.episodeNumber,
    enable_nyaa: settings.enableNyaa,
    enable_animetosho: settings.enableAnimeTosho,
    enable_seadex: settings.enableSeaDex,
    enable_torrentio: settings.enableTorrentio ?? true,
    enable_yts: settings.enableYts ?? true,
    enable_eztv: settings.enableEztv ?? true,
    enable_subsplease: settings.enableSubsPlease ?? true,
    enable_piratebay: settings.enablePirateBay ?? true,
    enable_jackett: settings.enableJackett,
    enable_prowlarr: settings.enableProwlarr,
    nyaa_url: settings.nyaaUrl,
    jackett_url: settings.jackettUrl,
    jackett_api_key: settings.jackettApiKey,
    prowlarr_url: settings.prowlarrUrl,
    prowlarr_api_key: settings.prowlarrApiKey,
    seadex_best_only: settings.seaDexBestOnly ?? true,
  };
}

export function playerChromeInset(): number {
  const titlebar = document.querySelector(".app-titlebar") as HTMLElement | null;
  const cssTitle = titlebar?.getBoundingClientRect().height || 38;
  return Math.round((cssTitle + 52) * (window.devicePixelRatio || 1));
}

export function looksLikeEpisodeRelease(title: string, episode?: number): boolean {
  if (!episode) return false;
  const padded = String(episode).padStart(2, "0");
  const t = title.toLowerCase();
  return (
    t.includes(` - ${padded}`) ||
    t.includes(`e${padded}`) ||
    t.includes(`ep${padded}`) ||
    t.includes(`episode ${episode}`) ||
    new RegExp(`s\\d{1,2}e0*${episode}\\b`, "i").test(t)
  );
}

export function toResumeTorrent(progress: StreamProgress, media: MediaItem): TorrentResult | null {
  if (!isValidMagnet(progress.magnetUrl)) return null;
  return rememberedToTorrent({
    mediaId: progress.mediaId,
    mediaType: progress.mediaType,
    seasonNumber: progress.seasonNumber,
    episodeNumber: progress.episodeNumber,
    magnetUrl: progress.magnetUrl as string,
    torrentTitle: progress.torrentTitle || media.title,
    fileIndex: progress.fileIndex,
    isPack: false,
    lastUsed: progress.lastUpdated,
  });
}

export function rememberedToTorrent(entry: RememberedTorrent): TorrentResult {
  return {
    id: `mem_${entry.mediaId}_${entry.episodeNumber ?? "pack"}`,
    title: entry.torrentTitle,
    magnet_url: entry.magnetUrl,
    size_bytes: 0,
    size_formatted: "",
    seeders: entry.seeders || 0,
    leechers: 0,
    quality: "",
    source_name: "Saved",
    date_posted: "",
    media_type: entry.mediaType,
  };
}

export function findRememberedTorrent(
  media: MediaItem,
  episode?: Episode
): RememberedTorrent | null {
  const season = episode?.seasonNumber;
  const epNum = episode?.episodeNumber;
  const memory = StorageService.getTorrentMemory();

  const exact = memory.find(
    (item) =>
      item.mediaId === media.id &&
      !item.isPack &&
      item.episodeNumber === epNum &&
      (season == null || item.seasonNumber == null || item.seasonNumber === season) &&
      isValidMagnet(item.magnetUrl)
  );
  if (exact) return exact;

  const pack = memory.find(
    (item) =>
      item.mediaId === media.id &&
      item.isPack &&
      (item.seasonNumber == null || season == null || item.seasonNumber === season) &&
      isValidMagnet(item.magnetUrl)
  );
  if (pack) return { ...pack, fileIndex: undefined };

  const progress = StorageService.getWatchProgress()
    .filter((p) => p.mediaId === media.id && isValidMagnet(p.magnetUrl))
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  const sameEpisode = progress.find((p) => p.episodeNumber === epNum);
  if (sameEpisode?.magnetUrl) {
    return {
      mediaId: media.id,
      mediaType: media.mediaType,
      seasonNumber: sameEpisode.seasonNumber,
      episodeNumber: sameEpisode.episodeNumber,
      magnetUrl: sameEpisode.magnetUrl,
      torrentTitle: sameEpisode.torrentTitle || media.title,
      fileIndex: sameEpisode.fileIndex,
      isPack: false,
      lastUsed: sameEpisode.lastUpdated,
    };
  }

  const previous = progress[0];
  if (previous?.magnetUrl) {
    return {
      mediaId: media.id,
      mediaType: media.mediaType,
      seasonNumber: previous.seasonNumber,
      magnetUrl: previous.magnetUrl,
      torrentTitle: previous.torrentTitle || media.title,
      isPack: true,
      lastUsed: previous.lastUpdated,
    };
  }

  return null;
}

export function rememberSuccessfulStream(
  media: MediaItem,
  episode: Episode | undefined,
  magnetUrl: string,
  torrentTitle: string,
  streamInfo: StreamInfo
): void {
  if (!isValidMagnet(magnetUrl)) return;
  const videoCount = streamInfo.files.filter((f) => f.is_video).length;
  const isPack = videoCount > 1;
  StorageService.saveTorrentMemory({
    mediaId: media.id,
    mediaType: media.mediaType,
    seasonNumber: episode?.seasonNumber,
    episodeNumber: isPack ? undefined : episode?.episodeNumber,
    magnetUrl,
    torrentTitle,
    fileIndex: streamInfo.selected_file_index,
    isPack,
    lastUsed: Date.now(),
  });
  if (isPack && episode) {
    StorageService.saveTorrentMemory({
      mediaId: media.id,
      mediaType: media.mediaType,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      magnetUrl,
      torrentTitle,
      fileIndex: streamInfo.selected_file_index,
      isPack: false,
      lastUsed: Date.now(),
    });
  }
}
