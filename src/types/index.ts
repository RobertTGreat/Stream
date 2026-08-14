export type MediaType = "anime" | "movie" | "tv";

export type MediaFormat = "TV" | "MOVIE" | "OVA" | "SPECIAL" | "SERIES";

export type MediaStatus = "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "CANCELLED";

export interface FranchiseSeason {
  id: string;
  seasonNumber: number;
  seasonLabel: string;
  title: string;
  year?: number;
  episodesCount?: number;
  coverImage?: string;
  bannerImage?: string;
  format?: string;
  status?: string;
  score?: number;
  mediaType: MediaType;
  anilistId?: number;
  tmdbId?: number;
}

export interface MediaItem {
  id: string;
  tmdbId?: number;
  anilistId?: number;
  malId?: number;
  imdbId?: string;
  title: string;
  japaneseTitle?: string;
  mediaType: MediaType;
  format?: MediaFormat;
  status?: MediaStatus;
  coverImage: string;
  bannerImage?: string;
  synopsis: string;
  genres: string[];
  year?: number;
  score?: number;
  episodesCount?: number;
  seasonsCount?: number;
  studio?: string;
  cast?: { name: string; role: string; avatar?: string }[];
  nextAiringEpisode?: { episode: number; timeUntilAiring: number };
  relatedSeasons?: FranchiseSeason[];
}

export interface Episode {
  id: string;
  episodeNumber: number;
  seasonNumber?: number;
  title: string;
  synopsis?: string;
  thumbnail?: string;
  durationMinutes?: number;
  videoUrl?: string;
  airDate?: string;
  unreleased?: boolean;
}

export interface LocalMediaItem {
  id: string;
  path: string;
  filename: string;
  parsed_title: string;
  season?: number;
  episode?: number;
  media_type: MediaType;
  size_bytes: number;
  extension: string;
  last_modified: number;
}

export interface ScanLibraryResult {
  items: LocalMediaItem[];
  error?: string | null;
}

export interface TorrentFileItem {
  index: number;
  name: string;
  length: number;
  is_video: boolean;
}

export interface TorrentAddResult {
  task_id: string;
  title: string;
  files: TorrentFileItem[];
  recommended_file_index: number;
}

export interface StreamInfo {
  task_id: string;
  stream_url: string;
  is_ready: boolean;
  buffered_percent: number;
  title: string;
  selected_file_index: number;
  files: TorrentFileItem[];
  needs_file_pick?: boolean;
}

export interface MpvTrack {
  id: number;
  track_type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  selected: boolean;
}

export interface DownloadTask {
  id: string;
  title: string;
  media_type: MediaType;
  magnet_link: string;
  save_path: string;
  total_bytes: number;
  downloaded_bytes: number;
  progress: number;
  download_speed_bps: number;
  eta_seconds: number;
  seeders: number;
  peers: number;
  status: "Queued" | "Downloading" | "Streaming" | "Paused" | "Completed" | "Error";
  created_at: number;
  stream_url?: string;
}

export interface TorrentResult {
  id: string;
  title: string;
  magnet_url: string;
  torrent_url?: string;
  size_bytes: number;
  size_formatted: string;
  seeders: number;
  leechers: number;
  quality: string;
  source_name: string;
  release_group?: string;
  date_posted: string;
  media_type: MediaType;
  is_best_release?: boolean;
}

/** Preferred max/target resolution for auto-pick */
export type PreferredQuality = "any" | "720p" | "1080p" | "2160p";

export interface StreamProgress {
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  coverImage: string;
  episodeNumber: number;
  seasonNumber?: number;
  currentTime: number;
  duration: number;
  percentage: number;
  completed?: boolean;
  progressSeconds?: number;
  lastUpdated: number;
  anilistId?: number;
  magnetUrl?: string;
  torrentTitle?: string;
  streamUrl?: string;
  fileIndex?: number;
}

export interface RememberedTorrent {
  mediaId: string;
  mediaType: MediaType;
  seasonNumber?: number;
  episodeNumber?: number;
  magnetUrl: string;
  torrentTitle: string;
  fileIndex?: number;
  isPack: boolean;
  seeders?: number;
  lastUsed: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  anilistToken?: string;
  anilistUser?: {
    id: number;
    name: string;
    avatar: string;
    bannerImage?: string;
  };
}

export interface AppSettings {
  downloadPath: string;
  maxConcurrentDownloads: number;
  speedLimitMBps: number;
  animeFolder: string;
  moviesFolder: string;
  tvFolder: string;

  // Metadata & Indexer Providers
  tmdbApiKey: string;
  anilistToken: string;

  // Indexers
  enableNyaa: boolean;
  nyaaUrl: string;
  enableAnimeTosho: boolean;
  animeToshoUrl: string;
  enableSeaDex: boolean;
  seaDexUrl: string;
  seaDexBestOnly: boolean;

  enableTorrentio: boolean;
  enableYts: boolean;
  enableEztv: boolean;
  enableSubsPlease: boolean;
  enablePirateBay: boolean;

  enableJackett: boolean;
  jackettUrl: string;
  jackettApiKey: string;

  enableProwlarr: boolean;
  prowlarrUrl: string;
  prowlarrApiKey: string;

  autoPlayNext: boolean;
  defaultSubtitles: string;
  hardwareAcceleration: boolean;
  postWatchBehavior: "keep" | "delete";

  /** Auto-pick the best torrent and start streaming (no picker). */
  easyWatch: boolean;
  /** Preferred quality target when Easy Watch ranks torrents. */
  preferredQuality: PreferredQuality;
  /** Ignore results below this seeder count when auto-picking (0 = off). */
  minSeeders: number;

  /** UI accent color (hex), drives purple highlights app-wide. */
  accentColor: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  mediaIds: string[];
  createdAt: number;
}

export type ViewMode =
  | "home"
  | "anime"
  | "movies"
  | "tv"
  | "library"
  | "search"
  | "collections"
  | "stats"
  | "downloads"
  | "settings"
  | "media-detail";

export interface UserListProgressEntry {
  media: MediaItem;
  progress: number;
  episodesCount: number;
  nextEpisodeTitle?: string;
  thumbnail?: string;
}

export interface AiringScheduleItem {
  id: number;
  airingAt: number;
  episode: number;
  mediaId: number;
  tmdbId?: number;
  mediaTitle: string;
  mediaType?: MediaType;
  coverImage: string;
  bannerImage?: string;
  dayOfMonth: number;
  dayOfWeek: number;
  dateKey: string;
  isUserTracked?: boolean;
  isWatched?: boolean;
}

