import { Episode, MediaItem, MediaType } from "../types";
import { StorageService } from "./storage";
import { AiringScheduleItem } from "./anilist";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

const TMDB_GENRE_IDS: Record<string, { movie?: number; tv?: number }> = {
  action: { movie: 28, tv: 10759 },
  adventure: { movie: 12, tv: 10759 },
  animation: { movie: 16, tv: 16 },
  comedy: { movie: 35, tv: 35 },
  crime: { movie: 80, tv: 80 },
  documentary: { movie: 99, tv: 99 },
  drama: { movie: 18, tv: 18 },
  family: { movie: 10751, tv: 10751 },
  fantasy: { movie: 14, tv: 10765 },
  history: { movie: 36 },
  horror: { movie: 27 },
  mystery: { movie: 9648, tv: 9648 },
  romance: { movie: 10749 },
  "sci-fi": { movie: 878, tv: 10765 },
  "science fiction": { movie: 878, tv: 10765 },
  thriller: { movie: 53 },
  war: { movie: 10752 },
  western: { movie: 37, tv: 37 },
  supernatural: { tv: 10765 },
};

function tmdbGenreId(genre: string | undefined, type: MediaType): number | undefined {
  if (!genre) return undefined;
  const entry = TMDB_GENRE_IDS[genre.toLowerCase()];
  if (!entry) return undefined;
  return type === "movie" ? entry.movie : entry.tv ?? entry.movie;
}

// Official TMDB v3 Read Access Token (Bearer Token)
const TMDB_DEFAULT_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxYjcwZWNhYjczY2U1Y2JkMGJhYWY0ODBhZDQ2MzVkZCIsIm5iZiI6MTc1ODE0NzExMC4yODMsInN1YiI6IjY4Y2IzMjI2ZDMyZjM1NGFhOGUzNjUwMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ZI_hoiq5k1Uofi_YTRDrmUYMc9ZgwrHe_gZWTqR5HQ4";

export class TMDBService {
  private static getApiKey(): string {
    const userKey = StorageService.getSettings().tmdbApiKey;
    return userKey && userKey.trim() !== "" ? userKey.trim() : TMDB_DEFAULT_BEARER_TOKEN;
  }

  private static fetchTMDBv3(endpoint: string): Promise<Response> {
    const key = this.getApiKey();
    const isBearer = key.startsWith("eyJ");

    let url = `${TMDB_BASE_URL}/${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      accept: "application/json",
    };

    if (isBearer) {
      headers["Authorization"] = `Bearer ${key}`;
    } else {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}api_key=${key}`;
    }

