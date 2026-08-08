import { useState, useRef, useEffect } from "react";
import { Search, RefreshCw } from "lucide-react";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";

interface AnimeViewProps {
  items: MediaItem[];
  isLoading: boolean;
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSearch: (query: string, genre?: string) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
}

const GENRES = ["All", "Action", "Adventure", "Drama", "Fantasy", "Mystery", "Sci-Fi", "Supernatural"];

export function AnimeView({
  items,
  isLoading,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onSearch,
  onContextMenu,
}: AnimeViewProps) {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { containerRef, displayItems } = useFullRowsItems(items, 170, 16);

  const handleGenreClick = (genre: string) => {
    setSelectedGenre(genre);
    onSearch(searchQuery, genre === "All" ? undefined : genre);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(val, selectedGenre === "All" ? undefined : selectedGenre);
    }, 300);
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
          <h1>Anime Catalog</h1>
          <p className="subtitle">Powered by AniList & MyAnimeList GraphQL</p>
        </div>

        <div className="filter-controls">
          <div className="search-field">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search anime..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="catalog-input"
            />
          </div>
        </div>
      </div>

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

      {isLoading ? (
        <div className="loading-state">
          <RefreshCw size={24} className="spin-icon" />
          <p>Fetching anime from AniList API...</p>
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
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
