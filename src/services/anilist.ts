import { Episode, MediaItem } from "../types";
import { StorageService } from "./storage";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const TRENDING_ANIME_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: TRENDING_DESC) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      coverImage {
        extraLarge
        large
        color
      }
      bannerImage
      description(asHtml: false)
      episodes
      status
      format
      seasonYear
      averageScore
      genres
      studios(isMain: true) {
        nodes {
          name
        }
      }
    }
  }
}
`;

const SEARCH_ANIME_QUERY = `
query ($search: String, $genre: String, $year: Int, $format: MediaFormat) {
  Page(page: 1, perPage: 24) {
    media(type: ANIME, search: $search, genre: $genre, seasonYear: $year, format: $format, sort: POPULARITY_DESC) {
      id
      idMal
      title {
        romaji
        english
      }
      coverImage {
        large
      }
      bannerImage
      description
      episodes
      status
      format
      seasonYear
      averageScore
      genres
    }
  }
}
`;

const ANIME_DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title {
      romaji
      english
      native
    }
    coverImage {
      extraLarge
    }
    bannerImage
    description(asHtml: false)
    episodes
    status
    format
    seasonYear
    averageScore
    genres
    nextAiringEpisode {
      episode
      timeUntilAiring
    }
    studios(isMain: true) {
      nodes {
        name
      }
    }
    characters(sort: ROLE, perPage: 6) {
      nodes {
        name {
          full
        }
        image {
          medium
        }
      }
    }
    streamingEpisodes {
      title
      thumbnail
      url
    }
    mediaListEntry {
      id
      status
      progress
      score
    }
  }
}
`;

const USER_CURRENT_WATCHING_QUERY = `
query ($userId: Int) {
  MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
    lists {
      entries {
        progress
        score
        media {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
          }
          bannerImage
          description(asHtml: false)
          episodes
          status
          format
          seasonYear
          averageScore
          genres
          streamingEpisodes {
            title
            thumbnail
          }
        }
      }
    }
  }
}
`;

const USER_ALL_LISTS_QUERY = `
query ($userId: Int) {
  MediaListCollection(userId: $userId, type: ANIME) {
    lists {
      name
      status
      entries {
        mediaId
        progress
      }
    }
  }
}
`;

const AIRING_SCHEDULE_QUERY = `
query ($weekStart: Int, $weekEnd: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
      currentPage
    }
    airingSchedules(airingAt_greater: $weekStart, airingAt_lesser: $weekEnd, sort: TIME) {
      id
      airingAt
      timeUntilAiring
      episode
      media {
        id
        title {
          romaji
          english
        }
        coverImage {
          medium
          large
        }
        bannerImage
      }
    }
  }
}
`;

