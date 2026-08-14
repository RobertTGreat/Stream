export interface SkipInterval {
  startTime: number;
  endTime: number;
  skipType: "op" | "ed" | "mixed-op" | "mixed-ed" | "recap";
  label: string;
}

export interface AniSkipResult {
  found: boolean;
  intervals: SkipInterval[];
}

const cache = new Map<string, SkipInterval[]>();

export class AniSkipService {
  /**
   * Fetch skip times (OP/ED/Recap) for an anime episode using MyAnimeList ID
   */
  static async getSkipTimes(malId: number, episodeNumber: number, episodeLength: number = 0): Promise<SkipInterval[]> {
    if (!malId || !episodeNumber) return [];

    const cacheKey = `${malId}_${episodeNumber}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    try {
      const types = ["op", "ed", "mixed-op", "mixed-ed", "recap"];
      const typesQuery = types.map((t) => `types=${t}`).join("&");
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?${typesQuery}&episodeLength=${Math.round(episodeLength)}`;

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        cache.set(cacheKey, []);
        return [];
      }

      const json = await res.json();
      if (!json.found || !Array.isArray(json.results)) {
        cache.set(cacheKey, []);
        return [];
      }

      const intervals: SkipInterval[] = json.results.map((r: any) => {
        let label = "Skip Intro";
        if (r.skipType === "ed" || r.skipType === "mixed-ed") {
          label = "Skip Outro";
        } else if (r.skipType === "recap") {
          label = "Skip Recap";
        }

        return {
          startTime: r.interval?.startTime || 0,
          endTime: r.interval?.endTime || 0,
          skipType: r.skipType,
          label,
        };
      });

      cache.set(cacheKey, intervals);
      return intervals;
    } catch {
      return [];
    }
  }

  /**
   * Find if current playback time is inside a skip interval
   */
  static getActiveInterval(intervals: SkipInterval[], currentTime: number): SkipInterval | null {
    if (!intervals || intervals.length === 0) return null;
    return intervals.find((i) => currentTime >= i.startTime && currentTime <= i.endTime) || null;
  }
}
