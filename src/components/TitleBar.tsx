import { Search, User, Minus, Square, X } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { UserProfile, ViewMode } from "../types";
import { invokeTauri } from "../services/tauri";

interface TitleBarProps {
  profile: UserProfile;
  onOpenSearch: () => void;
  onNavigate: (view: ViewMode) => void;
  currentViewTitle?: string;
}

export function TitleBar({ profile, onOpenSearch, onNavigate, currentViewTitle }: TitleBarProps) {
  const handleMinimize = async () => {
    try {
      await invokeTauri("app_minimize_cmd");
    } catch (e) {
      console.warn("Minimize window error", e);
    }
  };

  const handleMaximize = async () => {
    try {
      await invokeTauri("app_toggle_maximize_cmd");
    } catch (e) {
      console.warn("Maximize window error", e);
    }
  };

  const handleClose = async () => {
    try {
      await invokeTauri("app_close_cmd");
    } catch (e) {
      console.warn("Close window error", e);
    }
  };

  return (
    <header className="app-titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="app-name" data-tauri-drag-region>Stream</span>
        {currentViewTitle && (
          <>
            <span className="title-divider" data-tauri-drag-region>/</span>
            <span className="view-title" data-tauri-drag-region>{currentViewTitle}</span>
          </>
        )}
      </div>

      <div className="titlebar-center" data-tauri-drag-region>
        <button type="button" className="quick-search-bar" onClick={onOpenSearch}>
          <Search size={14} className="text-zinc-400" />
          <span className="search-placeholder">Search anime, movies, series...</span>
          <kbd className="search-kbd">Ctrl K</kbd>
        </button>
      </div>

      <div className="titlebar-right" data-tauri-drag-region>
        <Tooltip label={profile.name} hint="Profile Settings" side="bottom">
          <button type="button" className="profile-pill-btn" onClick={() => onNavigate("settings")}>
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="user-avatar-img" />
            ) : (
              <User size={14} />
            )}
          </button>
        </Tooltip>

        <div className="window-controls">
          <button type="button" className="win-btn" onClick={handleMinimize} aria-label="Minimize">
            <Minus size={13} />
          </button>
          <button type="button" className="win-btn" onClick={handleMaximize} aria-label="Maximize">
            <Square size={11} />
          </button>
          <button type="button" className="win-btn close" onClick={handleClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
