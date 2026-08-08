import { useState, useEffect, useRef, useMemo, useCallback, type RefObject } from "react";
import { motion } from "motion/react";
import { Play, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { MediaItem, StreamProgress, Episode } from "../types";
import { HeroBanner } from "../components/HeroBanner";
import { MediaCard } from "../components/MediaCard";
import { AniListService, UserListProgressEntry, AiringScheduleItem } from "../services/anilist";
import { StorageService } from "../services/storage";
import { normalizeMediaTitle, getBackdropImageUrl } from "../utils/mediaImages";
import { getRailScrollState, scrollRailByPage } from "../utils/scrollRail";
import { MediaImage } from "../components/MediaImage";

type ContinueCard =
  | { kind: "local"; key: string; item: StreamProgress }
  | { kind: "anilist"; key: string; entry: UserListProgressEntry };

interface HomeViewProps {
  spotlightMedia: MediaItem | null;
  trendingAnime: MediaItem[];
  trendingMovies: MediaItem[];
  trendingTv: MediaItem[];
  continueWatching: StreamProgress[];
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  onResumeStream: (progress: StreamProgress) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  watchlist: string[];
  onToggleWatchlist: (id: string) => void;
  onNavigateTab: (tab: "anime" | "movies" | "tv" | "library") => void;
  onContextMenu?: (
    e: React.MouseEvent,
    media: MediaItem,
    ep?: Episode,
    opts?: { fromContinue?: boolean; progress?: StreamProgress }
  ) => void;
  continueDismissed?: string[];
}

interface CalendarCell {
  cellIndex: number;
  dayNumber: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: AiringScheduleItem[];
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMonthCells(
  year: number,
  month: number,
  scheduleByDate: Map<string, AiringScheduleItem[]>
): CalendarCell[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startPad = first.getDay() - 1;
  if (startPad < 0) startPad = 6;

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];

  for (let idx = 0; idx < totalCells; idx++) {
    const dayOffset = idx - startPad;
    const date = new Date(year, month, dayOffset + 1);
    const isCurrentMonth = dayOffset >= 0 && dayOffset < daysInMonth;
    const dayNumber = date.getDate();
    const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

    cells.push({
      cellIndex: idx,
      dayNumber,
      dateKey,
      isCurrentMonth,
      isToday: dateKey === todayKey,
      items: scheduleByDate.get(dateKey) || [],
    });
  }

  return cells;
}

function CalendarDayCell({
  cell,
  index = 0,
  onOpenShow,
}: {
  cell: CalendarCell;
  index?: number;
  onOpenShow: (item: AiringScheduleItem) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState(0);
  const activeIdx = cell.items.length ? Math.min(hoverIdx, cell.items.length - 1) : 0;
  const bgItem = cell.items[activeIdx];
  const bgImage = bgItem?.bannerImage || bgItem?.coverImage;

  return (
    <div
      className={`hm-cal-cell ${
        cell.isToday ? "is-today" : cell.isCurrentMonth ? "is-month" : "is-other"
      } ${cell.items.length > 0 ? "has-items" : ""}`}
      style={{ ["--i" as string]: index }}
      onMouseLeave={() => setHoverIdx(0)}
    >
      {bgImage && cell.isCurrentMonth && (
        <div className="hm-cal-bg" key={bgImage}>
          <img src={bgImage} alt="" loading="lazy" />
        </div>
      )}

      <div className="hm-cal-day">
        <span className={cell.isToday ? "hm-cal-today-num" : ""}>{cell.dayNumber}</span>
        {cell.items.length > 2 && <span className="hm-cal-count">{cell.items.length}</span>}
      </div>

      <div className="hm-cal-list">
        {cell.items.map((item, idx) => (
          <button
            type="button"
            key={`sch_${item.id}_${item.mediaId}_${idx}`}
            className={`hm-cal-item ${idx === activeIdx ? "is-active" : ""}`}
            onMouseEnter={() => setHoverIdx(idx)}
            onFocus={() => setHoverIdx(idx)}
            onClick={(e) => {
              e.stopPropagation();
              onOpenShow(item);
            }}
            title={`${item.mediaTitle} — Ep. ${item.episode}`}
          >
            <span className="hm-cal-title">
              {item.isWatched && <Check size={9} className="hm-cal-check" />}
              <span className={item.isWatched ? "is-watched" : ""}>{item.mediaTitle}</span>
            </span>
            <span className="hm-cal-ep">{item.episode}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHead({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="hm-section-head">
      <h2 className="hm-section-label">{label}</h2>
      {actionLabel && onAction && (
        <button type="button" className="hm-section-link" onClick={onAction}>
          {actionLabel}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

interface CatalogRailProps {
  items: MediaItem[];
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
}

function CatalogRail({
  items,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onContextMenu,
}: CatalogRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: true });

  const updateScroll = useCallback(() => {
    if (!railRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = railRef.current;
    setScrollState({
      canLeft: scrollLeft > 5,
      canRight: scrollLeft + clientWidth < scrollWidth - 5,
    });
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener("scroll", updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScroll);
      ro.disconnect();
    };
  }, [updateScroll]);

  return (
    <div
      className={`hm-rail-wrap ${scrollState.canLeft ? "has-left-fade" : ""} ${
        scrollState.canRight ? "has-right-fade" : ""
      }`}
    >
      <button
        type="button"
        className="hm-rail-nav is-left"
        onClick={() => scrollRailByPage(railRef.current, -1)}
        aria-label="Scroll left"
        disabled={!scrollState.canLeft}
      >
        <ChevronLeft size={16} />
      </button>

      <button
        type="button"
        className="hm-rail-nav is-right"
        onClick={() => scrollRailByPage(railRef.current, 1)}
        aria-label="Scroll right"
        disabled={!scrollState.canRight}
      >
        <ChevronRight size={16} />
      </button>

      <div ref={railRef} className="hm-rail hm-poster-rail">
        {items.map((item, i) => (
          <div key={item.id} className="hm-poster-slot">
            <MediaCard
              item={item}
              index={i}
              onSelect={onSelectMedia}
              onPlay={onPlayMedia}
              isFavorite={favorites.includes(item.id)}
              onToggleFavorite={onToggleFavorite}
              onContextMenu={onContextMenu ? (e, m) => onContextMenu(e, m) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeView({
  trendingAnime,
  trendingMovies,
  trendingTv,
  continueWatching,
  onSelectMedia,
  onPlayMedia,
  onResumeStream,
  favorites,
  onToggleFavorite,
  watchlist,
  onToggleWatchlist,
  onNavigateTab,
  onContextMenu,
  continueDismissed = [],
}: HomeViewProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [aniListUserWatching, setAniListUserWatching] = useState<UserListProgressEntry[]>([]);
  const [airingSchedule, setAiringSchedule] = useState<AiringScheduleItem[]>([]);
  const [myListsOnly, setMyListsOnly] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const cwScrollRef = useRef<HTMLDivElement>(null);
  const animeRailRef = useRef<HTMLDivElement>(null);
  const movieRailRef = useRef<HTMLDivElement>(null);
  const tvRailRef = useRef<HTMLDivElement>(null);

  const spotlightItems = useMemo(
    () => (trendingAnime.length > 0 ? trendingAnime.slice(0, 5) : trendingMovies.slice(0, 5)),
    [trendingAnime, trendingMovies]
  );

  useEffect(() => {
    let cancelled = false;
    AniListService.fetchUserCurrentWatching().then((entries) => {
      if (!cancelled) {
        setAniListUserWatching(entries);
        for (const e of entries) StorageService.cacheMedia(e.media);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    AniListService.fetchMonthlyAiringSchedule(viewYear, viewMonth, myListsOnly)
      .then((schedule) => {
        if (!cancelled) setAiringSchedule(schedule);
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, myListsOnly]);

  const scheduleByDate = useMemo(() => {
    const map = new Map<string, AiringScheduleItem[]>();
    for (const item of airingSchedule) {
      const key = item.dateKey || `${viewYear}-${viewMonth + 1}-${item.dayOfMonth}`;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [airingSchedule, viewYear, viewMonth]);

  const calendarCells = useMemo(
    () => buildMonthCells(viewYear, viewMonth, scheduleByDate),
    [viewYear, viewMonth, scheduleByDate]
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const openScheduleShow = useCallback(
    (item: AiringScheduleItem) => {
      const media: MediaItem = {
        id: `ani_${item.mediaId}`,
        anilistId: item.mediaId,
        title: item.mediaTitle,
        mediaType: "anime",
        coverImage: item.coverImage,
        bannerImage: item.bannerImage,
        synopsis: "",
        genres: [],
      };
      StorageService.cacheMedia(media);
      onSelectMedia(media);
    },
    [onSelectMedia]
  );

  /** One card per show — ordered by Recently Watched & New Episode Out */
  const continueCards = useMemo(() => {
    const seenIds = new Set<string>();
    const seenAnilist = new Set<number>();
    const seenTitles = new Set<string>();
    const dismissed = new Set(continueDismissed);

    const claim = (mediaId: string, anilistId: number | undefined, title: string) => {
      if (dismissed.has(mediaId)) return false;
      const titleKey = normalizeMediaTitle(title);
      if (seenIds.has(mediaId)) return false;
      if (anilistId && seenAnilist.has(anilistId)) return false;
      if (titleKey && seenTitles.has(titleKey)) return false;
      seenIds.add(mediaId);
      if (anilistId) seenAnilist.add(anilistId);
      if (titleKey) seenTitles.add(titleKey);
      return true;
    };

    // Map latest aired episodes from schedule to identify new episodes
    const latestAiringMap = new Map<number, AiringScheduleItem>();
    const nowSec = Math.floor(Date.now() / 1000);
    for (const item of airingSchedule) {
      if (item.airingAt <= nowSec) {
        const prev = latestAiringMap.get(item.mediaId);
        if (!prev || item.airingAt > prev.airingAt) {
          latestAiringMap.set(item.mediaId, item);
        }
      }
    }

    // Local progress first (most recent update per series)
    const localByMedia = new Map<string, StreamProgress>();
    for (const item of continueWatching) {
      const existing = localByMedia.get(item.mediaId);
      if (!existing || item.lastUpdated > existing.lastUpdated) {
        localByMedia.set(item.mediaId, item);
      }
    }

    const itemsWithRank: { card: ContinueCard; sortTime: number }[] = [];

    const locals = Array.from(localByMedia.values());
    for (const item of locals) {
      const mediaCache = StorageService.getMediaCache();
      const cached = mediaCache[item.mediaId];
      const isMovie = item.mediaType === "movie" || cached?.mediaType === "movie" || cached?.episodesCount === 1;

      const done = item.completed || item.percentage >= 90;
      const totalEps = cached?.episodesCount || (isMovie ? 1 : 0);
      const nextEp = item.episodeNumber + 1;
      const nextAiring = cached?.nextAiringEpisode;
      const sch = item.anilistId ? latestAiringMap.get(item.anilistId) : undefined;
      const nowSec = Math.floor(Date.now() / 1000);

      let isNextReleased = true;
      if (isMovie) {
        isNextReleased = false;
      } else if (totalEps > 0 && nextEp > totalEps) {
        isNextReleased = false;
      } else if (nextAiring && nextAiring.episode === nextEp && nextAiring.airingAt > nowSec) {
        isNextReleased = false;
      } else if (sch && sch.episode < nextEp) {
        isNextReleased = false;
      }

      // If completed and no next episode available/released, EXCLUDE from Continue
      if (done && !isNextReleased) {
        continue;
      }

      if (!claim(item.mediaId, item.anilistId, item.mediaTitle)) continue;

      const hasNewEp = (done && isNextReleased) || (!!sch && sch.episode > item.episodeNumber);

      const sortTime = (item.lastUpdated || 0) + (hasNewEp ? 1e11 : 0);
      itemsWithRank.push({
        card: { kind: "local", key: `local_${item.mediaId}`, item },
        sortTime,
      });
    }

    // AniList watching — sort by recent activity / new episode out
    for (const entry of aniListUserWatching) {
      const rawId = entry.media.anilistId || (entry.media.id.startsWith("ani_") ? parseInt(entry.media.id.replace("ani_", ""), 10) : undefined);
      const sch = rawId ? latestAiringMap.get(rawId) : undefined;
      const totalEps = entry.episodesCount || entry.media.episodesCount || 0;
      const nextEp = entry.progress + 1;
      const nextAiring = entry.media.nextAiringEpisode;
      const isMovie = entry.media.mediaType === "movie" || totalEps === 1;
      const nowSec = Math.floor(Date.now() / 1000);

      let isNextReleased = true;
      if (isMovie) {
        isNextReleased = false;
      } else if (totalEps > 0 && nextEp > totalEps) {
        isNextReleased = false;
      } else if (nextAiring && nextAiring.episode === nextEp && nextAiring.airingAt > nowSec) {
        isNextReleased = false;
      } else if (sch && sch.episode < nextEp) {
        isNextReleased = false;
      }

      // If caught up and next episode is not out yet, EXCLUDE from Continue
      if (!isNextReleased) {
        continue;
      }

      if (!claim(entry.media.id, entry.media.anilistId, entry.media.title)) continue;

      const hasNewEp = !!sch && sch.episode > entry.progress;

      let baseTime = Date.now() - 1000 * 60 * 60 * 24 * 60;
      if (sch) {
        baseTime = sch.airingAt * 1000;
      }

      const sortTime = baseTime + (hasNewEp ? 1e11 : 0);
      itemsWithRank.push({
        card: { kind: "anilist", key: `ani_${entry.media.id}`, entry },
        sortTime,
      });
    }

    // Order by Recently Watched & New Episode Out (descending sortTime)
    itemsWithRank.sort((a, b) => b.sortTime - a.sortTime);

    return itemsWithRank.map((entry) => entry.card);
  }, [continueWatching, aniListUserWatching, continueDismissed, airingSchedule]);

  const mediaFromProgress = (item: StreamProgress): MediaItem => ({
    id: item.mediaId,
    title: item.mediaTitle,
    mediaType: item.mediaType,
    coverImage: item.coverImage,
    synopsis: "",
    genres: [],
    anilistId: item.anilistId,
  });

  const openContinueContext = (
    e: React.MouseEvent,
    media: MediaItem,
    progress?: StreamProgress,
    epNum?: number
  ) => {
    if (!onContextMenu) return;
    onContextMenu(e, media, epNum
      ? { id: `ep_cw_${media.id}_${epNum}`, episodeNumber: epNum, title: `Episode ${epNum}` }
      : undefined, { fromContinue: true, progress });
  };

  const totalCwCardsCount = continueCards.length;
  const [cwScroll, setCwScroll] = useState({ canLeft: false, canRight: false });

  const refreshCwScroll = useCallback(() => {
    setCwScroll(getRailScrollState(cwScrollRef.current));
  }, []);

  useEffect(() => {
    refreshCwScroll();
    const el = cwScrollRef.current;
    if (!el) return;

    const onScroll = () => refreshCwScroll();
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => refreshCwScroll()) : null;
    ro?.observe(el);

    // After cards mount / images load
    const t = window.setTimeout(refreshCwScroll, 80);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [continueCards.length, refreshCwScroll]);

  /** Catalog rails — eased page scroll */
  const scrollRail = (ref: RefObject<HTMLDivElement | null>, dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    void scrollRailByPage(el, dir, ".hm-poster-slot, .media-card, .hm-cw-card");
  };

  /** Continue — smooth continuous glide (can re-click mid-scroll to re-aim) */
  const scrollContinue = async (dir: 1 | -1) => {
    const el = cwScrollRef.current;
    if (!el) return;
    await scrollRailByPage(el, dir, ".hm-cw-card");
    refreshCwScroll();
  };

  const resumeLocal = (item: StreamProgress) => {
    const done = item.percentage >= 90;
    const mediaCache = StorageService.getMediaCache();
    const cached = mediaCache[item.mediaId];
    const totalEps = cached?.episodesCount || 0;
    const nextAiring = cached?.nextAiringEpisode;
    const nextEp = item.episodeNumber + 1;

    let isNextReleased = true;
    if (totalEps > 0 && nextEp > totalEps) isNextReleased = false;
    if (nextAiring && nextAiring.episode === nextEp) isNextReleased = false;

    const epNum = done && isNextReleased ? nextEp : item.episodeNumber;
    onResumeStream({
      ...item,
      episodeNumber: epNum,
      percentage: epNum === item.episodeNumber ? item.percentage : 0,
      currentTime: epNum === item.episodeNumber ? item.currentTime : 0,
      magnetUrl: epNum === item.episodeNumber ? item.magnetUrl : undefined,
      torrentTitle: epNum === item.episodeNumber ? item.torrentTitle : undefined,
      fileIndex: epNum === item.episodeNumber ? item.fileIndex : undefined,
    });
  };

  const playAniListNext = (entry: UserListProgressEntry) => {
    const nextEp = entry.progress + 1;
    const totalEps = entry.episodesCount || entry.media.episodesCount || 0;
    const nextAiring = entry.media.nextAiringEpisode;

    let isNextReleased = true;
    if (totalEps > 0 && nextEp > totalEps) isNextReleased = false;
    if (nextAiring && nextAiring.episode === nextEp) isNextReleased = false;

    const epNum = isNextReleased ? nextEp : entry.progress;

    StorageService.cacheMedia(entry.media);
    onResumeStream({
      mediaId: entry.media.id,
      mediaTitle: entry.media.title,
      mediaType: entry.media.mediaType,
      coverImage: entry.media.coverImage,
      episodeNumber: epNum,
      currentTime: 0,
      duration: 0,
      percentage: 0,
      lastUpdated: Date.now(),
      anilistId: entry.media.anilistId,
    });
  };

  return (
    <div className="home-view">
      {spotlightItems.length > 0 && (
        <HeroBanner
          items={spotlightItems}
          onSelect={onSelectMedia}
          onPlay={onPlayMedia}
          watchlist={watchlist}
          onToggleWatchlist={onToggleWatchlist}
        />
      )}

      <div className="home-body">
        {/* Continue — half-width strip under hero */}
        <section className="hm-section hm-section-continue">
          <SectionHead label="Continue" />

          <div className="hm-cw-row">
            <motion.button
              type="button"
              className={`hm-cw-arrow ${!cwScroll.canLeft ? "is-disabled" : ""}`}
              onClick={() => void scrollContinue(-1)}
              aria-label="Previous titles"
              disabled={!cwScroll.canLeft || totalCwCardsCount === 0}
              whileHover={cwScroll.canLeft ? { scale: 1.12, x: -2 } : undefined}
              whileTap={cwScroll.canLeft ? { scale: 0.92 } : undefined}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              <ChevronLeft size={22} />
            </motion.button>

            <div className="hm-cw-track">
              <div ref={cwScrollRef} className="hm-rail hm-cw-rail">
                {totalCwCardsCount === 0 && (
                  <div className="hm-empty">Nothing in progress yet.</div>
                )}

                {continueCards.map((card, i) => {
                  const mediaCache = StorageService.getMediaCache();

                  if (card.kind === "local") {
                    const item = card.item;
                    const cached = mediaCache[item.mediaId];
                    const isMovie = item.mediaType === "movie" || cached?.mediaType === "movie" || cached?.episodesCount === 1;
                    const done = item.completed || item.percentage >= 90;
                    const totalEps = cached?.episodesCount || (isMovie ? 1 : 0);
                    const nextAiring = cached?.nextAiringEpisode;
                    const nextEp = item.episodeNumber + 1;

                    let isNextReleased = true;
                    if (isMovie) {
                      isNextReleased = false;
                    } else if (totalEps > 0 && nextEp > totalEps) {
                      isNextReleased = false;
                    } else if (nextAiring && nextAiring.episode === nextEp) {
                      isNextReleased = false;
                    }

                    const displayEp = done && isNextReleased ? nextEp : item.episodeNumber;
                    let subText = "";
                    if (isMovie) {
                      subText = `${item.percentage}% watched`;
                    } else if (done) {
                      subText = isNextReleased ? `Up next · Ep ${nextEp}` : `Completed · Ep ${item.episodeNumber}`;
                    } else {
                      subText = `Ep ${displayEp} · ${item.percentage}%`;
                    }

                    const backdropUrl = cached?.bannerImage || getBackdropImageUrl(cached) || item.coverImage;

                    return (
                      <motion.button
                        type="button"
                        key={card.key}
                        className="hm-cw-card"
                        onClick={() => resumeLocal(item)}
                        onContextMenu={(e) => {
                          if (onContextMenu) {
                            e.preventDefault();
                            e.stopPropagation();
                            const media: MediaItem = cached || {
                              id: item.mediaId,
                              title: item.mediaTitle,
                              mediaType: item.mediaType,
                              coverImage: item.coverImage,
                              genres: [],
                            };
                            onContextMenu(e, media, undefined, { fromContinue: true, progress: item });
                          }
                        }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 8) * 0.04, type: "spring", stiffness: 380, damping: 28 }}
                        whileHover={{ y: -4, zIndex: 30 }}
                        whileTap={{ y: -1 }}
                        style={{ originX: 0.5, originY: 0.5 }}
                      >
                        <div className="hm-cw-thumb">
                          <MediaImage src={backdropUrl} alt={item.mediaTitle} emptyLabel="No thumbnail" />
                          <div className="poster-center-play">
                            <span className="card-play-btn">
                              <Play size={20} className="ml-0.5 play-icon-black-outlined" />
                            </span>
                          </div>
                          <div className="hm-cw-bar">
                            <div style={{ width: `${done ? 0 : item.percentage}%` }} />
                          </div>
                        </div>
                        <div className="hm-cw-meta">
                          <span className="hm-cw-title" title={item.mediaTitle}>{item.mediaTitle}</span>
                          <span className="hm-cw-sub">{subText}</span>
                        </div>
                      </motion.button>
                    );
                  }

                  const entry = card.entry;
                  const nextEp = entry.progress + 1;
                  const totalEps = entry.episodesCount || entry.media.episodesCount || 0;
                  const nextAiring = entry.media.nextAiringEpisode;

                  let isNextReleased = true;
                  if (totalEps > 0 && nextEp > totalEps) isNextReleased = false;
                  if (nextAiring && nextAiring.episode === nextEp) isNextReleased = false;

                  const subText = isNextReleased
                    ? `Up next · Ep ${nextEp}${totalEps ? ` / ${totalEps}` : ""}`
                    : `Completed · Ep ${entry.progress}`;

                  const backdropUrl = entry.media.bannerImage || getBackdropImageUrl(entry.media);

                  return (
                    <motion.button
                      type="button"
                      key={card.key}
                      className="hm-cw-card"
                      onClick={() => playAniListNext(entry)}
                      onContextMenu={(e) => {
                        if (onContextMenu) {
                          e.preventDefault();
                          e.stopPropagation();
                          onContextMenu(e, entry.media, undefined, { fromContinue: true });
                        }
                      }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: Math.min(i, 10) * 0.04,
                        type: "spring",
                        stiffness: 380,
                        damping: 28,
                      }}
                      whileHover={{ y: -4, zIndex: 30 }}
                      whileTap={{ y: -1 }}
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      <div className="hm-cw-thumb">
                        <MediaImage
                          src={backdropUrl}
                          alt={entry.media.title}
                          emptyLabel="No thumbnail"
                        />
                        <div className="poster-center-play">
                          <span className="card-play-btn">
                            <Play size={20} className="ml-0.5 play-icon-black-outlined" />
                          </span>
                        </div>
                        <div className="hm-cw-bar">
                          <div
                            style={{
                              width: `${
                                entry.episodesCount > 0
                                  ? Math.min(100, Math.round((entry.progress / entry.episodesCount) * 100))
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="hm-cw-meta">
                        <span className="hm-cw-title" title={entry.media.title}>{entry.media.title}</span>
                        <span className="hm-cw-sub">{subText}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <motion.button
              type="button"
              className={`hm-cw-arrow ${!cwScroll.canRight ? "is-disabled" : ""}`}
              onClick={() => void scrollContinue(1)}
              aria-label="Next titles"
              disabled={!cwScroll.canRight || totalCwCardsCount === 0}
              whileHover={cwScroll.canRight ? { scale: 1.12, x: 2 } : undefined}
              whileTap={cwScroll.canRight ? { scale: 0.92 } : undefined}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              <ChevronRight size={22} />
            </motion.button>
          </div>
        </section>

        {/* Schedule */}
        <section className="hm-section hm-section-calendar">
          <div className="hm-section-head hm-cal-head">
            <h2 className="hm-section-label">Schedule</h2>
            <div className="hm-cal-controls">
              <button type="button" className="hm-chip" onClick={() => setMyListsOnly((p) => !p)}>
                {myListsOnly ? "My list" : "All airing"}
              </button>
              <div className="hm-cal-month-nav">
                <button type="button" className="hm-icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="hm-month-label"
                  onClick={() => {
                    const t = new Date();
                    setViewYear(t.getFullYear());
                    setViewMonth(t.getMonth());
                  }}
                  title="Jump to this month"
                >
                  {MONTH_NAMES[viewMonth]} {viewYear}
                  {scheduleLoading ? " · …" : ""}
                </button>
                <button type="button" className="hm-icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="hm-cal">
            <div className="hm-cal-weekdays">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="hm-cal-wd">
                  {d}
                </div>
              ))}
            </div>
            <div className="hm-cal-grid">
              {calendarCells.map((cell, i) => (
                <CalendarDayCell
                  key={`cal_${cell.dateKey}_${cell.cellIndex}`}
                  cell={cell}
                  index={i}
                  onOpenShow={openScheduleShow}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Catalog rails */}
        <section className="hm-section">
          <SectionHead label="Trending anime" actionLabel="Browse" onAction={() => onNavigateTab("anime")} />
          <CatalogRail
            items={trendingAnime.slice(0, 12)}
            onSelectMedia={onSelectMedia}
            onPlayMedia={onPlayMedia}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onContextMenu={onContextMenu}
          />
        </section>

        <section className="hm-section">
          <SectionHead label="Movies" actionLabel="Browse" onAction={() => onNavigateTab("movies")} />
          <CatalogRail
            items={trendingMovies.slice(0, 12)}
            onSelectMedia={onSelectMedia}
            onPlayMedia={onPlayMedia}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onContextMenu={onContextMenu}
          />
        </section>

        <section className="hm-section">
          <SectionHead label="Series" actionLabel="Browse" onAction={() => onNavigateTab("tv")} />
          <CatalogRail
            items={trendingTv.slice(0, 12)}
            onSelectMedia={onSelectMedia}
            onPlayMedia={onPlayMedia}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onContextMenu={onContextMenu}
          />
        </section>
      </div>
    </div>
  );
}
