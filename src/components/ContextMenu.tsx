import { useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Play,
  Download,
  Heart,
  Plus,
  Check,
  Bookmark,
  Trash2,
  Info,
  Copy,
  ExternalLink,
} from "lucide-react";
import { MediaItem, Episode, StreamProgress } from "../types";
import { isMobileUi } from "../utils/platform";

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  media?: MediaItem;
  episode?: Episode;
  isWatched?: boolean;
  isFavorite?: boolean;
  isInWatchlist?: boolean;
  /** When opened from Continue row */
  fromContinue?: boolean;
  progress?: StreamProgress;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onMarkWatched: (media: MediaItem, ep?: Episode, watched?: boolean) => void;
  onPlay: (media: MediaItem, ep?: Episode) => void;
  onDownload: (media: MediaItem, ep?: Episode) => void;
  onToggleFavorite?: (mediaId: string) => void;
  onToggleWatchlist?: (mediaId: string) => void;
  onAddToCollection?: (mediaId: string) => void;
  onOpenDetails?: (media: MediaItem) => void;
  onRemoveFromContinue?: (media: MediaItem, progress?: StreamProgress) => void;
}

export function ContextMenu({
  state,
  onClose,
  onMarkWatched,
  onPlay,
  onDownload,
  onToggleFavorite,
  onToggleWatchlist,
  onAddToCollection,
  onOpenDetails,
  onRemoveFromContinue,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (state.isOpen) {
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("touchstart", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.isOpen, onClose]);

  if (!state.isOpen || !state.media) return null;

  const adjustedX = Math.min(state.x, window.innerWidth - 240);
  const adjustedY = Math.min(state.y, window.innerHeight - 340);

  const copyTitle = async () => {
    try {
      await navigator.clipboard.writeText(state.media!.title);
    } catch {
      // ignore
    }
    onClose();
  };

  const mobile = isMobileUi();
  const iconSize = mobile ? 20 : 14;

  const menu = (
    <div
      ref={menuRef}
      className={`custom-context-menu ${mobile ? "is-mobile-sheet" : ""}`}
      style={mobile ? undefined : { left: `${adjustedX}px`, top: `${adjustedY}px` }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {mobile && <div className="mobile-sheet-handle" />}
      <div className="ctx-menu-header">
        <span className="ctx-menu-title" title={state.media.title}>
          {state.media.title}
        </span>
        {state.episode && (
          <span className="ctx-menu-subtitle">
            EP {state.episode.episodeNumber}
            {state.episode.title ? ` — ${state.episode.title}` : ""}
          </span>
        )}
      </div>

      <div className="ctx-menu-divider" />

      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => {
          onPlay(state.media!, state.episode);
          onClose();
        }}
      >
        <Play size={iconSize} className="text-purple-400 fill-current" />
        <span>Play</span>
      </button>

      {onOpenDetails && (
        <button
          type="button"
          className="ctx-menu-item"
          onClick={() => {
            onOpenDetails(state.media!);
            onClose();
          }}
        >
          <Info size={iconSize} className="text-zinc-400" />
          <span>Open details</span>
        </button>
      )}

      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => {
          onMarkWatched(state.media!, state.episode, !state.isWatched);
          onClose();
        }}
      >
        {state.isWatched ? (
          <>
            <EyeOff size={iconSize} className="text-zinc-400" />
            <span>Mark as unwatched</span>
          </>
        ) : (
          <>
            <Eye size={iconSize} className="text-emerald-400" />
            <span>Mark as watched</span>
          </>
        )}
      </button>

      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => {
          onDownload(state.media!, state.episode);
          onClose();
        }}
      >
        <Download size={iconSize} className="text-blue-400" />
        <span>Download</span>
      </button>

      <div className="ctx-menu-divider" />

      {onToggleFavorite && (
        <button
          type="button"
          className="ctx-menu-item"
          onClick={() => {
            onToggleFavorite(state.media!.id);
            onClose();
          }}
        >
          <Heart
            size={iconSize}
            className={state.isFavorite ? "text-rose-500 fill-rose-500" : "text-zinc-400"}
          />
          <span>{state.isFavorite ? "Remove from favorites" : "Add to favorites"}</span>
        </button>
      )}

      {onToggleWatchlist && (
        <button
          type="button"
          className="ctx-menu-item"
          onClick={() => {
            onToggleWatchlist(state.media!.id);
            onClose();
          }}
        >
          {state.isInWatchlist ? (
            <>
              <Check size={iconSize} className="text-emerald-400" />
              <span>Remove from watchlist</span>
            </>
          ) : (
            <>
              <Plus size={iconSize} className="text-zinc-400" />
              <span>Add to watchlist</span>
            </>
          )}
        </button>
      )}

      {onAddToCollection && (
        <button
          type="button"
          className="ctx-menu-item"
          onClick={() => {
            onAddToCollection(state.media!.id);
            onClose();
          }}
        >
          <Bookmark size={iconSize} className="text-amber-400" />
          <span>Add to collection</span>
        </button>
      )}

      <button type="button" className="ctx-menu-item" onClick={() => void copyTitle()}>
        <Copy size={iconSize} className="text-zinc-400" />
        <span>Copy title</span>
      </button>

      {state.media.anilistId && (
        <button
          type="button"
          className="ctx-menu-item"
          onClick={() => {
            window.open(`https://anilist.co/anime/${state.media!.anilistId}`, "_blank");
            onClose();
          }}
        >
          <ExternalLink size={iconSize} className="text-zinc-400" />
          <span>Open on AniList</span>
        </button>
      )}

      {state.fromContinue && onRemoveFromContinue && (
        <>
          <div className="ctx-menu-divider" />
          <button
            type="button"
            className="ctx-menu-item danger"
            onClick={() => {
              onRemoveFromContinue(state.media!, state.progress);
              onClose();
            }}
          >
            <Trash2 size={iconSize} />
            <span>Remove from Continue</span>
          </button>
        </>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div className="ctx-mobile-backdrop" onClick={onClose}>
        {menu}
      </div>
    );
  }

  return menu;
}
