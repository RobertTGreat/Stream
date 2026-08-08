import { useState, useRef, useEffect } from "react";
import { Search, RefreshCw } from "lucide-react";
import { MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";

interface TvViewProps {
  items: MediaItem[];
  isLoading: boolean;
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSearch: (query: string) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
}

export function TvView({
  items,
  isLoading,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onSearch,
  onContextMenu,
}: TvViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { containerRef, displayItems } = useFullRowsItems(items, 170, 16);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(val);
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
          <h1>TV Shows & Series</h1>
          <p className="subtitle">Powered by TMDB Series Index</p>
        </div>

        <div className="filter-controls">
          <div className="search-field">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search TV shows..."
              value={searchQuery}
              onChange={handleSearch}
              className="catalog-input"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <RefreshCw size={24} className="spin-icon" />
          <p>Fetching TV series from TMDB API...</p>
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
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
