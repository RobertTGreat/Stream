import { useState } from "react";
import {
  Home,
  Tv,
  Film,
  Search,
  MoreHorizontal,
  Monitor,
  FolderDown,
  Bookmark,
  Download,
  BarChart2,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { ViewMode } from "../types";

interface MobileBottomNavProps {
  currentView: ViewMode;
  onNavigate: (view: ViewMode) => void;
  onOpenSearch: () => void;
  activeDownloads: number;
  onOpenAniListModal: () => void;
  aniListConnected: boolean;
}

const LEFT: { id: ViewMode; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "downloads", label: "Downloads", icon: Download },
];

const RIGHT: { id: ViewMode; label: string; icon: typeof Home }[] = [
  { id: "collections", label: "Lists", icon: Bookmark },
];

const MORE_ITEMS: { id: ViewMode; label: string; icon: typeof Home }[] = [
  { id: "anime", label: "Anime", icon: Tv },
  { id: "movies", label: "Movies", icon: Film },
  { id: "tv", label: "TV Shows", icon: Monitor },
  { id: "library", label: "Library", icon: FolderDown },
  { id: "stats", label: "Stats", icon: BarChart2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const MORE_VIEWS: ViewMode[] = ["anime", "movies", "tv", "library", "stats", "settings"];

export function MobileBottomNav({
  currentView,
  onNavigate,
  onOpenSearch,
  activeDownloads,
  onOpenAniListModal,
  aniListConnected,
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_VIEWS.includes(currentView);

  return (
    <>
      {moreOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <h2>More</h2>
              <button type="button" className="mobile-icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="mobile-sheet-grid">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mobile-sheet-item ${active ? "active" : ""}`}
                    onClick={() => {
                      onNavigate(item.id);
                      setMoreOpen(false);
                    }}
                  >
                    <span className="mobile-sheet-icon">
                      <Icon size={20} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className={`mobile-sheet-item ${aniListConnected ? "connected" : ""}`}
                onClick={() => {
                  onOpenAniListModal();
                  setMoreOpen(false);
                }}
              >
                <span className="mobile-sheet-icon">
                  <Sparkles size={20} />
                </span>
                <span>{aniListConnected ? "AniList" : "Connect AniList"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Primary">
        {LEFT.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`mobile-nav-btn ${active ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="mobile-nav-icon-wrap">
                <Icon size={22} />
                {item.id === "downloads" && activeDownloads > 0 && (
                  <span className="mobile-nav-badge">{activeDownloads > 9 ? "9+" : activeDownloads}</span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="mobile-nav-btn mobile-nav-search"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          <span className="mobile-nav-search-orb">
            <Search size={20} />
          </span>
          <span>Search</span>
        </button>
        {RIGHT.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`mobile-nav-btn ${active ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`mobile-nav-btn ${moreActive || moreOpen ? "active" : ""}`}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