const SAVE_MEDIA_LIST_MUTATION = `
mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, score: $score) {
    id
    status
    progress
    score
  }
}
`;

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
  mediaTitle: string;
  coverImage: string;
  bannerImage?: string;
  dayOfMonth: number; // 1-31
  /** 0=Mon … 6=Sun */
  dayOfWeek: number;
  /** Local calendar key YYYY-M-D for exact cell matching */
  dateKey: string;
  isUserTracked?: boolean;
  isWatched?: boolean;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export class AniListService {
  static async fetchTrending(page = 1, perPage = 36): Promise<MediaItem[]> {
    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: TRENDING_ANIME_QUERY,
          variables: { page, perPage },
        }),
      });

      if (!response.ok) throw new Error("AniList response error");
      const json = await response.json();
      const mediaList = json.data?.Page?.media || [];
      return mediaList.map((m: any) => this.formatAniListMedia(m));
    } catch (e) {
      console.warn("AniList API fallback used:", e);
      return MOCK_ANIME_ITEMS;
    }
  }

  static async fetchUserCurrentWatching(): Promise<UserListProgressEntry[]> {
    try {
      const profile = StorageService.getProfile();
      if (!profile.anilistUser?.id) return [];

      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: USER_CURRENT_WATCHING_QUERY,
          variables: { userId: profile.anilistUser.id },
        }),
      });

      if (!response.ok) throw new Error("AniList user collection error");
      const json = await response.json();
      const lists = json.data?.MediaListCollection?.lists || [];
      const entries: UserListProgressEntry[] = [];
      const seenMediaIds = new Set<number>();

      for (const list of lists) {
        for (const entry of list.entries || []) {
          const rawId = entry.media?.id as number | undefined;
          if (rawId && seenMediaIds.has(rawId)) continue;
          if (rawId) seenMediaIds.add(rawId);

          const media = this.formatAniListMedia(entry.media);
          const streaming = entry.media?.streamingEpisodes || [];
          const nextEp = (entry.progress || 0) + 1;
          const streamInfo = streaming.find((s: any) => s.title?.includes(`${nextEp}`));

          entries.push({
            media,
            progress: entry.progress || 0,
            episodesCount: media.episodesCount || 12,
            nextEpisodeTitle: streamInfo?.title || `Episode ${nextEp}`,
            thumbnail: streamInfo?.thumbnail || media.bannerImage || media.coverImage,
          });
        }
      }

      return entries;
    } catch (e) {
      console.warn("AniList user watching list fallback:", e);
      return [];
    }
  }

  static async fetchUserTrackedMediaMap(): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    try {
      const profile = StorageService.getProfile();
      if (!profile.anilistUser?.id) return map;

      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: USER_ALL_LISTS_QUERY,
          variables: { userId: profile.anilistUser.id },
        }),
      });

      if (!response.ok) return map;
      const json = await response.json();
      const lists = json.data?.MediaListCollection?.lists || [];

      for (const list of lists) {
        for (const entry of list.entries || []) {
          if (entry.mediaId) {
            map.set(entry.mediaId, entry.progress || 0);
          }
        }
      }
    } catch {
      // Fallback
    }
    return map;
  }

  /**
   * Full-month airing schedule (paginated). Prefer this for the home calendar.
   * @param year full year e.g. 2026
   * @param month 0-indexed month (Date style)
   */
  static async fetchMonthlyAiringSchedule(
    year: number,
    month: number,
    myListsOnly = true
  ): Promise<AiringScheduleItem[]> {
    try {
      const rangeStart = new Date(year, month, 1, 0, 0, 0, 0);
      const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const weekStart = Math.floor(rangeStart.getTime() / 1000) - 1;
      const weekEnd = Math.floor(rangeEnd.getTime() / 1000) + 1;

      const cacheKey = `stream_airing_${year}_${month}_${myListsOnly ? "mine" : "all"}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { at: number; items: AiringScheduleItem[] };
          if (Date.now() - parsed.at < 10 * 60 * 1000 && Array.isArray(parsed.items)) {
            return parsed.items;
          }
        }
      } catch {
        // ignore cache
      }

      const userMap = await this.fetchUserTrackedMediaMap();
      const result: AiringScheduleItem[] = [];
      let page = 1;
      let hasNext = true;
      const maxPages = 12;

      while (hasNext && page <= maxPages) {
        const response = await fetch(ANILIST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: AIRING_SCHEDULE_QUERY,
            variables: { weekStart, weekEnd, page },
          }),
        });

        if (!response.ok) throw new Error("Airing schedule error");
        const json = await response.json();
        const pageData = json.data?.Page;
        const rawSchedules = pageData?.airingSchedules || [];
        hasNext = Boolean(pageData?.pageInfo?.hasNextPage);
        page += 1;

        for (const s of rawSchedules) {
          const date = new Date(s.airingAt * 1000);
          // Only keep items that land in the requested local month
          if (date.getFullYear() !== year || date.getMonth() !== month) continue;

          let day = date.getDay() - 1;
          if (day < 0) day = 6;
          const mediaId = s.media?.id || 0;
          const userProgress = userMap.get(mediaId);
          const isTracked = userProgress !== undefined;
          const isWatched = isTracked && userProgress! >= s.episode;

          if (myListsOnly && userMap.size > 0 && !isTracked) {
            continue;
          }

          result.push({
            id: s.id,
            airingAt: s.airingAt,
            episode: s.episode,
            mediaId,
            mediaTitle: s.media?.title?.english || s.media?.title?.romaji || "Anime",
            coverImage: s.media?.coverImage?.large || s.media?.coverImage?.medium || "",
            bannerImage: s.media?.bannerImage || s.media?.coverImage?.large,
            dayOfMonth: date.getDate(),
            dayOfWeek: day,
            dateKey: localDateKey(date),
            isUserTracked: isTracked,
            isWatched,
          });
        }
      }

      // Stable order: time then title
      result.sort((a, b) => a.airingAt - b.airingAt || a.mediaTitle.localeCompare(b.mediaTitle));

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), items: result }));
      } catch {
        // quota
      }

      return result;
    } catch (e) {
      console.warn("Airing schedule fallback:", e);
      return MOCK_SCHEDULE_ITEMS.map((item) => ({
        ...item,
        dateKey: item.dateKey || `2026-8-${item.dayOfMonth}`,
      }));
    }
  }

  /** @deprecated Use fetchMonthlyAiringSchedule — kept for callers */
  static async fetchWeeklyAiringSchedule(myListsOnly = true): Promise<AiringScheduleItem[]> {
    const now = new Date();
    return this.fetchMonthlyAiringSchedule(now.getFullYear(), now.getMonth(), myListsOnly);
  }

  static async searchAnime(params: {
    query?: string;
    genre?: string;
    year?: number;
    format?: string;
  }): Promise<MediaItem[]> {
    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: SEARCH_ANIME_QUERY,
          variables: {
            search: params.query || undefined,
            genre: params.genre || undefined,
            year: params.year || undefined,
            format: params.format || undefined,
          },
        }),
      });

      if (!response.ok) throw new Error("AniList search error");
      const json = await response.json();
      const mediaList = json.data?.Page?.media || [];
      return mediaList.map((m: any) => this.formatAniListMedia(m));
    } catch (e) {
      console.warn("AniList search fallback used:", e);
      let list = [...MOCK_ANIME_ITEMS];
      if (params.query) {
        const q = params.query.toLowerCase();
        list = list.filter((item) => item.title.toLowerCase().includes(q) || item.genres.some((g) => g.toLowerCase().includes(q)));
      }
      return list;
    }
  }

  static async getAnimeDetail(anilistId: number): Promise<{ media: MediaItem; episodes: Episode[] }> {
    try {
      const profile = StorageService.getProfile();
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
      if (profile.anilistToken) {
        headers["Authorization"] = `Bearer ${profile.anilistToken}`;
      }

      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: ANIME_DETAIL_QUERY,
          variables: { id: anilistId },
        }),
      });

      if (!response.ok) throw new Error("AniList detail error");
      const json = await response.json();
      const raw = json.data?.Media;
      if (!raw) throw new Error("Media not found");

      const media = this.formatAniListMedia(raw);
      const totalEp = raw.episodes || 12;
      const streaming = raw.streamingEpisodes || [];

      const episodes: Episode[] = Array.from({ length: totalEp }, (_, idx) => {
        const epNum = idx + 1;
        const streamInfo = streaming.find((s: any) => s.title?.includes(`Episode ${epNum}`) || s.title?.includes(`${epNum}`));
        return {
          id: `ep_ani_${anilistId}_${epNum}`,
          episodeNumber: epNum,
          seasonNumber: 1,
          title: streamInfo?.title || `Episode ${epNum}`,
          synopsis: `Watch episode ${epNum} of ${media.title}. High definition 1080p stream.`,
          thumbnail: streamInfo?.thumbnail || media.bannerImage || media.coverImage,
          durationMinutes: 24,
          airDate: "2024",
        };
      });

      return { media, episodes };
    } catch (e) {
      console.warn("AniList detail fallback:", e);
      const item = MOCK_ANIME_ITEMS.find((m) => m.anilistId === anilistId) || MOCK_ANIME_ITEMS[0];
      const episodes: Episode[] = Array.from({ length: item.episodesCount || 12 }, (_, i) => ({
        id: `ep_mock_${i + 1}`,
        episodeNumber: i + 1,
        seasonNumber: 1,
        title: `Episode ${i + 1}`,
        synopsis: `Official episode ${i + 1} narrative event overview.`,
        thumbnail: item.bannerImage || item.coverImage,
        durationMinutes: 24,
      }));
      return { media: item, episodes };
    }
  }

  /**
   * Sync AniList episode progress & status to AniList API using OAuth token
   */
  static async updateAniListProgress(params: {
    anilistId: number;
    episodeNumber: number;
    status?: "CURRENT" | "COMPLETED" | "PAUSED" | "DROPPED" | "PLANNING";
    score?: number;
  }): Promise<boolean> {
    const profile = StorageService.getProfile();
    const token = profile.anilistToken;

    if (!token) {
      console.log("AniList sync skipped: No AniList token provided in user profile.");
      return false;
    }

    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: SAVE_MEDIA_LIST_MUTATION,
          variables: {
            mediaId: params.anilistId,
            progress: params.episodeNumber,
            status: params.status || "CURRENT",
            score: params.score || undefined,
          },
        }),
      });

      if (!response.ok) throw new Error(`AniList mutation error: ${response.statusText}`);
      const json = await response.json();
      const updated = json.data?.SaveMediaListEntry;
      if (updated) {
        console.log(`✓ AniList Synced Successfully: Media ${params.anilistId} -> Ep ${params.episodeNumber}`);
        return true;
      }
      return false;
    } catch (e) {
      console.warn("AniList Sync Error:", e);
      return false;
    }
  }

  private static formatAniListMedia(m: any): MediaItem {
    const title = m.title?.english || m.title?.romaji || m.title?.native || "Unknown Anime";
    const studios = m.studios?.nodes?.map((s: any) => s.name).join(", ") || "Studio";
    const cast = m.characters?.nodes?.map((c: any) => ({
      name: c.name?.full || "Character",
      role: "Main",
      avatar: c.image?.medium,
    })) || [];

    return {
      id: `ani_${m.id}`,
      anilistId: m.id,
      tmdbId: m.idMal,
      title,
      japaneseTitle: m.title?.native,
      mediaType: "anime",
      format: m.format || "TV",
      status: m.status || "FINISHED",
      coverImage: m.coverImage?.extraLarge || m.coverImage?.large || "",
      bannerImage: m.bannerImage || m.coverImage?.extraLarge,
      synopsis: m.description ? m.description.replace(/<[^>]*>?/gm, "") : "No description available.",
      genres: m.genres || ["Action", "Fantasy"],
      year: m.seasonYear || 2024,
      score: m.averageScore ? Math.round(m.averageScore) / 10 : 8.5,
      episodesCount: m.episodes || 12,
      seasonsCount: 1,
      studio: studios,
      cast,
      nextAiringEpisode: m.nextAiringEpisode,
    };
  }
}

export const MOCK_SCHEDULE_ITEMS: AiringScheduleItem[] = [
  { id: 1, airingAt: 1785960000, episode: 5, mediaId: 101, mediaTitle: "BLACK TORCH", coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400", dayOfMonth: 1, dayOfWeek: 5, dateKey: "2026-8-1", isWatched: true },
  { id: 2, airingAt: 1785960000, episode: 2, mediaId: 102, mediaTitle: "BLEACH: Thousand-Year Blood War", coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400", dayOfMonth: 1, dayOfWeek: 5, dateKey: "2026-8-1", isWatched: true },
  { id: 3, airingAt: 1785960000, episode: 17, mediaId: 103, mediaTitle: "Daemons of the Shadow Realm", coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400", dayOfMonth: 1, dayOfWeek: 5, dateKey: "2026-8-1", isWatched: false },
  { id: 4, airingAt: 1786046400, episode: 5, mediaId: 104, mediaTitle: "You and I Are Polar Opposites", coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400", dayOfMonth: 2, dayOfWeek: 6, dateKey: "2026-8-2", isWatched: false },
  { id: 5, airingAt: 1786046400, episode: 5, mediaId: 105, mediaTitle: "Sparks of Tomorrow", coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400", dayOfMonth: 2, dayOfWeek: 6, dateKey: "2026-8-2", isWatched: false },
];

export const MOCK_ANIME_ITEMS: MediaItem[] = [
  {
    id: "ani_113415",
    anilistId: 113415,
    title: "Saga of Tanya the Evil Season 2",
    japaneseTitle: "幼女戦記 II",
    mediaType: "anime",
    format: "TV",
    status: "RELEASING",
    coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx134129-rSgHkYjXv75E.jpg",
    bannerImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
    synopsis: "The second season of Youjo Senki following the imperial wizard battalion in an alternate world war.",
    genres: ["Action", "Fantasy", "Military"],
    year: 2026,
    score: 8.1,
    episodesCount: 12,
    seasonsCount: 2,
    studio: "NUT",
  },
];
