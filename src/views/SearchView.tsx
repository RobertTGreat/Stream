import { useState, useRef, useEffect, useCallback } from "react";
import { Search, RefreshCw, SlidersHorizontal, RotateCcw } from "lucide-react";
import { MediaItem, MediaType } from "../types";
import { MediaCard } from "../components/MediaCard";
import { useFullRowsItems } from "../utils/useFullRowsItems";

interface SearchViewProps {
  searchResults: MediaItem[];
  trendingAnime?: MediaItem[];
  trendingMovies?: MediaItem[];
  trendingTv?: MediaItem[];
  isLoading: boolean;
  error?: string | null;
  onSearch: (query: string, type: MediaType, genre?: string, year?: number) => void;
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchlist?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
}

export function SearchView({
  searchResults,
  trendingAnime = [],
  trendingMovies = [],
  trendingTv = [],
  isLoading,
  error,
  onSearch,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onToggleWatchlist,
  onContextMenu,
}: SearchViewProps) {
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("anime");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFiltered = Boolean(query.trim() || selectedGenre || selectedYear);
  const defaultPool =
    mediaType === "movie"
      ? trendingMovies
      : mediaType === "tv"
      ? trendingTv
      : trendingAnime;

  const rawList = isFiltered ? searchResults : defaultPool;
  const { containerRef, displayItems } = useFullRowsItems(rawList, 170, 16);

  const executeSearch = useCallback(
    (
      newQuery = query,
      newType = mediaType,
      newGenre = selectedGenre,
      newYear = selectedYear
    ) => {
      const yearNum = newYear ? parseInt(newYear, 10) : undefined;
      onSearch(newQuery, newType, newGenre || undefined, yearNum);
    },
    [query, mediaType, selectedGenre, selectedYear, onSearch]
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val, mediaType, selectedGenre, selectedYear);
    }, 320);
  };

  const handleResetFilters = () => {
    setQuery("");
    setMediaType("anime");
    setSelectedGenre("");
    setSelectedYear("");
    executeSearch("", "anime", "", "");
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return (
    <div className="view-container search-view">
      <div className="search-layout-wrapper">
        {/* Left Sticky Filter Sidebar */}
        <aside className="search-sidebar">
          <div className="sidebar-title-row">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-zinc-300" />
              <h3>Filters</h3>
            </div>
            {(query || selectedGenre || selectedYear || mediaType !== "anime") && (
              <button
                type="button"
                className="btn-reset-filters flex items-center gap-1"
                onClick={handleResetFilters}
                title="Reset search & filters"
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="filter-group">
            <label className="filter-label">Media Type</label>
            <div className="type-toggle-btns">
              {(["anime", "movie", "tv"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`type-btn ${mediaType === t ? "active" : ""}`}
                  onClick={() => {
                    setMediaType(t);
                    executeSearch(query, t, selectedGenre, selectedYear);
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Genre</label>
            <select
              value={selectedGenre}
              onChange={(e) => {
                const g = e.target.value;
                setSelectedGenre(g);
                executeSearch(query, mediaType, g, selectedYear);
              }}
              className="filter-select"
            >
              <option value="">All Genres</option>
              <option value="Action">Action</option>
              <option value="Adventure">Adventure</option>
              <option value="Drama">Drama</option>
              <option value="Fantasy">Fantasy</option>
              <option value="Mystery">Mystery</option>
              <option value="Sci-Fi">Sci-Fi</option>
              <option value="Supernatural">Supernatural</option>
              <option value="Animation">Animation</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => {
                const y = e.target.value;
                setSelectedYear(y);
                executeSearch(query, mediaType, selectedGenre, y);
              }}
              className="filter-select"
            >
              <option value="">Any Year</option>
              {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </aside>

        {/* Right Main Search Area */}
        <main className="search-main">
          <div className="main-search-input-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search anime, movies, series by title, studio, or genre..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") executeSearch();
              }}
              className="big-search-input"
              autoFocus
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => executeSearch()}
            >
              <span>Search</span>
            </button>
          </div>

          <div className="search-status-bar">
            <span>
              {query || selectedGenre || selectedYear
                ? `Showing ${searchResults.length} results`
                : "Type a query or adjust filters to discover media"}
            </span>
          </div>

          {isLoading ? (
            <div className="loading-state">
              <RefreshCw size={24} className="spin-icon" />
              <p>Searching metadata databases...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p>{error}</p>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="empty-state">
              <p>{isFiltered ? "No titles matched those filters." : "Type a query or adjust filters to discover media."}</p>
            </div>
          ) : (
            <div ref={containerRef} className="catalog-grid">
              {displayItems.map((item, idx) => (
                <MediaCard
                  key={`srch_${item.id}_${idx}`}
                  item={item}
                  index={idx}
                  onSelect={onSelectMedia}
                  onPlay={onPlayMedia}
                  isFavorite={favorites.includes(item.id)}
                  onToggleFavorite={onToggleFavorite}
                  onToggleWatchlist={onToggleWatchlist}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
