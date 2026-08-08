import { MediaItem } from "../types";

/** Bump common CDN sizes so hero/backdrop art is sharp on large displays. */
export function upgradeImageUrl(url: string | undefined | null): string {
  if (!url) return "";
  let out = url;

  // TMDB: w185/w342/w500/w780 → original (backdrops) or w1280
  out = out.replace(
    /image\.tmdb\.org\/t\/p\/(w\d+|h\d+|original)/,
    (_m, size: string) => {
      if (size === "original") return "image.tmdb.org/t/p/original";
      // Prefer original for wide hero art
      return "image.tmdb.org/t/p/original";
    }
  );

  // AniList: /medium/ → /large/ where available
  out = out.replace(/\/media\/(anime|manga)\/(banner|cover)\/medium\//, "/media/$1/$2/large/");
  out = out.replace(/\/cover\/medium\//, "/cover/large/");

  return out;
}

/** Best wide image for hero / featured banners. */
export function getHeroImageUrl(item: MediaItem): string {
  const primary = item.bannerImage || item.coverImage || "";
  return upgradeImageUrl(primary);
}

/** Best wide 16:9 horizontal image for Continue Watching & landscape rails. */
export function getBackdropImageUrl(item: MediaItem | undefined | null): string {
  if (!item) return "";
  const primary = item.bannerImage || item.coverImage || "";
  return upgradeImageUrl(primary);
}

export function normalizeMediaTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
