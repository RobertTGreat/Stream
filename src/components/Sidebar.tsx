import React from "react";
import {
  Home,
  Tv,
  Film,
  Monitor,
  FolderDown,
  Search,
  Bookmark,
  BarChart2,
  Download,
  Settings,
  Sparkles,
} from "lucide-react";
import { ViewMode } from "../types";
import { Tooltip } from "./Tooltip";

interface SidebarProps {
  currentView: ViewMode;
  onNavigate: (view: ViewMode) => void;
  activeDownloads: number;
  overallProgress: number;
  onOpenAniListModal: () => void;
  aniListConnected: boolean;
}

export function Sidebar({
  currentView,
  onNavigate,
  activeDownloads,
  overallProgress,
  onOpenAniListModal,
  aniListConnected,
}: SidebarProps) {
  const navItems: { id: ViewMode; label: string; hint: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "home", label: "Home", hint: "Spotlight & Trending", icon: Home },
    { id: "anime", label: "Anime", hint: "AniList & MAL Catalog", icon: Tv },
    { id: "movies", label: "Movies", hint: "TMDB Cinema Movies", icon: Film },
    { id: "tv", label: "TV Shows", hint: "Series & TV Shows", icon: Monitor },
    { id: "library", label: "Library", hint: "Scanned Local Folders", icon: FolderDown },
    { id: "search", label: "Search", hint: "Global Search · Ctrl+K", icon: Search },
    { id: "collections", label: "Collections", hint: "Watchlist & Custom Lists", icon: Bookmark },
    { id: "stats", label: "Statistics", hint: "Watch History & Stats", icon: BarChart2 },
  ];

  return (
    <aside className="sidebar-rail">
      <div className="rail-nav">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = currentView === item.id;
          return (
            <Tooltip key={item.id} label={item.label} hint={item.hint} side="right">
              <button
                type="button"
                className={`rail-btn ${isActive ? "active" : ""}`}
                aria-label={item.label}
                aria-pressed={isActive}
                onClick={() => onNavigate(item.id)}
              >
                <IconComponent size={18} />
                {isActive && <div className="active-indicator" />}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="rail-footer">
        {/* AniList sync indicator button */}
        <Tooltip
          label="AniList Sync"
          hint={aniListConnected ? "AniList Account Synced" : "Connect AniList Account"}
          side="right"
        >
          <button
            type="button"
            className={`rail-btn ${aniListConnected ? "text-purple-400" : "text-zinc-500"}`}
            aria-label="AniList Sync"
            onClick={onOpenAniListModal}
          >
            <Sparkles size={18} className={aniListConnected ? "glow-purple" : ""} />
            {aniListConnected && <span className="dot-online" />}
          </button>
        </Tooltip>

        {/* Downloads slot */}
        <Tooltip
          label="Downloads"
          hint={
            activeDownloads > 0
              ? `${overallProgress}% · ${activeDownloads} Active · Ctrl+J`
              : "Download Queue · Ctrl+J"
          }
          side="right"
        >
          <div className="queue-slot">
            <button
              type="button"
              className={`rail-btn queue-btn ${currentView === "downloads" ? "active" : ""}`}
              aria-label="Downloads"
              onClick={() => onNavigate("downloads")}
            >
              <Download size={18} />
              {activeDownloads > 0 && (
                <span className="download-badge">
                  {activeDownloads > 9 ? "9+" : activeDownloads}
                </span>
              )}
            </button>
          </div>
        </Tooltip>

        {/* Settings button */}
        <Tooltip label="Settings" hint="Preferences · Ctrl+," side="right">
          <button
            type="button"
            className={`rail-btn ${currentView === "settings" ? "active" : ""}`}
            aria-label="Settings"
            onClick={() => onNavigate("settings")}
          >
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
