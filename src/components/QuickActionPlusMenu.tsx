import { useState } from "react";
import { Plus, Heart, Bookmark, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StorageService } from "../services/storage";

interface QuickActionPlusMenuProps {
  mediaId: string;
  mediaTitle: string;
  mediaType: "anime" | "movie" | "tv";
  coverImage?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onToggleWatchlist?: (id: string) => void;
  className?: string;
  buttonClassName?: string;
}

export function QuickActionPlusMenu({
  mediaId,
  mediaTitle,
  mediaType,
  coverImage,
  isFavorite: isFavProp,
  onToggleFavorite,
  onToggleWatchlist,
  className = "",
  buttonClassName = "",
}: QuickActionPlusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFavState, setIsFavState] = useState(() => isFavProp ?? StorageService.isFavorite(mediaId));
  const [inWatchlist, setInWatchlist] = useState(() => StorageService.isInWatchlist(mediaId));
  const [isWatched, setIsWatched] = useState(() =>
    StorageService.getWatchProgress().some((h) => h.mediaId === mediaId && (h.completed || h.percentage >= 90))
  );

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(mediaId);
    } else {
      StorageService.toggleFavorite(mediaId);
    }
    setIsFavState((prev) => !prev);
  };

  const handleToggleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleWatchlist) {
      onToggleWatchlist(mediaId);
    } else {
      StorageService.toggleWatchlist(mediaId);
    }
    setInWatchlist((prev) => !prev);
  };

  const handleToggleWatched = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWatched) {
      StorageService.removeWatchProgress(mediaId);
      setIsWatched(false);
    } else {
      StorageService.saveWatchProgress({
        mediaId,
        mediaTitle,
        mediaType,
        coverImage: coverImage || "",
        episodeNumber: 1,
        currentTime: 1200,
        duration: 1200,
        percentage: 100,
        completed: true,
        lastUpdated: Date.now(),
      });
      setIsWatched(true);
    }
  };

  return (
    <div
      className={`quick-action-plus-wrap relative inline-block ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={`card-plus-btn ${isOpen ? "active" : ""} ${buttonClassName}`}
        aria-label="Quick Actions"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
      >
        <Plus size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
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
  );
}
