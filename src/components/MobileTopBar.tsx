import { ArrowLeft, User } from "lucide-react";
import { UserProfile, ViewMode } from "../types";

interface MobileTopBarProps {
  profile: UserProfile;
  currentView: ViewMode;
  currentViewTitle?: string;
  onNavigate: (view: ViewMode) => void;
  onBack?: () => void;
}

const TITLES: Partial<Record<ViewMode, string>> = {
  home: "Stream",
  anime: "Anime",
  movies: "Movies",
  tv: "TV Shows",
  library: "Library",
  search: "Search",
  collections: "Collections",
  stats: "Stats",
  downloads: "Downloads",
  settings: "Settings",
  "media-detail": "Details",
};

export function MobileTopBar({
  profile,
  currentView,
  currentViewTitle,
  onNavigate,
  onBack,
}: MobileTopBarProps) {
  const showBack = currentView === "media-detail";
  const title =
    currentView === "media-detail" && currentViewTitle
      ? currentViewTitle
      : TITLES[currentView] || "Stream";

  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-left">
        {showBack ? (
          <button type="button" className="mobile-icon-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span className="mobile-brand">S</span>
        )}
        <h1 className="mobile-topbar-title">{title}</h1>
      </div>
      <div className="mobile-topbar-right">
        <button
          type="button"
          className="mobile-avatar-btn"
          onClick={() => onNavigate("settings")}
          aria-label="Profile"
        >
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            <User size={16} />
          )}
        </button>
      </div>
    </header>
  );
}
