import { useState, useRef, useEffect } from "react";
import { Search, Flame, TrendingUp, Star, Calendar } from "lucide-react";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";
import { SkeletonGrid } from "../components/Skeleton";

interface MoviesViewProps {
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

const MOVIE_GENRES = ["All", "Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Fantasy", "Horror", "Sci-Fi", "Thriller"];

const SORT_OPTIONS: { id: "trending" | "popular" | "top_rated" | "upcoming"; label: string; icon: any }[] = [
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: TrendingUp },
  { id: "top_rated", label: "Top Rated", icon: Star },
  { id: "upcoming", label: "Upcoming", icon: Calendar },
];

export function MoviesView({
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
}: MoviesViewProps) {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedSort, setSelectedSort] = useState<"trending" | "popular" | "top_rated" | "upcoming">("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { containerRef, displayItems } = useFullRowsItems(items, 118, 10);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(val, selectedGenre === "All" ? undefined : selectedGenre, selectedSort);
    }, 300);
  };

  const handleGenreClick = (genre: string) => {
    setSelectedGenre(genre);
    onSearch(searchQuery, genre === "All" ? undefined : genre, selectedSort);
  };

  const handleSortClick = (sortId: "trending" | "popular" | "top_rated" | "upcoming") => {
    setSelectedSort(sortId);
    onSearch(searchQuery, selectedGenre === "All" ? undefined : selectedGenre, sortId);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="view-container catalog-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Cinema Movies</h1>
          <p className="subtitle">Powered by TMDB Cinema Database</p>
        </div>

        <div className="filter-controls">
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

          <div className="search-field">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search movies..."
              value={searchQuery}
              onChange={handleSearch}
              className="catalog-input"
            />
          </div>
        </div>
      </div>

      <div className="genre-pills-bar">
        {MOVIE_GENRES.map((genre) => (
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

      {isLoading ? (
        <SkeletonGrid count={18} />
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="empty-state">
          <p>No movies matched that search.</p>
        </div>
      ) : (
        <div ref={containerRef} className="catalog-grid">
          {displayItems.map((item, idx) => (
            <MediaCard
              key={`mov_view_${item.id}_${idx}`}
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
