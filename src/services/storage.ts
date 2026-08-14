import { AppSettings, Collection, MediaItem, RememberedTorrent, StreamProgress, UserProfile, UserListProgressEntry, AiringScheduleItem } from "../types";

const SETTINGS_KEY = "stream_app_settings_v2";
const PROFILE_KEY = "stream_user_profile_v1";
const PROGRESS_KEY = "stream_watch_progress_v1";
const FAVORITES_KEY = "stream_favorites_v1";
const WATCHLIST_KEY = "stream_watchlist_v1";
const COLLECTIONS_KEY = "stream_collections_v1";
const MEDIA_CACHE_KEY = "stream_media_cache_v1";
const CONTINUE_DISMISSED_KEY = "stream_continue_dismissed_v1";
const TORRENT_MEMORY_KEY = "stream_torrent_memory_v1";
const LIBRARY_KEY = "stream_local_library_v1";
const USER_WATCHING_CACHE_KEY = "stream_user_watching_cache_v1";
const MONTHLY_AIRING_CACHE_PREFIX = "stream_monthly_airing_v1_";

function isWindowsHost(): boolean {
  if (typeof navigator === "undefined") return false;
  return /windows/i.test(navigator.userAgent || navigator.platform || "");
}

function defaultPath(winPath: string, posixPath: string): string {
  return isWindowsHost() ? winPath : posixPath;
}

