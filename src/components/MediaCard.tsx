import { useState, useRef, useEffect, memo } from "react";
import { Play, Star, Plus, Heart, Bookmark, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MediaItem } from "../types";
import { MediaImage } from "./MediaImage";
import { StorageService } from "../services/storage";
import { AniListService } from "../services/anilist";
import { TMDBService } from "../services/tmdb";

interface MediaCardProps {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  onPlay?: (item: MediaItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  inWatchlist?: boolean;
  onToggleWatchlist?: (id: string) => void;
  isWatched?: boolean;
  onMarkWatched?: (item: MediaItem, watched: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, item: MediaItem) => void;
  /** Stagger index for entrance (Continue-style spring). */
  index?: number;
  /** Use Continue-matching hover (scale 1.1 + lift). Default true. */
  animated?: boolean;
}

function MediaCardBase({
  item,
  onSelect,
  onPlay,
  isFavorite: isFavProp,
  onToggleFavorite,
  inWatchlist: inWatchlistProp,
  onToggleWatchlist,
  isWatched: isWatchedProp,
  onMarkWatched,
  onContextMenu,
  index = 0,
  animated = true,
}: MediaCardProps) {
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [localFav, setLocalFav] = useState<boolean | null>(null);
  const [localWatchlist, setLocalWatchlist] = useState<boolean | null>(null);
  const [localWatched, setLocalWatched] = useState<boolean | null>(null);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFavState = localFav !== null ? localFav : (isFavProp ?? StorageService.isFavorite(item.id));
  const inWatchlist = localWatchlist !== null ? localWatchlist : (inWatchlistProp ?? StorageService.isInWatchlist(item.id));
  const isWatched = localWatched !== null ? localWatched : (isWatchedProp ?? StorageService.isWatchedFast(item.id));

  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    prefetchTimerRef.current = setTimeout(() => {
      StorageService.cacheMedia(item);
      if (item.mediaType === "anime" && item.anilistId) {
        void AniListService.getAnimeDetail(item.anilistId).catch(() => undefined);
      } else if (item.tmdbId) {
        void TMDBService.getMediaDetail(item.tmdbId, item.mediaType).catch(() => undefined);
      }
    }, 120);
  };

  const handleMouseLeave = () => {
    setShowQuickMenu(false);
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  };

  const formatBadge =
    item.format ||
    (item.mediaType === "anime" ? "ANIME" : item.mediaType === "movie" ? "MOVIE" : "SERIES");

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    StorageService.cacheMedia(item);
    if (onToggleFavorite) {
      onToggleFavorite(item.id);
    } else {
      StorageService.toggleFavorite(item.id);
    }
    setLocalFav(!isFavState);
  };

  const handleToggleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    StorageService.cacheMedia(item);
    if (onToggleWatchlist) {
      onToggleWatchlist(item.id);
    } else {
      StorageService.toggleWatchlist(item.id);
    }
    setLocalWatchlist(!inWatchlist);
  };

  const handleToggleWatched = (e: React.MouseEvent) => {
    e.stopPropagation();
    StorageService.cacheMedia(item);
    const next = !isWatched;
    if (onMarkWatched) {
      onMarkWatched(item, next);
    } else if (next) {
      StorageService.markSeriesWatched(item);
    } else {
      StorageService.removeSeriesProgress(item.id);
    }
    setLocalWatched(next);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, item);
    }
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onContextMenu) return;
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      onContextMenu(
        {
          preventDefault() {},
          stopPropagation() {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        } as React.MouseEvent,
        item
      );
    }, 420);
  };

  return (
    <motion.div
      className="media-card"
      onClick={() => onSelect(item)}
      onContextMenu={handleRightClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={animated ? { opacity: 0, y: 8 } : false}
      animate={animated ? { opacity: 1, y: 0 } : undefined}
      transition={
        animated
          ? {
              delay: Math.min(index, 10) * 0.04,
              type: "spring",
              stiffness: 380,
              damping: 28,
            }
          : undefined
      }
      whileHover={animated ? { y: -4, zIndex: 30 } : undefined}
      whileTap={animated ? { y: -1 } : undefined}
      style={{ originX: 0.5, originY: 0.5, position: "relative" }}
    >
      <div className="card-poster-wrapper">
        <MediaImage
          src={item.coverImage}
          alt={item.title}
          className="card-poster-img"
          emptyLabel="No thumbnail"
        />

        {/* Top Left Always-Visible Rating + 70ms Extending Format Tag */}
        <div className="top-left-badge-group">
          {item.score && (
            <div className="score-pill-badge">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              <span>{item.score}</span>
            </div>
          )}
          <span className="format-badge-extend">{formatBadge}</span>
        </div>

        {/* Top Right Quick Action Plus Button & Extension Popover */}
        <div className="top-right-action-group" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`card-plus-btn ${showQuickMenu ? "active" : ""}`}
            aria-label="Quick Actions"
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickMenu((prev) => !prev);
            }}
          >
            <Plus size={14} className={`transition-transform duration-200 ${showQuickMenu ? "rotate-45" : ""}`} />
          </button>

          <AnimatePresence>
            {showQuickMenu && (
              <motion.div
                className="quick-action-menu"
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  type="button"
                  className={`quick-menu-item ${isFavState ? "active" : ""}`}
                  onClick={handleToggleFav}
                >
                  <Heart size={13} className={isFavState ? "fill-red-500 text-red-500" : ""} />
                  <span>{isFavState ? "In Favorites" : "Favorite"}</span>
                </button>
                <button
                  type="button"
                  className={`quick-menu-item ${inWatchlist ? "active" : ""}`}
                  onClick={handleToggleWatchlist}
                >
                  <Bookmark size={13} className={inWatchlist ? "fill-purple-400 text-purple-400" : ""} />
                  <span>{inWatchlist ? "In Watchlist" : "Add Watchlist"}</span>
                </button>
                <button
                  type="button"
                  className={`quick-menu-item ${isWatched ? "active" : ""}`}
                  onClick={handleToggleWatched}
                >
                  <CheckCircle2 size={13} className={isWatched ? "text-emerald-400" : ""} />
                  <span>{isWatched ? "Watched" : "Mark Watched"}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dead-Centered Play Button */}
        <div className="poster-center-play">
          <button
            type="button"
            className="card-play-btn"
            aria-label="Play media"
            onClick={(e) => {
              e.stopPropagation();
              if (onPlay) onPlay(item);
              else onSelect(item);
            }}
          >
            <Play size={20} className="ml-0.5 play-icon-black-outlined" />
          </button>
        </div>

        <div className="poster-overlay">
          <div className="poster-bottom-row">
            {item.mediaType !== "movie" && item.format !== "MOVIE" && item.episodesCount && item.episodesCount > 1 && (
              <span className="ep-count">{item.episodesCount} EPS</span>
            )}
            {item.year && <span className="year-tag">{item.year}</span>}
          </div>
        </div>
      </div>

      <div className="card-info">
        <h3 className="card-title" title={item.title}>
          {item.title}
        </h3>
        <p className="card-genres">{item.genres.slice(0, 2).join(" • ")}</p>
      </div>
    </motion.div>
  );
}

export const MediaCard = memo(MediaCardBase);

