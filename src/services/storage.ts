import { AppSettings, Collection, MediaItem, StreamProgress, UserProfile } from "../types";

const SETTINGS_KEY = "stream_app_settings_v2";
const PROFILE_KEY = "stream_user_profile_v1";
const PROGRESS_KEY = "stream_watch_progress_v1";
const FAVORITES_KEY = "stream_favorites_v1";
const WATCHLIST_KEY = "stream_watchlist_v1";
const COLLECTIONS_KEY = "stream_collections_v1";
const MEDIA_CACHE_KEY = "stream_media_cache_v1";
const CONTINUE_DISMISSED_KEY = "stream_continue_dismissed_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  downloadPath: "C:\\Downloads\\Stream",
  maxConcurrentDownloads: 3,
  speedLimitMBps: 0,
  animeFolder: "C:\\Media\\Anime",
  moviesFolder: "C:\\Media\\Movies",
  tvFolder: "C:\\Media\\TV Shows",

  tmdbApiKey: "",
  anilistToken: "",

  // Providers & Indexers
  enableNyaa: true,
  nyaaUrl: "https://nyaa.si",
  enableAnimeTosho: true,
  animeToshoUrl: "https://animetosho.org",
  enableSeaDex: true,
  seaDexUrl: "https://releases.moe",
  seaDexBestOnly: true,

  enableJackett: false,
  jackettUrl: "http://localhost:9117",
  jackettApiKey: "",

  enableProwlarr: false,
  prowlarrUrl: "http://localhost:9696",
  prowlarrApiKey: "",

  autoPlayNext: true,
  defaultSubtitles: "English",
  hardwareAcceleration: true,
  postWatchBehavior: "keep",

  easyWatch: true,
  preferredQuality: "1080p",
  minSeeders: 1,

  accentColor: "#a855f7",
};

export const DEFAULT_PROFILE: UserProfile = {
  id: "default_user",
  name: "Streamer",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
};

export class StorageService {
  static getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  static saveSettings(settings: AppSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  static getProfile(): UserProfile {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      return stored ? { ...DEFAULT_PROFILE, ...JSON.parse(stored) } : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  static saveProfile(profile: UserProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  static getWatchProgress(): StreamProgress[] {
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static saveWatchProgress(progress: StreamProgress): void {
    const list = this.getWatchProgress().filter(
      (item) => !(item.mediaId === progress.mediaId && item.episodeNumber === progress.episodeNumber)
    );
    list.unshift(progress);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(list.slice(0, 100)));
    // Re-showing progress undoes a prior "remove from continue"
    this.undismissFromContinue(progress.mediaId);
  }

  /** Remove one episode's progress. */
  static removeWatchProgress(mediaId: string, episodeNumber?: number): void {
    const list = this.getWatchProgress().filter((item) => {
      if (item.mediaId !== mediaId) return true;
      if (episodeNumber === undefined) return false;
      return item.episodeNumber !== episodeNumber;
    });
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
  }

  /** Remove all progress entries for a series. */
  static removeSeriesProgress(mediaId: string): void {
    const list = this.getWatchProgress().filter((item) => item.mediaId !== mediaId);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
  }

  static getContinueDismissed(): string[] {
    try {
      const stored = localStorage.getItem(CONTINUE_DISMISSED_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /** Hide a title from Continue (local + AniList-sourced cards). */
  static dismissFromContinue(mediaId: string): void {
    const list = this.getContinueDismissed();
    if (!list.includes(mediaId)) {
      list.push(mediaId);
      localStorage.setItem(CONTINUE_DISMISSED_KEY, JSON.stringify(list.slice(-200)));
    }
    this.removeSeriesProgress(mediaId);
  }

  static undismissFromContinue(mediaId: string): void {
    const list = this.getContinueDismissed().filter((id) => id !== mediaId);
    localStorage.setItem(CONTINUE_DISMISSED_KEY, JSON.stringify(list));
  }

  static getFavorites(): string[] {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static toggleFavorite(mediaId: string): boolean {
    const list = this.getFavorites();
    const index = list.indexOf(mediaId);
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(mediaId);
      added = true;
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    return added;
  }

  static getWatchlist(): string[] {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static toggleWatchlist(mediaId: string): boolean {
    const list = this.getWatchlist();
    const index = list.indexOf(mediaId);
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(mediaId);
      added = true;
    }
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    return added;
  }

  static isFavorite(mediaId: string): boolean {
    return this.getFavorites().includes(mediaId);
  }

  static isInWatchlist(mediaId: string): boolean {
    return this.getWatchlist().includes(mediaId);
  }

  static getCollections(): Collection[] {
    try {
      const stored = localStorage.getItem(COLLECTIONS_KEY);
      if (stored) return JSON.parse(stored);
      const defaults: Collection[] = [
        {
          id: "col_ghibli",
          name: "Masterpieces & Classics",
          description: "Timeless animated works and cinematic achievements",
          mediaIds: ["ani_16498", "ani_5114", "tmdb_m_27205"],
          createdAt: Date.now(),
        },
        {
          id: "col_cyberpunk",
          name: "Sci-Fi & Cyberpunk",
          description: "Futuristic dystopias, high tech and neon rain",
          mediaIds: ["ani_113415", "tmdb_m_603", "tmdb_m_335984"],
          createdAt: Date.now(),
        },
      ];
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(defaults));
      return defaults;
    } catch {
      return [];
    }
  }

  static saveCollections(collections: Collection[]): void {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  }

  private static _mediaMemoryCache: Record<string, MediaItem> | null = null;

  /** Persist media metadata so watchlist/favorites work outside the current trending pool. */
  static getMediaCache(): Record<string, MediaItem> {
    if (this._mediaMemoryCache) {
      return this._mediaMemoryCache;
    }
    try {
      const stored = localStorage.getItem(MEDIA_CACHE_KEY);
      this._mediaMemoryCache = stored ? JSON.parse(stored) : {};
      return this._mediaMemoryCache!;
    } catch {
      this._mediaMemoryCache = {};
      return this._mediaMemoryCache;
    }
  }

  static cacheMedia(item: MediaItem): void {
    try {
      const cache = this.getMediaCache();
      cache[item.id] = item;
      const keys = Object.keys(cache);
      // Cap cache size
      if (keys.length > 300) {
        for (const k of keys.slice(0, keys.length - 300)) delete cache[k];
      }
      this._mediaMemoryCache = cache;
      localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Quota exceeded — ignore
    }
  }

  static resolveMediaList(ids: string[], pool: MediaItem[]): MediaItem[] {
    const cache = this.getMediaCache();
    const byId = new Map<string, MediaItem>();
    for (const m of pool) byId.set(m.id, m);
    for (const [id, m] of Object.entries(cache)) {
      if (!byId.has(id)) byId.set(id, m);
    }
    return ids.map((id) => byId.get(id)).filter((m): m is MediaItem => Boolean(m));
  }
}