export const DEFAULT_SETTINGS: AppSettings = {
  downloadPath: defaultPath("C:\\Downloads\\Stream", "~/Downloads/Stream"),
  maxConcurrentDownloads: 3,
  speedLimitMBps: 0,
  animeFolder: defaultPath("C:\\Media\\Anime", "~/Media/Anime"),
  moviesFolder: defaultPath("C:\\Media\\Movies", "~/Media/Movies"),
  tvFolder: defaultPath("C:\\Media\\TV Shows", "~/Media/TV"),

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
  enableTorrentio: true,
  enableYts: true,
  enableEztv: true,
  enableSubsPlease: true,
  enablePirateBay: true,

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
  private static _settingsCache: AppSettings | null = null;
  private static _profileCache: UserProfile | null = null;
  private static _progressCache: StreamProgress[] | null = null;
  private static _favoritesCache: string[] | null = null;
  private static _favoritesSet: Set<string> | null = null;
  private static _watchlistCache: string[] | null = null;
  private static _watchlistSet: Set<string> | null = null;
  private static _collectionsCache: Collection[] | null = null;
  private static _libraryCache: import("../types").LocalMediaItem[] | null = null;
  private static _continueDismissedCache: string[] | null = null;
  private static _torrentMemoryCache: RememberedTorrent[] | null = null;

  static getSettings(): AppSettings {
    if (this._settingsCache) return this._settingsCache;
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      const merged: AppSettings = stored
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
        : { ...DEFAULT_SETTINGS };
      this._settingsCache = this.normalizeSettings(merged);
      return this._settingsCache;
    } catch {
      this._settingsCache = { ...DEFAULT_SETTINGS };
      return this._settingsCache;
    }
  }

  /** Rewrite leftover Windows default paths when running on macOS/Linux. */
  private static normalizeSettings(settings: AppSettings): AppSettings {
    if (isWindowsHost()) return settings;
    const winAbs = (p: string) => /^[a-zA-Z]:[\\/]/.test(p || "");
    return {
      ...settings,
      downloadPath: winAbs(settings.downloadPath) ? DEFAULT_SETTINGS.downloadPath : settings.downloadPath,
      animeFolder: winAbs(settings.animeFolder) ? DEFAULT_SETTINGS.animeFolder : settings.animeFolder,
      moviesFolder: winAbs(settings.moviesFolder) ? DEFAULT_SETTINGS.moviesFolder : settings.moviesFolder,
      tvFolder: winAbs(settings.tvFolder) ? DEFAULT_SETTINGS.tvFolder : settings.tvFolder,
    };
  }

  static saveSettings(settings: AppSettings): void {
    this._settingsCache = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  static getProfile(): UserProfile {
    if (this._profileCache) return this._profileCache;
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      const profile: UserProfile = stored ? { ...DEFAULT_PROFILE, ...JSON.parse(stored) } : { ...DEFAULT_PROFILE };
      this._profileCache = profile;
      return profile;
    } catch {
      this._profileCache = { ...DEFAULT_PROFILE };
      return this._profileCache;
    }
  }

  static saveProfile(profile: UserProfile): void {
    this._profileCache = profile;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
  }

  static getWatchProgress(): StreamProgress[] {
    if (this._progressCache) return this._progressCache;
    try {
      const stored = localStorage.getItem(PROGRESS_KEY);
      this._progressCache = stored ? JSON.parse(stored) : [];
      return this._progressCache!;
    } catch {
      this._progressCache = [];
      return [];
    }
  }

  static isWatchedFast(mediaId: string): boolean {
    const list = this.getWatchProgress();
    return list.some((h) => h.mediaId === mediaId && (h.completed || h.percentage >= 90));
  }

  static saveWatchProgress(progress: StreamProgress): void {
    const list = this.getWatchProgress().filter(
      (item) => !(item.mediaId === progress.mediaId && item.episodeNumber === progress.episodeNumber)
    );
    list.unshift(progress);
    const sliced = list.slice(0, 100);
    this._progressCache = sliced;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(sliced));
    } catch {
      // ignore
    }
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
    this._progressCache = list;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  /** Remove all progress entries for a series. */
  static removeSeriesProgress(mediaId: string): void {
    const list = this.getWatchProgress().filter((item) => item.mediaId !== mediaId);
    this._progressCache = list;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  /** Mark all episodes of a series/media as completed. */
  static markSeriesWatched(media: MediaItem, totalEpisodes?: number): void {
    const epCount = totalEpisodes || media.episodesCount || (media.mediaType === "movie" ? 1 : 12);
    const now = Date.now();
    const existing = this.getWatchProgress().filter((p) => p.mediaId !== media.id);
    const newEntries: StreamProgress[] = [];

    for (let i = 1; i <= epCount; i++) {
      newEntries.push({
        mediaId: media.id,
        mediaTitle: media.title,
        mediaType: media.mediaType,
        coverImage: media.coverImage,
        episodeNumber: i,
        currentTime: 1440,
        duration: 1440,
        percentage: 100,
        completed: true,
        lastUpdated: now,
        anilistId: media.anilistId,
      });
    }

    const merged = [...newEntries, ...existing].slice(0, 500);
    this._progressCache = merged;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    this.dismissFromContinue(media.id);
  }

  static getContinueDismissed(): string[] {
    if (this._continueDismissedCache) return this._continueDismissedCache;
    try {
      const stored = localStorage.getItem(CONTINUE_DISMISSED_KEY);
      this._continueDismissedCache = stored ? JSON.parse(stored) : [];
      return this._continueDismissedCache!;
    } catch {
      this._continueDismissedCache = [];
      return [];
    }
  }

  /** Hide a title from Continue (local + AniList-sourced cards). */
  static dismissFromContinue(mediaId: string): void {
    const list = [...this.getContinueDismissed()];
    if (!list.includes(mediaId)) {
      list.push(mediaId);
      const capped = list.slice(-200);
      this._continueDismissedCache = capped;
      try {
        localStorage.setItem(CONTINUE_DISMISSED_KEY, JSON.stringify(capped));
      } catch {
        // ignore
      }
    }
    this.removeSeriesProgress(mediaId);
  }

  static undismissFromContinue(mediaId: string): void {
    const list = this.getContinueDismissed().filter((id) => id !== mediaId);
    this._continueDismissedCache = list;
    try {
      localStorage.setItem(CONTINUE_DISMISSED_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  static getFavorites(): string[] {
    if (this._favoritesCache) return this._favoritesCache;
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      this._favoritesCache = stored ? JSON.parse(stored) : [];
      this._favoritesSet = new Set(this._favoritesCache);
      return this._favoritesCache!;
    } catch {
      this._favoritesCache = [];
      this._favoritesSet = new Set();
      return [];
    }
  }

  static toggleFavorite(mediaId: string): boolean {
    const list = [...this.getFavorites()];
    const index = list.indexOf(mediaId);
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(mediaId);
      added = true;
    }
    this._favoritesCache = list;
    this._favoritesSet = new Set(list);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    return added;
  }

  static getWatchlist(): string[] {
    if (this._watchlistCache) return this._watchlistCache;
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      this._watchlistCache = stored ? JSON.parse(stored) : [];
      this._watchlistSet = new Set(this._watchlistCache);
      return this._watchlistCache!;
    } catch {
      this._watchlistCache = [];
      this._watchlistSet = new Set();
      return [];
    }
  }

  static toggleWatchlist(mediaId: string): boolean {
    const list = [...this.getWatchlist()];
    const index = list.indexOf(mediaId);
    let added = false;
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(mediaId);
      added = true;
    }
    this._watchlistCache = list;
    this._watchlistSet = new Set(list);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    return added;
  }

  static isFavorite(mediaId: string): boolean {
    if (!this._favoritesSet) this.getFavorites();
    return this._favoritesSet?.has(mediaId) ?? false;
  }

  static isInWatchlist(mediaId: string): boolean {
    if (!this._watchlistSet) this.getWatchlist();
    return this._watchlistSet?.has(mediaId) ?? false;
  }

  static getCollections(): Collection[] {
    if (this._collectionsCache) return this._collectionsCache;
    try {
      const stored = localStorage.getItem(COLLECTIONS_KEY);
      if (stored) {
        this._collectionsCache = JSON.parse(stored);
        return this._collectionsCache!;
      }
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
      this._collectionsCache = defaults;
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(defaults));
      return defaults;
    } catch {
      this._collectionsCache = [];
      return [];
    }
  }

  static saveCollections(collections: Collection[]): void {
    this._collectionsCache = collections;
    try {
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    } catch {
      // ignore
    }
  }

  static getLibrary(): import("../types").LocalMediaItem[] {
    if (this._libraryCache) return this._libraryCache;
    try {
      const stored = localStorage.getItem(LIBRARY_KEY);
      this._libraryCache = stored ? JSON.parse(stored) : [];
      return this._libraryCache!;
    } catch {
      this._libraryCache = [];
      return [];
    }
  }

  static saveLibrary(items: import("../types").LocalMediaItem[]): void {
    this._libraryCache = items;
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(items.slice(0, 5000)));
    } catch {
      // quota
    }
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

  static getTorrentMemory(): RememberedTorrent[] {
    if (this._torrentMemoryCache) return this._torrentMemoryCache;
    try {
      const stored = localStorage.getItem(TORRENT_MEMORY_KEY);
      this._torrentMemoryCache = stored ? JSON.parse(stored) : [];
      return this._torrentMemoryCache!;
    } catch {
      this._torrentMemoryCache = [];
      return [];
    }
  }

  static saveTorrentMemory(entry: RememberedTorrent): void {
    if (!entry.magnetUrl) return;
    const list = this.getTorrentMemory().filter((item) => {
      if (item.mediaId !== entry.mediaId) return true;
      if (entry.isPack) return !(item.isPack && item.seasonNumber === entry.seasonNumber);
      return !(
        item.episodeNumber === entry.episodeNumber &&
        item.seasonNumber === entry.seasonNumber &&
        !item.isPack
      );
    });
    list.unshift({ ...entry, lastUsed: Date.now() });
    const sliced = list.slice(0, 200);
    this._torrentMemoryCache = sliced;
    try {
      localStorage.setItem(TORRENT_MEMORY_KEY, JSON.stringify(sliced));
    } catch {
      // ignore
    }
  }

  static forgetTorrentMemory(mediaId: string, magnetUrl?: string): void {
    const list = this.getTorrentMemory().filter((item) => {
      if (item.mediaId !== mediaId) return true;
      if (magnetUrl) return item.magnetUrl !== magnetUrl;
      return false;
    });
    this._torrentMemoryCache = list;
    try {
      localStorage.setItem(TORRENT_MEMORY_KEY, JSON.stringify(list));
    } catch {
      // ignore
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

  private static _userWatchingMemoryCache: UserListProgressEntry[] | null = null;

  static getUserWatchingCache(): UserListProgressEntry[] {
    if (this._userWatchingMemoryCache) {
      return this._userWatchingMemoryCache;
    }
    try {
      const stored = localStorage.getItem(USER_WATCHING_CACHE_KEY);
      this._userWatchingMemoryCache = stored ? JSON.parse(stored) : [];
      return this._userWatchingMemoryCache!;
    } catch {
      this._userWatchingMemoryCache = [];
      return [];
    }
  }

  static saveUserWatchingCache(entries: UserListProgressEntry[]): void {
    this._userWatchingMemoryCache = entries;
    try {
      localStorage.setItem(USER_WATCHING_CACHE_KEY, JSON.stringify(entries.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  static getMonthlyAiringCache(key: string): AiringScheduleItem[] | null {
    try {
      const stored = sessionStorage.getItem(`${MONTHLY_AIRING_CACHE_PREFIX}${key}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as { at: number; items: AiringScheduleItem[] };
      if (Date.now() - parsed.at < 20 * 60 * 1000 && Array.isArray(parsed.items)) {
        return parsed.items;
      }
      return null;
    } catch {
      return null;
    }
  }

  static saveMonthlyAiringCache(key: string, items: AiringScheduleItem[]): void {
    try {
      sessionStorage.setItem(
        `${MONTHLY_AIRING_CACHE_PREFIX}${key}`,
        JSON.stringify({ at: Date.now(), items })
      );
    } catch {
      // ignore
    }
  }

  static getPlayerVolume(): { volume: number; muted: boolean } {
    try {
      const stored = localStorage.getItem("stream_player_volume_v1");
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return { volume: 100, muted: false };
  }

  static savePlayerVolume(volume: number, muted: boolean): void {
    try {
      localStorage.setItem("stream_player_volume_v1", JSON.stringify({ volume, muted }));
    } catch {
      // ignore
    }
  }

  static getRecentSearches(): string[] {
    try {
      const stored = localStorage.getItem("stream_recent_searches_v1");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static addRecentSearch(query: string): void {
    const q = query.trim();
    if (!q) return;
    const list = this.getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    try {
      localStorage.setItem("stream_recent_searches_v1", JSON.stringify(list.slice(0, 10)));
    } catch {
      // ignore
    }
  }

  static clearRecentSearches(): void {
    try {
      localStorage.removeItem("stream_recent_searches_v1");
    } catch {
      // ignore
    }
  }

  static clearAllWatchProgress(): void {
    this._progressCache = [];
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      // ignore
    }
  }

  static exportBackupJson(): string {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      settings: this.getSettings(),
      profile: this.getProfile(),
      watchProgress: this.getWatchProgress(),
      favorites: this.getFavorites(),
      watchlist: this.getWatchlist(),
      collections: this.getCollections(),
      mediaCache: this.getMediaCache(),
    };
    return JSON.stringify(data, null, 2);
  }

  static importBackupJson(jsonString: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== "object") {
        return { success: false, error: "Invalid backup JSON file." };
      }
      if (parsed.settings) this.saveSettings(parsed.settings);
      if (parsed.profile) this.saveProfile(parsed.profile);
      if (Array.isArray(parsed.watchProgress)) {
        this._progressCache = parsed.watchProgress;
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(parsed.watchProgress));
      }
      if (Array.isArray(parsed.favorites)) {
        this._favoritesCache = parsed.favorites;
        this._favoritesSet = new Set(parsed.favorites);
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(parsed.favorites));
      }
      if (Array.isArray(parsed.watchlist)) {
        this._watchlistCache = parsed.watchlist;
        this._watchlistSet = new Set(parsed.watchlist);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(parsed.watchlist));
      }
      if (Array.isArray(parsed.collections)) {
        this.saveCollections(parsed.collections);
      }
      if (parsed.mediaCache && typeof parsed.mediaCache === "object") {
        this._mediaMemoryCache = parsed.mediaCache;
        localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(parsed.mediaCache));
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
