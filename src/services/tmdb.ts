import { Episode, MediaItem, MediaType } from "../types";
import { StorageService } from "./storage";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

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
    try {
      const [res1, res2] = await Promise.all([
        this.fetchTMDBv3("trending/movie/week?page=1"),
        this.fetchTMDBv3("trending/movie/week?page=2"),
      ]);
      const json1 = res1.ok ? await res1.json() : { results: [] };
      const json2 = res2.ok ? await res2.json() : { results: [] };
      const combined = [...(json1.results || []), ...(json2.results || [])];
      return combined.map((m: any) => this.formatTMDBMovie(m));
    } catch (e) {
      console.warn("TMDB Trending Movies fallback used:", e);
      return MOCK_MOVIES;
    }
  }

  static async fetchTrendingTV(): Promise<MediaItem[]> {
    try {
      const [res1, res2] = await Promise.all([
        this.fetchTMDBv3("trending/tv/week?page=1"),
        this.fetchTMDBv3("trending/tv/week?page=2"),
      ]);
      const json1 = res1.ok ? await res1.json() : { results: [] };
      const json2 = res2.ok ? await res2.json() : { results: [] };
      const combined = [...(json1.results || []), ...(json2.results || [])];
      return combined.map((t: any) => this.formatTMDBTV(t));
    } catch (e) {
      console.warn("TMDB Trending TV fallback used:", e);
      return MOCK_TV_SHOWS;
    }
  }

  static async searchTMDB(query: string, type: MediaType = "movie"): Promise<MediaItem[]> {
    if (!query || query.trim() === "") return [];
    try {
      const endpoint = type === "movie" ? "search/movie" : "search/tv";
      const res = await this.fetchTMDBv3(`${endpoint}?query=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error(`TMDB search error: ${res.statusText}`);
      const json = await res.json();
      const results = json.results || [];
      return results.map((item: any) => (type === "movie" ? this.formatTMDBMovie(item) : this.formatTMDBTV(item)));
    } catch (e) {
      console.warn("TMDB Search fallback used:", e);
      const list = type === "movie" ? MOCK_MOVIES : MOCK_TV_SHOWS;
      return list.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
    }
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
        try {
          const seasonRes = await this.fetchTMDBv3(`tv/${tmdbId}/season/1`);
          if (seasonRes.ok) {
            const seasonJson = await seasonRes.json();
            episodes = (seasonJson.episodes || []).map((ep: any) => ({
              id: `ep_tmdb_${tmdbId}_1_${ep.episode_number}`,
              episodeNumber: ep.episode_number,
              seasonNumber: 1,
              title: ep.name || `Episode ${ep.episode_number}`,
              synopsis: ep.overview || "Episode details.",
              thumbnail: ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : media.bannerImage,
              durationMinutes: ep.runtime || 45,
              airDate: ep.air_date,
            }));
          }
        } catch {
          // Season 1 fallback
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
      console.warn("TMDB Detail fallback:", e);
      const list = type === "movie" ? MOCK_MOVIES : MOCK_TV_SHOWS;
      const media = list.find((m) => m.tmdbId === tmdbId) || list[0];
      const episodes: Episode[] = Array.from({ length: type === "movie" ? 1 : 10 }, (_, i) => ({
        id: `ep_tmdb_mock_${i + 1}`,
        episodeNumber: i + 1,
        seasonNumber: 1,
        title: type === "movie" ? media.title : `Episode ${i + 1}`,
        synopsis: media.synopsis,
        thumbnail: media.bannerImage || media.coverImage,
        durationMinutes: 45,
      }));
      return { media, episodes };
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