    return fetch(url, { method: "GET", headers });
  }

  static async fetchTrendingMovies(): Promise<MediaItem[]> {
    const [res1, res2] = await Promise.all([
      this.fetchTMDBv3("trending/movie/week?page=1"),
      this.fetchTMDBv3("trending/movie/week?page=2"),
    ]);
    if (!res1.ok && !res2.ok) {
      throw new Error(`TMDB trending movies failed (${res1.status})`);
    }
    const json1 = res1.ok ? await res1.json() : { results: [] };
    const json2 = res2.ok ? await res2.json() : { results: [] };
    const combined = [...(json1.results || []), ...(json2.results || [])];
    return combined.map((m: any) => this.formatTMDBMovie(m));
  }

  static async fetchMoviesBySort(
    sort: "trending" | "popular" | "top_rated" | "upcoming",
    genre?: string
  ): Promise<MediaItem[]> {
    if (sort === "trending" && (!genre || genre === "All")) {
      return this.fetchTrendingMovies();
    }
    const genreId = genre && genre !== "All" ? tmdbGenreId(genre, "movie") : undefined;
    let endpoint = "";
    if (sort === "popular") {
      endpoint = genreId ? `discover/movie?sort_by=popularity.desc&with_genres=${genreId}&page=1` : "movie/popular?page=1";
    } else if (sort === "top_rated") {
      endpoint = genreId ? `discover/movie?sort_by=vote_average.desc&vote_count.gte=200&with_genres=${genreId}&page=1` : "movie/top_rated?page=1";
    } else if (sort === "upcoming") {
      endpoint = genreId ? `discover/movie?sort_by=primary_release_date.desc&with_genres=${genreId}&page=1` : "movie/upcoming?page=1";
    } else {
      endpoint = genreId ? `discover/movie?sort_by=popularity.desc&with_genres=${genreId}&page=1` : "trending/movie/week?page=1";
    }

    const res = await this.fetchTMDBv3(endpoint);
    if (!res.ok) throw new Error(`TMDB movies sort error (${res.status})`);
    const json = await res.json();
    return (json.results || []).map((m: any) => this.formatTMDBMovie(m));
  }

  static async fetchTrendingTV(): Promise<MediaItem[]> {
    const [res1, res2] = await Promise.all([
      this.fetchTMDBv3("trending/tv/week?page=1"),
      this.fetchTMDBv3("trending/tv/week?page=2"),
    ]);
    if (!res1.ok && !res2.ok) {
      throw new Error(`TMDB trending TV failed (${res1.status})`);
    }
    const json1 = res1.ok ? await res1.json() : { results: [] };
    const json2 = res2.ok ? await res2.json() : { results: [] };
    const combined = [...(json1.results || []), ...(json2.results || [])];
    return combined.map((t: any) => this.formatTMDBTV(t));
  }

  static async fetchTVBySort(
    sort: "trending" | "popular" | "top_rated" | "airing_today",
    genre?: string
  ): Promise<MediaItem[]> {
    if (sort === "trending" && (!genre || genre === "All")) {
      return this.fetchTrendingTV();
    }
    const genreId = genre && genre !== "All" ? tmdbGenreId(genre, "tv") : undefined;
    let endpoint = "";
    if (sort === "popular") {
      endpoint = genreId ? `discover/tv?sort_by=popularity.desc&with_genres=${genreId}&page=1` : "tv/popular?page=1";
    } else if (sort === "top_rated") {
      endpoint = genreId ? `discover/tv?sort_by=vote_average.desc&vote_count.gte=100&with_genres=${genreId}&page=1` : "tv/top_rated?page=1";
    } else if (sort === "airing_today") {
      endpoint = genreId ? `discover/tv?sort_by=first_air_date.desc&with_genres=${genreId}&page=1` : "tv/airing_today?page=1";
    } else {
      endpoint = genreId ? `discover/tv?sort_by=popularity.desc&with_genres=${genreId}&page=1` : "trending/tv/week?page=1";
    }

    const res = await this.fetchTMDBv3(endpoint);
    if (!res.ok) throw new Error(`TMDB TV sort error (${res.status})`);
    const json = await res.json();
    return (json.results || []).map((t: any) => this.formatTMDBTV(t));
  }

  static async searchTMDB(
    query: string,
    type: MediaType = "movie",
    opts?: { genre?: string; year?: number }
  ): Promise<MediaItem[]> {
    const q = (query || "").trim();
    const genreId = tmdbGenreId(opts?.genre, type);
    const year = opts?.year;
    const kind = type === "movie" ? "movie" : "tv";

    let endpoint: string;
    if (q) {
      const params = [`query=${encodeURIComponent(q)}`];
      if (year) {
        params.push(type === "movie" ? `year=${year}` : `first_air_date_year=${year}`);
      }
      endpoint = `search/${kind}?${params.join("&")}`;
    } else if (genreId || year) {
      const params: string[] = ["sort_by=popularity.desc"];
      if (genreId) params.push(`with_genres=${genreId}`);
      if (year) {
        params.push(type === "movie" ? `primary_release_year=${year}` : `first_air_date_year=${year}`);
      }
      endpoint = `discover/${kind}?${params.join("&")}`;
    } else {
      return [];
    }

    const res = await this.fetchTMDBv3(endpoint);
    if (!res.ok) throw new Error(`TMDB search error: ${res.statusText}`);
    const json = await res.json();
    let results = json.results || [];
    if (q && genreId) {
      results = results.filter((item: any) => Array.isArray(item.genre_ids) && item.genre_ids.includes(genreId));
    }
    return results.map((item: any) => (type === "movie" ? this.formatTMDBMovie(item) : this.formatTMDBTV(item)));
  }

  static async getMediaDetail(tmdbId: number, type: MediaType): Promise<{ media: MediaItem; episodes: Episode[] }> {
    try {
      const endpoint = type === "movie" ? `movie/${tmdbId}?append_to_response=credits,external_ids` : `tv/${tmdbId}?append_to_response=credits,external_ids`;
      const res = await this.fetchTMDBv3(endpoint);
      if (!res.ok) throw new Error(`TMDB detail error: ${res.statusText}`);
      const raw = await res.json();

      const media = type === "movie" ? this.formatTMDBMovie(raw) : this.formatTMDBTV(raw);

      let episodes: Episode[] = [];

      if (type === "tv") {
        const seasonNums: number[] = (raw.seasons || [])
          .map((s: any) => Number(s.season_number))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        const uniqueSeasons = (seasonNums.length ? seasonNums : [1]).filter(
          (n: number, i: number, arr: number[]) => arr.indexOf(n) === i
        );
        const seasonPayloads = await Promise.all(
          uniqueSeasons.map(async (seasonNum) => {
            try {
              const seasonRes = await this.fetchTMDBv3(`tv/${tmdbId}/season/${seasonNum}`);
              if (!seasonRes.ok) return [] as Episode[];
              const seasonJson = await seasonRes.json();
              const now = Date.now();
              return (seasonJson.episodes || []).map((ep: any) => {
                const airTime = ep.air_date ? new Date(ep.air_date).getTime() : 0;
                const isUnreleased = Boolean(
                  (airTime && airTime > now) ||
                  (!ep.air_date && media.status === "NOT_YET_RELEASED")
                );
                return {
                  id: `ep_tmdb_${tmdbId}_${seasonNum}_${ep.episode_number}`,
                  episodeNumber: ep.episode_number,
                  seasonNumber: seasonNum,
                  title: ep.name || `Episode ${ep.episode_number}`,
                  synopsis: ep.overview || (isUnreleased ? `Episode ${ep.episode_number} has not yet aired.` : "Episode details."),
                  thumbnail: ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : media.bannerImage,
                  durationMinutes: ep.runtime || 45,
                  airDate: ep.air_date,
                  unreleased: isUnreleased,
                };
              }) as Episode[];
            } catch {
              return [] as Episode[];
            }
          })
        );
        episodes = seasonPayloads.flat();

        if (Array.isArray(raw.seasons) && raw.seasons.length > 1) {
          media.relatedSeasons = raw.seasons
            .filter((s: any) => Number(s.season_number) > 0)
            .map((s: any) => ({
              id: `tmdb_tv_${tmdbId}_s${s.season_number}`,
              seasonNumber: s.season_number,
              seasonLabel: `S${s.season_number}`,
              title: s.name || `Season ${s.season_number}`,
              year: s.air_date ? new Date(s.air_date).getFullYear() : media.year,
              episodesCount: s.episode_count,
              coverImage: s.poster_path ? `${TMDB_IMAGE_BASE}${s.poster_path}` : media.coverImage,
              bannerImage: media.bannerImage,
              format: "TV",
              mediaType: "tv" as MediaType,
              tmdbId,
            }));
        }
      } else {
        episodes = [
          {
            id: `ep_movie_${tmdbId}`,
            episodeNumber: 1,
            seasonNumber: 1,
            title: media.title,
            synopsis: media.synopsis,
            thumbnail: media.bannerImage || media.coverImage,
            durationMinutes: raw.runtime || 130,
          },
        ];
      }

      return { media, episodes };
    } catch (e) {
      throw e instanceof Error ? e : new Error("TMDB detail request failed");
    }
  }

  /**
   * Fetch recommendations for a movie or TV show
   */
  static async fetchRecommendations(tmdbId: number, mediaType: "movie" | "tv"): Promise<MediaItem[]> {
    try {
      const endpoint = mediaType === "movie" ? `movie/${tmdbId}/recommendations` : `tv/${tmdbId}/recommendations`;
      const res = await this.fetchTMDBv3(endpoint);
      if (!res.ok) return [];
      const json = await res.json();
      const results = json.results || [];
      return results.slice(0, 14).map((item: any) =>
        mediaType === "movie" ? this.formatTMDBMovie(item) : this.formatTMDBTV(item)
      );
    } catch {
      return [];
    }
  }

  private static formatTMDBMovie(m: any): MediaItem {
    const year = m.release_date ? parseInt(m.release_date.split("-")[0], 10) : 2024;
    const cast = m.credits?.cast?.slice(0, 6).map((c: any) => ({
      name: c.name,
      role: c.character,
      avatar: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : undefined,
    })) || [];

    return {
      id: `tmdb_m_${m.id}`,
      tmdbId: m.id,
      imdbId: m.imdb_id || m.external_ids?.imdb_id,
      title: m.title || m.original_title || "Unknown Movie",
      mediaType: "movie",
      format: "MOVIE",
      status: "FINISHED",
      coverImage: m.poster_path ? `${TMDB_IMAGE_BASE}${m.poster_path}` : "",
      bannerImage: m.backdrop_path ? `${TMDB_BACKDROP_BASE}${m.backdrop_path}` : m.poster_path ? `${TMDB_IMAGE_BASE}${m.poster_path}` : "",
      synopsis: m.overview || "No overview available.",
      genres: m.genres ? m.genres.map((g: any) => g.name) : ["Cinema", "Action"],
      year,
      score: m.vote_average ? Math.round(m.vote_average * 10) / 10 : 8.0,
      episodesCount: 1,
      seasonsCount: 1,
      cast,
    };
  }

  private static formatTMDBTV(t: any): MediaItem {
    const year = t.first_air_date ? parseInt(t.first_air_date.split("-")[0], 10) : 2024;
    const cast = t.credits?.cast?.slice(0, 6).map((c: any) => ({
      name: c.name,
      role: c.character,
      avatar: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : undefined,
    })) || [];

    return {
      id: `tmdb_tv_${t.id}`,
      tmdbId: t.id,
      imdbId: t.external_ids?.imdb_id || t.imdb_id,
      title: t.name || t.original_name || "Unknown Series",
      mediaType: "tv",
      format: "SERIES",
      status: "RELEASING",
      coverImage: t.poster_path ? `${TMDB_IMAGE_BASE}${t.poster_path}` : "",
      bannerImage: t.backdrop_path ? `${TMDB_BACKDROP_BASE}${t.backdrop_path}` : t.poster_path ? `${TMDB_IMAGE_BASE}${t.poster_path}` : "",
      synopsis: t.overview || "No overview available.",
      genres: t.genres ? t.genres.map((g: any) => g.name) : ["Drama", "Sci-Fi"],
      year,
      score: t.vote_average ? Math.round(t.vote_average * 10) / 10 : 8.3,
      episodesCount: t.number_of_episodes || 10,
      seasonsCount: t.number_of_seasons || 1,
      cast,
    };
  }

  private static tvScheduleCache = new Map<string, { at: number; items: AiringScheduleItem[] }>();
  private static movieScheduleCache = new Map<string, { at: number; items: AiringScheduleItem[] }>();

  static async fetchMonthlyTVSchedule(year: number, month: number): Promise<AiringScheduleItem[]> {
    const cacheKey = `tmdb_tv_schedule_${year}_${month}`;
    const cached = this.tvScheduleCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
      return cached.items;
    }

    try {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startDate = `${year}-${pad2(month + 1)}-01`;
      const endDate = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;

      const [resPremiere, resOnAir] = await Promise.all([
        this.fetchTMDBv3(
          `discover/tv?first_air_date.gte=${startDate}&first_air_date.lte=${endDate}&sort_by=popularity.desc&page=1`
        ).catch(() => null),
        this.fetchTMDBv3(`tv/on_the_air?page=1`).catch(() => null),
      ]);

      const items: AiringScheduleItem[] = [];
      const seen = new Set<string>();

      if (resPremiere && resPremiere.ok) {
        const data = await resPremiere.json();
        const results = data.results || [];
        for (const t of results) {
          if (!t.first_air_date) continue;
          const d = new Date(t.first_air_date);
          if (isNaN(d.getTime())) continue;
          if (d.getFullYear() === year && d.getMonth() === month) {
            const dateKey = localDateKey(d);
            const key = `tv_${t.id}_${dateKey}`;
            if (!seen.has(key)) {
              seen.add(key);
              items.push({
                id: t.id * 1000 + d.getDate(),
                airingAt: Math.floor(d.getTime() / 1000),
                episode: 1,
                mediaId: t.id,
                tmdbId: t.id,
                mediaTitle: t.name || t.original_name || "TV Series",
                mediaType: "tv",
                coverImage: t.poster_path ? `${TMDB_IMAGE_BASE}${t.poster_path}` : "",
                bannerImage: t.backdrop_path ? `${TMDB_BACKDROP_BASE}${t.backdrop_path}` : undefined,
                dayOfMonth: d.getDate(),
                dayOfWeek: (d.getDay() + 6) % 7,
                dateKey,
              });
            }
          }
        }
      }

      if (resOnAir && resOnAir.ok) {
        const data = await resOnAir.json();
        const results = data.results || [];
        for (const t of results) {
          if (!t.first_air_date) continue;
          const premiereDate = new Date(t.first_air_date);
          const targetDayOfWeek = premiereDate.getDay();
          for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            if (d.getDay() === targetDayOfWeek) {
              const dateKey = localDateKey(d);
              const key = `tv_${t.id}_${dateKey}`;
              if (!seen.has(key)) {
                seen.add(key);
                items.push({
                  id: t.id * 1000 + day,
                  airingAt: Math.floor(d.getTime() / 1000),
                  episode: Math.max(1, Math.ceil(day / 7)),
                  mediaId: t.id,
                  tmdbId: t.id,
                  mediaTitle: t.name || t.original_name || "TV Series",
                  mediaType: "tv",
                  coverImage: t.poster_path ? `${TMDB_IMAGE_BASE}${t.poster_path}` : "",
                  bannerImage: t.backdrop_path ? `${TMDB_BACKDROP_BASE}${t.backdrop_path}` : undefined,
                  dayOfMonth: day,
                  dayOfWeek: (d.getDay() + 6) % 7,
                  dateKey,
                });
              }
            }
          }
        }
      }

      this.tvScheduleCache.set(cacheKey, { at: Date.now(), items });
      return items;
    } catch {
      return [];
    }
  }

  static async fetchMonthlyMovieSchedule(year: number, month: number): Promise<AiringScheduleItem[]> {
    const cacheKey = `tmdb_movie_schedule_${year}_${month}`;
    const cached = this.movieScheduleCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) {
      return cached.items;
    }

    try {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startDate = `${year}-${pad2(month + 1)}-01`;
      const endDate = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`;

      const [resPage1, resPage2] = await Promise.all([
        this.fetchTMDBv3(
          `discover/movie?primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&sort_by=popularity.desc&page=1`
        ).catch(() => null),
        this.fetchTMDBv3(
          `discover/movie?primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&sort_by=popularity.desc&page=2`
        ).catch(() => null),
      ]);

      const items: AiringScheduleItem[] = [];
      const seen = new Set<number>();

      const processResults = async (res: Response | null) => {
        if (!res || !res.ok) return;
        const data = await res.json();
        const results = data.results || [];
        for (const m of results) {
          if (!m.release_date || seen.has(m.id)) continue;
          seen.add(m.id);
          const d = new Date(m.release_date);
          if (isNaN(d.getTime())) continue;
          if (d.getFullYear() === year && d.getMonth() === month) {
            const dateKey = localDateKey(d);
            items.push({
              id: m.id,
              airingAt: Math.floor(d.getTime() / 1000),
              episode: 1,
              mediaId: m.id,
              tmdbId: m.id,
              mediaTitle: m.title || m.original_title || "Cinema Movie",
              mediaType: "movie",
              coverImage: m.poster_path ? `${TMDB_IMAGE_BASE}${m.poster_path}` : "",
              bannerImage: m.backdrop_path ? `${TMDB_BACKDROP_BASE}${m.backdrop_path}` : undefined,
              dayOfMonth: d.getDate(),
              dayOfWeek: (d.getDay() + 6) % 7,
              dateKey,
            });
          }
        }
      };

      await processResults(resPage1);
      await processResults(resPage2);

      this.movieScheduleCache.set(cacheKey, { at: Date.now(), items });
      return items;
    } catch {
      return [];
    }
  }
}

export const MOCK_MOVIES: MediaItem[] = [
  {
    id: "tmdb_m_693134",
    tmdbId: 693134,
    title: "Dune: Part Two",
    mediaType: "movie",
    format: "MOVIE",
    status: "FINISHED",
    coverImage: "https://image.tmdb.org/t/p/w500/1pdfLPoWuYzGQLGH5Vb0eaL5vL1.jpg",
    bannerImage: "https://image.tmdb.org/t/p/original/xOM08Go8DFBFiBGxPyLXYnYiRBh.jpg",
    synopsis: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
    genres: ["Science Fiction", "Adventure"],
    year: 2024,
    score: 8.3,
    episodesCount: 1,
  },
  {
    id: "tmdb_m_27205",
    tmdbId: 27205,
    title: "Inception",
    mediaType: "movie",
    format: "MOVIE",
    status: "FINISHED",
    coverImage: "https://image.tmdb.org/t/p/w500/oYuLEIVWz2OiuhyQY2edST9B2o5.jpg",
    bannerImage: "https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAiol.jpg",
    synopsis: "Cobb, a skilled thief who steals valuable secrets from deep within the subconscious during the dream state, is offered a chance to have his criminal history erased.",
    genres: ["Action", "Science Fiction", "Adventure"],
    year: 2010,
    score: 8.4,
    episodesCount: 1,
  },
];

export const MOCK_TV_SHOWS: MediaItem[] = [
  {
    id: "tmdb_tv_1396",
    tmdbId: 1396,
    title: "Breaking Bad",
    mediaType: "tv",
    format: "SERIES",
    status: "FINISHED",
    coverImage: "https://image.tmdb.org/t/p/w500/ztslEkr2TTo2hEW0m6eW0uA8xCh.jpg",
    bannerImage: "https://image.tmdb.org/t/p/original/tsRy63MuZvMuZ8stFhBKGKG48gB.jpg",
    synopsis: "Walter White, a chemistry teacher, discovers that he has cancer and decides to get into the meth-making business to repay his medical debts.",
    genres: ["Drama", "Crime", "Thriller"],
    year: 2008,
    score: 8.9,
    episodesCount: 62,
    seasonsCount: 5,
  },
];
