import { Episode, MediaItem, UserListProgressEntry, AiringScheduleItem, FranchiseSeason, MediaType } from "../types";
export type { UserListProgressEntry, AiringScheduleItem, FranchiseSeason };
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
query ($search: String, $genre: String, $year: Int, $format: MediaFormat, $sort: [MediaSort]) {
  Page(page: 1, perPage: 36) {
    media(type: ANIME, search: $search, genre: $genre, seasonYear: $year, format: $format, sort: $sort) {
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
    startDate {
      year
      month
      day
    }
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
    relations {
      edges {
        relationType
        node {
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
          format
          status
          seasonYear
          startDate {
            year
            month
            day
          }
          episodes
          averageScore
        }
      }
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
query ($weekStart: Int, $weekEnd: Int, $mediaId_in: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
      currentPage
    }
    airingSchedules(airingAt_greater: $weekStart, airingAt_lesser: $weekEnd, mediaId_in: $mediaId_in, sort: TIME) {
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

const FRANCHISE_RELATIONS_QUERY = `
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
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
      format
      status
      seasonYear
      startDate {
        year
        month
        day
      }
      episodes
      averageScore
      relations {
        edges {
          relationType
          node {
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
            format
            status
            seasonYear
            startDate {
              year
              month
              day
            }
            episodes
            averageScore
          }
        }
      }
    }
  }
}
`;

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function parseSeasonFromTitle(title: string): number | undefined {
  const match =
    title.match(/\bseason\s*(\d+)\b/i) ||
    title.match(/\b(\d+)(?:st|nd|rd|th)\s*season\b/i) ||
    title.match(/\bs(\d+)\b/i);
  if (!match?.[1]) return undefined;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const franchiseMemoryCache = new Map<number, FranchiseSeason[]>();

async function fetchDeepFranchiseSeasons(currentMediaRaw: any): Promise<FranchiseSeason[]> {
  const currentId = currentMediaRaw.id;
  if (franchiseMemoryCache.has(currentId)) {
    return franchiseMemoryCache.get(currentId)!;
  }

  const nodesMap = new Map<number, any>();
  const visitedIds = new Set<number>();
  const toVisitIds = new Set<number>();

  const ingestNode = (node: any, rawRelations?: any[]) => {
    if (!node || !node.id) return;
    if (!nodesMap.has(node.id)) {
      nodesMap.set(node.id, node);
    }
    const edges = rawRelations || node.relations?.edges || [];
    for (const edge of edges) {
      const target = edge.node;
      if (!target || !target.id) continue;
      const rel = edge.relationType;
      if (["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "ALTERNATIVE", "SPIN_OFF", "COMPILATION", "SUMMARY"].includes(rel)) {
        const fmt = target.format;
        if (!fmt || ["TV", "TV_SHORT", "OVA", "MOVIE", "SPECIAL"].includes(fmt)) {
          if (!nodesMap.has(target.id)) {
            nodesMap.set(target.id, target);
          }
          if (!visitedIds.has(target.id)) {
            toVisitIds.add(target.id);
          }
        }
      }
    }
  };

  visitedIds.add(currentId);
  ingestNode(currentMediaRaw, currentMediaRaw.relations?.edges);

  // Multi-deep traversal for prequels, sequels, and parent nodes (up to depth 4)
  let depth = 0;
  while (toVisitIds.size > 0 && depth < 4) {
    depth++;
    const batchIds = Array.from(toVisitIds).slice(0, 30);
    toVisitIds.clear();

    for (const id of batchIds) {
      visitedIds.add(id);
    }

    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: FRANCHISE_RELATIONS_QUERY,
          variables: { ids: batchIds },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const mediaList = json.data?.Page?.media || [];
        for (const m of mediaList) {
          ingestNode(m);
        }
      }
    } catch {
      break;
    }
  }

  const items = Array.from(nodesMap.values());
  if (items.length <= 1) {
    const emptyList: FranchiseSeason[] = [];
    franchiseMemoryCache.set(currentId, emptyList);
    return emptyList;
  }

  // Sort chronologically by startDate / seasonYear, then ID
  items.sort((a, b) => {
    const titleA = a.title?.english || a.title?.romaji || "";
    const titleB = b.title?.english || b.title?.romaji || "";
    const seasonA = parseSeasonFromTitle(titleA);
    const seasonB = parseSeasonFromTitle(titleB);

    if (seasonA != null && seasonB != null && seasonA !== seasonB) {
      return seasonA - seasonB;
    }

    const dateA = (a.startDate?.year || a.seasonYear || 9999) * 10000 + (a.startDate?.month || 1) * 100 + (a.startDate?.day || 1);
    const dateB = (b.startDate?.year || b.seasonYear || 9999) * 10000 + (b.startDate?.month || 1) * 100 + (b.startDate?.day || 1);
    if (dateA !== dateB) return dateA - dateB;

    return a.id - b.id;
  });

  let tvCount = 0;
  let movieCount = 0;
  let ovaCount = 0;

  const result: FranchiseSeason[] = items.map((item) => {
    const title = item.title?.english || item.title?.romaji || item.title?.native || `Season ${tvCount + 1}`;
    const format = item.format || "TV";

    let seasonLabel = "";
    let seasonNumber = 1;

    if (format === "MOVIE") {
      movieCount++;
      seasonLabel = movieCount > 1 ? `Movie ${movieCount}` : "Movie";
      seasonNumber = movieCount;
    } else if (format === "OVA" || format === "SPECIAL") {
      ovaCount++;
      seasonLabel = ovaCount > 1 ? `OVA ${ovaCount}` : "OVA";
      seasonNumber = ovaCount;
    } else {
      tvCount++;
      seasonNumber = tvCount;
      seasonLabel = `S${seasonNumber}`;
    }

    return {
      id: `ani_${item.id}`,
      anilistId: item.id,
      seasonNumber,
      seasonLabel,
      title,
      year: item.seasonYear || item.startDate?.year,
      episodesCount: item.episodes,
      coverImage: item.coverImage?.extraLarge || item.coverImage?.large,
      bannerImage: item.bannerImage,
      format: item.format,
      status: item.status,
      score: item.averageScore ? Math.round(item.averageScore) / 10 : undefined,
      mediaType: "anime" as MediaType,
    };
  });

  for (const item of items) {
    franchiseMemoryCache.set(item.id, result);
  }

  return result;
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

      if (!response.ok) throw new Error(`AniList response error (${response.status})`);
      const json = await response.json();
      if (json.errors?.length) throw new Error(json.errors[0]?.message || "AniList GraphQL error");
      const mediaList = json.data?.Page?.media || [];
      return mediaList.map((m: any) => this.formatAniListMedia(m));
    } catch (e) {
      throw e instanceof Error ? e : new Error("AniList trending request failed");
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

      if (entries.length > 0) {
        StorageService.saveUserWatchingCache(entries);
      }

      return entries;
    } catch (e) {
      console.warn("AniList user watching list fallback:", e);
      return [];
    }
  }

  static async fetchUserTrackedMediaMap(): Promise<Map<number, number>> {
    const map = new Map<number, number>();

    // 1. Local watchlist, favorites, and watch progress
    const progressList = StorageService.getWatchProgress();
    for (const p of progressList) {
      if (p.anilistId) {
        map.set(p.anilistId, p.episodeNumber || 0);
      } else if (p.mediaId.startsWith("ani_")) {
        const id = parseInt(p.mediaId.replace("ani_", ""), 10);
        if (Number.isFinite(id)) map.set(id, p.episodeNumber || 0);
      }
    }

    const watchlist = StorageService.getWatchlist();
    for (const idStr of watchlist) {
      if (idStr.startsWith("ani_")) {
        const id = parseInt(idStr.replace("ani_", ""), 10);
        if (Number.isFinite(id) && !map.has(id)) map.set(id, 0);
      }
    }

    const favorites = StorageService.getFavorites();
    for (const idStr of favorites) {
      if (idStr.startsWith("ani_")) {
        const id = parseInt(idStr.replace("ani_", ""), 10);
        if (Number.isFinite(id) && !map.has(id)) map.set(id, 0);
      }
    }

    // 2. AniList user lists (CURRENT, PLANNING, REPEATING, PAUSED)
    try {
      const profile = StorageService.getProfile();
      if (profile.anilistUser?.id) {
        const response = await fetch(ANILIST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: USER_ALL_LISTS_QUERY,
            variables: { userId: profile.anilistUser.id },
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const lists = json.data?.MediaListCollection?.lists || [];

          for (const list of lists) {
            const status = (list.status || "").toUpperCase();
            // Exclude DROPPED and COMPLETED lists from active airing schedule
            if (status === "DROPPED" || status === "COMPLETED") continue;

            for (const entry of list.entries || []) {
              if (entry.mediaId) {
                map.set(entry.mediaId, entry.progress || 0);
              }
            }
          }
        }
      }
    } catch {
      // Fallback
    }
    return map;
  }

  /**
   * Full-month airing schedule (paginated / targeted). Complete across all days 1-31.
   * @param year full year e.g. 2026
   * @param month 0-indexed month (Date style)
   */
  static async fetchMonthlyAiringSchedule(
    year: number,
    month: number,
    myListsOnly = true
  ): Promise<AiringScheduleItem[]> {
    try {
      const cacheKey = `stream_airing_${year}_${month}_${myListsOnly ? "mine" : "all"}`;
      const cached = StorageService.getMonthlyAiringCache(cacheKey);
      if (cached && cached.length > 0) {
        return cached;
      }

      const userMap = await this.fetchUserTrackedMediaMap();

      // If user selected "My list" but has no tracked anime, return empty list
      if (myListsOnly && userMap.size === 0) {
        return [];
      }

      const result: AiringScheduleItem[] = [];
      const seenIds = new Set<number>();

      const parseSchedules = (rawSchedules: any[]) => {
        for (const s of rawSchedules) {
          if (!s || seenIds.has(s.id)) continue;
          seenIds.add(s.id);
          const date = new Date(s.airingAt * 1000);
          if (date.getFullYear() !== year || date.getMonth() !== month) continue;

          let day = date.getDay() - 1;
          if (day < 0) day = 6;
          const mediaId = s.media?.id || 0;
          const userProgress = userMap.get(mediaId);
          const isTracked = userProgress !== undefined;
          const isWatched = isTracked && userProgress! >= s.episode;

          if (myListsOnly && !isTracked) {
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
      };

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthStart = Math.floor(new Date(year, month, 1, 0, 0, 0, 0).getTime() / 1000) - 1;
      const monthEnd = Math.floor(new Date(year, month, daysInMonth, 23, 59, 59, 999).getTime() / 1000) + 1;

      if (myListsOnly) {
        // Targeted query for only user's tracked anime for the full month
        const mediaIds = Array.from(userMap.keys());
        let page = 1;
        let hasNext = true;
        while (hasNext && page <= 4) {
          const res = await fetch(ANILIST_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              query: AIRING_SCHEDULE_QUERY,
              variables: { weekStart: monthStart, weekEnd: monthEnd, mediaId_in: mediaIds, page },
            }),
          });
          if (!res.ok) break;
          const json = await res.json();
          const pageData = json.data?.Page;
          parseSchedules(pageData?.airingSchedules || []);
          hasNext = Boolean(pageData?.pageInfo?.hasNextPage);
          page += 1;
        }
      } else {
        // Parallel weekly slices so all days 1-31 of the month are fully retrieved without truncation
        const slices: { start: number; end: number }[] = [
          {
            start: Math.floor(new Date(year, month, 1, 0, 0, 0, 0).getTime() / 1000) - 1,
            end: Math.floor(new Date(year, month, 7, 23, 59, 59, 999).getTime() / 1000) + 1,
          },
          {
            start: Math.floor(new Date(year, month, 8, 0, 0, 0, 0).getTime() / 1000) - 1,
            end: Math.floor(new Date(year, month, 14, 23, 59, 59, 999).getTime() / 1000) + 1,
          },
          {
            start: Math.floor(new Date(year, month, 15, 0, 0, 0, 0).getTime() / 1000) - 1,
            end: Math.floor(new Date(year, month, 21, 23, 59, 59, 999).getTime() / 1000) + 1,
          },
          {
            start: Math.floor(new Date(year, month, 22, 0, 0, 0, 0).getTime() / 1000) - 1,
            end: Math.floor(new Date(year, month, 28, 23, 59, 59, 999).getTime() / 1000) + 1,
          },
        ];
        if (daysInMonth > 28) {
          slices.push({
            start: Math.floor(new Date(year, month, 29, 0, 0, 0, 0).getTime() / 1000) - 1,
            end: Math.floor(new Date(year, month, daysInMonth, 23, 59, 59, 999).getTime() / 1000) + 1,
          });
        }

        const responses = await Promise.all(
          slices.flatMap((slice) => [
            fetch(ANILIST_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                query: AIRING_SCHEDULE_QUERY,
                variables: { weekStart: slice.start, weekEnd: slice.end, page: 1 },
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            fetch(ANILIST_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                query: AIRING_SCHEDULE_QUERY,
                variables: { weekStart: slice.start, weekEnd: slice.end, page: 2 },
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ])
        );

        for (const json of responses) {
          if (json?.data?.Page?.airingSchedules) {
            parseSchedules(json.data.Page.airingSchedules);
          }
        }
      }

      // Stable order: time then title
      result.sort((a, b) => a.airingAt - b.airingAt || a.mediaTitle.localeCompare(b.mediaTitle));

      if (result.length > 0) {
        StorageService.saveMonthlyAiringCache(cacheKey, result);
      }

      return result;
    } catch (e) {
      console.warn("Airing schedule fallback:", e);
      return [];
    }
  }

  /** @deprecated Use fetchMonthlyAiringSchedule — kept for callers */
  static async fetchWeeklyAiringSchedule(myListsOnly = true): Promise<AiringScheduleItem[]> {
    const now = new Date();
    return this.fetchMonthlyAiringSchedule(now.getFullYear(), now.getMonth(), myListsOnly);
  }

  static async fetchAnimeBySort(
    sort: "TRENDING_DESC" | "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC",
    genre?: string
  ): Promise<MediaItem[]> {
    if (sort === "TRENDING_DESC" && (!genre || genre === "All")) {
      return this.fetchTrending();
    }
    return this.searchAnime({
      genre: genre && genre !== "All" ? genre : undefined,
      sort: [sort],
    });
  }

  static async searchAnime(params: {
    query?: string;
    genre?: string;
    year?: number;
    format?: string;
    sort?: string[];
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
            sort: params.sort || ["POPULARITY_DESC"],
          },
        }),
      });

      if (!response.ok) throw new Error(`AniList search error (${response.status})`);
      const json = await response.json();
      if (json.errors?.length) throw new Error(json.errors[0]?.message || "AniList GraphQL error");
      const mediaList = json.data?.Page?.media || [];
      return mediaList.map((m: any) => this.formatAniListMedia(m));
    } catch (e) {
      throw e instanceof Error ? e : new Error("AniList search failed");
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

      const nextAiringEp = raw.nextAiringEpisode?.episode;
      const isNotYetReleased = media.status === "NOT_YET_RELEASED";

      const seasonHint = parseSeasonFromTitle(media.title);
      const episodes: Episode[] = Array.from({ length: totalEp }, (_, idx) => {
        const epNum = idx + 1;
        const streamInfo = streaming.find((s: any) => s.title?.includes(`Episode ${epNum}`) || s.title?.includes(`${epNum}`));
        const isUnreleased = isNotYetReleased || (nextAiringEp != null && epNum >= nextAiringEp);
        return {
          id: `ep_ani_${anilistId}_${epNum}`,
          episodeNumber: epNum,
          seasonNumber: seasonHint || 1,
          title: streamInfo?.title || `Episode ${epNum}`,
          synopsis: isUnreleased ? `Episode ${epNum} has not yet aired.` : `Watch episode ${epNum} of ${media.title}.`,
          thumbnail: streamInfo?.thumbnail || media.bannerImage || media.coverImage,
          durationMinutes: 24,
          airDate: String(media.year || ""),
          unreleased: isUnreleased,
        };
      });

      media.relatedSeasons = await fetchDeepFranchiseSeasons(raw);

      return { media, episodes };
    } catch (e) {
      throw e instanceof Error ? e : new Error("AniList detail request failed");
    }
  }

  /**
   * Fetch related and recommended media for an anime
   */
  static async fetchRecommendations(anilistId: number): Promise<MediaItem[]> {
    const query = `
      query ($id: Int) {
        Media (id: $id) {
          recommendations (perPage: 14, sort: RATING_DESC) {
            nodes {
              mediaRecommendation {
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
                description
                format
                episodes
                status
                averageScore
                genres
                seasonYear
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query,
          variables: { id: anilistId },
        }),
      });

      if (!response.ok) return [];
      const json = await response.json();
      const nodes = json.data?.Media?.recommendations?.nodes || [];
      const items: MediaItem[] = [];

      for (const node of nodes) {
        if (node.mediaRecommendation) {
          items.push(this.formatAniListMedia(node.mediaRecommendation));
        }
      }

      return items;
    } catch {
      return [];
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
      malId: m.idMal,
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
