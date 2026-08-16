import { useState, useRef, useEffect } from "react";
import { Search, Flame, TrendingUp, Star, Sparkles } from "lucide-react";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";
import { SkeletonGrid } from "../components/Skeleton";

interface AnimeViewProps {
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

const GENRES = ["All", "Action", "Adventure", "Drama", "Fantasy", "Mystery", "Sci-Fi", "Supernatural"];

const SORT_OPTIONS: { id: "TRENDING_DESC" | "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC"; label: string; icon: any }[] = [
  { id: "TRENDING_DESC", label: "Trending", icon: Flame },
  { id: "POPULARITY_DESC", label: "Popular", icon: TrendingUp },
  { id: "SCORE_DESC", label: "Top Rated", icon: Star },
  { id: "START_DATE_DESC", label: "Newest", icon: Sparkles },
];

export function AnimeView({
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
}: AnimeViewProps) {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedSort, setSelectedSort] = useState<"TRENDING_DESC" | "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC">("TRENDING_DESC");
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { containerRef, displayItems } = useFullRowsItems(items, 118, 10);

  const handleGenreClick = (genre: string) => {
    setSelectedGenre(genre);
    onSearch(searchQuery, genre === "All" ? undefined : genre, selectedSort);
  };

  const handleSortClick = (sortId: "TRENDING_DESC" | "POPULARITY_DESC" | "SCORE_DESC" | "START_DATE_DESC") => {
    setSelectedSort(sortId);
    onSearch(searchQuery, selectedGenre === "All" ? undefined : selectedGenre, sortId);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(val, selectedGenre === "All" ? undefined : selectedGenre, selectedSort);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
          {GENRES.map((genre) => (
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

        <div className="search-field catalog-search-field">
          <Search size={14} />
          <input
            type="text"
            placeholder="Filter anime..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="catalog-input"
          />
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
          <p>No anime matched that search.</p>
        </div>
      ) : (
        <div ref={containerRef} className="catalog-grid">
          {displayItems.map((item, idx) => (
            <MediaCard
              key={`ani_view_${item.id}_${idx}`}
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
