import { PreferredQuality, TorrentResult } from "../types";

const QUALITY_ORDER: Record<string, number> = {
  "2160p": 4,
  "4k": 4,
  uhd: 4,
  "1080p": 3,
  fhd: 3,
  "720p": 2,
  hd: 2,
  "480p": 1,
  sd: 1,
};

function parseQualityTier(raw: string): number {
  const s = (raw || "").toLowerCase();
  if (s.includes("2160") || s.includes("4k") || s.includes("uhd")) return 4;
  if (s.includes("1080") || s.includes("fhd")) return 3;
  if (s.includes("720")) return 2;
  if (s.includes("480") || s.includes("360")) return 1;
  // Fall back to title-ish tokens if quality field is empty
  return 0;
}

function preferredTier(pref: PreferredQuality): number {
  if (pref === "any") return 0;
  return QUALITY_ORDER[pref] ?? 0;
}

/**
 * Score a torrent for Easy Watch auto-select.
 * Higher is better. Factors: SeaDex/best flag, seeders, quality match, size sanity.
 */
export function scoreTorrent(
  t: TorrentResult,
  preferredQuality: PreferredQuality,
  minSeeders: number
): number {
  if (minSeeders > 0 && t.seeders < minSeeders) return -1;

  let score = 0;

  // SeaDex / marked best releases jump the queue
  if (t.is_best_release) score += 10_000;
  if ((t.source_name || "").toLowerCase().includes("seadex")) score += 2_000;

  // Seeders (log-ish to avoid huge packs dominating purely by seed count)
  score += Math.min(t.seeders, 500) * 12;
  score += Math.min(t.leechers, 100) * 0.5;

  const tier = parseQualityTier(t.quality) || parseQualityTier(t.title);
  const target = preferredTier(preferredQuality);

  if (preferredQuality === "any") {
    // Prefer 1080p as sweet spot when user has no preference
    if (tier === 3) score += 400;
    else if (tier === 2) score += 250;
    else if (tier === 4) score += 150; // 4K often slower to buffer
    else if (tier === 1) score += 50;
  } else if (target > 0) {
    if (tier === target) score += 800;
    else if (tier === target - 1) score += 350;
    else if (tier === target + 1) score += 200;
    else if (tier > 0) score += 50;
  }

  // Mild size preference: tiny packs often incomplete; huge 4K remuxes slow to stream
  const gb = t.size_bytes / 1_073_741_824;
  if (gb > 0) {
    if (gb >= 0.3 && gb <= 4) score += 80;
    else if (gb > 4 && gb <= 12) score += 30;
    else if (gb > 25) score -= 120;
    else if (gb < 0.05) score -= 200;
  }

  return score;
}

/** Pick the best torrent for Easy Watch, or null if none pass filters. */
export function selectBestTorrent(
  torrents: TorrentResult[],
  preferredQuality: PreferredQuality = "1080p",
  minSeeders = 1
): TorrentResult | null {
  if (!torrents.length) return null;

  let best: TorrentResult | null = null;
  let bestScore = -Infinity;

  for (const t of torrents) {
    if (!t.magnet_url) continue;
    const s = scoreTorrent(t, preferredQuality, minSeeders);
    if (s < 0) continue;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }

  // Soft fallback: if minSeeders filtered everything, retry with 0
  if (!best && minSeeders > 0) {
    return selectBestTorrent(torrents, preferredQuality, 0);
  }

  return best;
}
