import { useState } from "react";
import { Flame, TrendingUp, Star, Radio } from "lucide-react";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";
import { SkeletonGrid } from "../components/Skeleton";

interface TvViewProps {
  items: MediaItem[];
  isLoading: boolean;
  error?: string | null;
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchlist?: (id: string) => void;
  onMarkWatched?: (item: MediaItem, watched: boolean) => void;
  onSearch: (query: string, genre?: string, sort?: string) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
}

const TV_GENRES = ["All", "Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Mystery", "Sci-Fi"];

const SORT_OPTIONS: { id: "trending" | "popular" | "top_rated" | "airing_today"; label: string; icon: any }[] = [
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: TrendingUp },
  { id: "top_rated", label: "Top Rated", icon: Star },
  { id: "airing_today", label: "Airing Today", icon: Radio },
];

export function TvView({
  items,
  isLoading,
  error,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onToggleWatchlist,
  onMarkWatched,
  onSearch,
  onContextMenu,
}: TvViewProps) {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedSort, setSelectedSort] = useState<"trending" | "popular" | "top_rated" | "airing_today">("trending");
  const { containerRef, displayItems } = useFullRowsItems(items, 118, 10);

  const handleGenreClick = (genre: string) => {
    setSelectedGenre(genre);
    onSearch("", genre === "All" ? undefined : genre, selectedSort);
  };

  const handleSortClick = (sortId: "trending" | "popular" | "top_rated" | "airing_today") => {
    setSelectedSort(sortId);
    onSearch("", selectedGenre === "All" ? undefined : selectedGenre, sortId);
  };

  return (
    <div className="view-container catalog-view">
      <div className="catalog-toolbar">
        <div className="sort-pills-bar">
          {SORT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                className={`sort-pill-btn ${selectedSort === opt.id ? "active" : ""}`}
                onClick={() => handleSortClick(opt.id)}
              >
                <Icon size={12} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="genre-divider" />

        <div className="genre-pills-bar">
          {TV_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              className={`genre-pill-btn ${selectedGenre === genre ? "active" : ""}`}
              onClick={() => handleGenreClick(genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <SkeletonGrid count={18} />
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="empty-state">
          <p>No series matched that search.</p>
        </div>
      ) : (
        <div ref={containerRef} className="catalog-grid">
          {displayItems.map((item, idx) => (
            <MediaCard
              key={`tv_view_${item.id}_${idx}`}
              item={item}
              index={idx}
              onSelect={onSelectMedia}
              onPlay={onPlayMedia}
              isFavorite={favorites.includes(item.id)}
              onToggleFavorite={onToggleFavorite}
              onToggleWatchlist={onToggleWatchlist}
              onMarkWatched={onMarkWatched}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
