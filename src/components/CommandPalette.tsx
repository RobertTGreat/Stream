import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Tv,
  Film,
  Sparkles,
  Home,
  Folder,
  Settings,
  Bookmark,
  User,
  HardDrive,
  Zap,
  Radio,
  Key,
  FolderOpen,
  Palette,
  Clock,
} from "lucide-react";
import { MediaItem, ViewMode } from "../types";
import { AniListService } from "../services/anilist";
import { TMDBService } from "../services/tmdb";
import { StorageService } from "../services/storage";
import { MediaImage } from "./MediaImage";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewMode) => void;
  onSelectMedia: (media: MediaItem) => void;
}

interface ActionCommand {
  id: string;
  type: "action";
  title: string;
  icon: typeof Home;
  keywords?: string[];
  action: () => void;
}

interface SettingsCommand {
  id: string;
  type: "settings";
  title: string;
  subtitle: string;
  icon: typeof Settings;
  keywords: string[];
  sectionId: string;
}

type NavigableItem = ActionCommand | SettingsCommand | { type: "media"; item: MediaItem; id: string };

/** Pull season/part from title when metadata is missing */
export function parseSeasonLabel(title: string, seasonsCount?: number): string | null {
  const patterns: RegExp[] = [
    /\bseason\s*(\d+)\b/i,
    /\b(\d+)(?:st|nd|rd|th)\s*season\b/i,
    /\bs(\d+)\b/i,
    /\bpart\s*(\d+)\b/i,
    /\bcours?\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (re.source.toLowerCase().includes("part")) return `Part ${n}`;
      return `Season ${n}`;
    }
  }
  if (seasonsCount && seasonsCount > 1) return `${seasonsCount} seasons`;
  return null;
}

function cleanDisplayTitle(title: string): string {
  return title
    .replace(/\bseason\s*\d+\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, "")
    .replace(/\bs\d+\b/gi, "")
    .replace(/\bpart\s*\d+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—:]\s*$/g, "")
    .trim() || title;
}

function matchesQuery(text: string, keywords: string[] | undefined, q: string): boolean {
  if (!q) return true;
  const hay = `${text} ${(keywords || []).join(" ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

const SETTINGS_ENTRIES: Omit<SettingsCommand, "type">[] = [
  {
    id: "set_profile",
    title: "User Profile",
    subtitle: "Display name, avatar, AniList sync",
    icon: User,
    keywords: ["profile", "name", "avatar", "account", "anilist", "sync"],
    sectionId: "settings-profile",
  },
  {
    id: "set_library",
    title: "Library Folders",
    subtitle: "Anime, movies, and TV paths",
    icon: FolderOpen,
    keywords: ["library", "folder", "anime", "movies", "tv", "path", "scan"],
    sectionId: "settings-library",
  },
  {
    id: "set_downloads",
    title: "Downloads & Storage",
    subtitle: "Download path, concurrent jobs, post-watch",
    icon: HardDrive,
    keywords: ["download", "torrent", "storage", "path", "keep", "delete", "post-watch", "cache"],
    sectionId: "settings-downloads",
  },
  {
    id: "set_appearance",
    title: "Appearance",
    subtitle: "Accent color and theme highlights",
    icon: Palette,
    keywords: ["appearance", "accent", "color", "theme", "purple", "ui"],
    sectionId: "settings-appearance",
  },
  {
    id: "set_easywatch",
    title: "Easy Watch",
    subtitle: "Auto-pick torrent, quality, min seeders",
    icon: Zap,
    keywords: ["easy", "watch", "auto", "quality", "1080p", "720p", "4k", "seeders", "best"],
    sectionId: "settings-easy-watch",
  },
  {
    id: "set_playback",
    title: "Playback",
    subtitle: "Auto-play next, hardware decode, subtitles",
    icon: Zap,
    keywords: ["playback", "autoplay", "next", "hwdec", "subtitles", "hardware"],
    sectionId: "settings-playback",
  },
  {
    id: "set_indexers",
    title: "Torrent Indexers",
    subtitle: "Nyaa, AnimeTosho, SeaDex, Jackett, Prowlarr",
    icon: Radio,
    keywords: ["indexer", "nyaa", "tosho", "seadex", "jackett", "prowlarr", "provider"],
    sectionId: "settings-indexers",
  },
  {
    id: "set_api",
    title: "Metadata API Keys",
    subtitle: "TMDB and external keys",
    icon: Key,
    keywords: ["api", "tmdb", "key", "metadata", "token"],
    sectionId: "settings-api",
  },
  {
    id: "set_root",
    title: "All Settings",
    subtitle: "Open preferences",
    icon: Settings,
    keywords: ["settings", "preferences", "options", "config"],
    sectionId: "settings-profile",
  },
];

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onSelectMedia,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const hasQuery = q.length > 0;

  const openSettings = (sectionId: string) => {
    try {
      sessionStorage.setItem("stream_settings_focus", sectionId);
    } catch {
      // ignore
    }
    onNavigate("settings");
    onClose();
  };

  const defaultActions: ActionCommand[] = useMemo(
    () => [
      { id: "act_home", type: "action", title: "Home", icon: Home, action: () => { onNavigate("home"); onClose(); } },
      { id: "act_anime", type: "action", title: "Anime", icon: Sparkles, action: () => { onNavigate("anime"); onClose(); } },
      { id: "act_movies", type: "action", title: "Movies", icon: Film, action: () => { onNavigate("movies"); onClose(); } },
      { id: "act_tv", type: "action", title: "Series", icon: Tv, action: () => { onNavigate("tv"); onClose(); } },
      { id: "act_library", type: "action", title: "Library", icon: Folder, action: () => { onNavigate("library"); onClose(); } },
      { id: "act_collections", type: "action", title: "Collections", icon: Bookmark, action: () => { onNavigate("collections"); onClose(); } },
      {
        id: "act_settings",
        type: "action",
        title: "Settings",
        icon: Settings,
        keywords: ["preferences", "config"],
        action: () => openSettings("settings-profile"),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onNavigate, onClose]
  );

  const settingsCommands: SettingsCommand[] = useMemo(
    () =>
      SETTINGS_ENTRIES.map((s) => ({
        ...s,
        type: "settings" as const,
        action: undefined as never,
      })),
    []
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setSearchResults([]);
      setRecentSearches(StorageService.getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!hasQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [animeList, movieDb, tvDb] = await Promise.all([
          AniListService.searchAnime({ query: q }),
          TMDBService.searchTMDB(q, "movie"),
          TMDBService.searchTMDB(q, "tv"),
        ]);
        setSearchResults([
          ...animeList.slice(0, 8),
          ...movieDb.slice(0, 6),
          ...tvDb.slice(0, 6),
        ]);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [q, hasQuery]);

  const filteredActions = defaultActions.filter((a) =>
    matchesQuery(a.title, a.keywords, q)
  );

  const filteredSettings = settingsCommands.filter((s) =>
    matchesQuery(s.title, [...s.keywords, s.subtitle], q)
  );

  // Empty: actions only. Query: settings matches + media grid
  const listItems: NavigableItem[] = useMemo(() => {
    if (!hasQuery) {
      return filteredActions;
    }
    const settingsHits: NavigableItem[] = filteredSettings.map((s) => s);
    const mediaHits: NavigableItem[] = searchResults.map((item) => ({
      type: "media" as const,
      id: item.id,
      item,
    }));
    return [...settingsHits, ...mediaHits];
  }, [hasQuery, filteredActions, filteredSettings, searchResults]);

  const settingsCount = hasQuery ? filteredSettings.length : 0;
  const mediaStartIndex = settingsCount;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      const count = Math.max(listItems.length, 1);

      if (e.key === "ArrowDown" || (e.key === "ArrowRight" && hasQuery && selectedIndex >= mediaStartIndex)) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % count);
      } else if (e.key === "ArrowUp" || (e.key === "ArrowLeft" && hasQuery && selectedIndex >= mediaStartIndex)) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + count) % count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = listItems[selectedIndex];
        if (!selected) return;
        if (selected.type === "action") selected.action();
        else if (selected.type === "settings") openSettings(selected.sectionId);
        else if (selected.type === "media") {
          StorageService.addRecentSearch(selected.item.title);
          onSelectMedia(selected.item);
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    listItems,
    selectedIndex,
    hasQuery,
    mediaStartIndex,
    onClose,
    onSelectMedia,
  ]);

  // Keep selection in range when results change
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(listItems.length - 1, 0)));
  }, [listItems.length]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cp-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <motion.div
            className="cp-panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="cp-search">
              <Search size={16} className="cp-search-icon" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search titles or settings…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                className="cp-input"
              />
              <kbd className="cp-esc">esc</kbd>
            </div>

            {!hasQuery && (
              <>
                {recentSearches.length > 0 && (
                  <div className="cp-recent-searches">
                    <div className="cp-recent-header">
                      <span className="cp-recent-title flex items-center gap-1.5 text-xs text-zinc-400">
                        <Clock size={12} />
                        Recent Searches
                      </span>
                      <button
                        type="button"
                        className="cp-recent-clear-btn"
                        onClick={() => {
                          StorageService.clearRecentSearches();
                          setRecentSearches([]);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="cp-recent-chips">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          type="button"
                          className="cp-recent-chip"
                          onClick={() => {
                            setQuery(term);
                            StorageService.addRecentSearch(term);
                          }}
                        >
                          <span>{term}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <motion.div
                  className="cp-actions"
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.03 } },
                  }}
                >
                  {filteredActions.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        className={`cp-action ${idx === selectedIndex ? "is-selected" : ""}`}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          show: { opacity: 1, y: 0 },
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Icon size={15} />
                        <span>{item.title}</span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </>
            )}

            {hasQuery && (
              <div className="cp-body">
                {filteredSettings.length > 0 && (
                  <div className="cp-settings-list">
                    <p className="cp-group-label">Settings</p>
                    {filteredSettings.map((item, idx) => {
                      const Icon = item.icon;
                      const isSelected = idx === selectedIndex;
                      return (
                        <motion.button
                          key={item.id}
                          type="button"
                          className={`cp-settings-row ${isSelected ? "is-selected" : ""}`}
                          onClick={() => openSettings(item.sectionId)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          whileHover={{ x: 2 }}
                        >
                          <span className="cp-settings-icon">
                            <Icon size={15} />
                          </span>
                          <span className="cp-settings-text">
                            <span className="cp-settings-title">{item.title}</span>
                            <span className="cp-settings-sub">{item.subtitle}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {isSearching && <div className="cp-status">Searching…</div>}

                {!isSearching && searchResults.length === 0 && filteredSettings.length === 0 && (
                  <div className="cp-status">No results</div>
                )}

                {searchResults.length > 0 && (
                  <>
                    <p className="cp-group-label">Titles</p>
                    <div className="cp-grid">
                      {searchResults.map((item, idx) => {
                        const season = parseSeasonLabel(item.title, item.seasonsCount);
                        const name = cleanDisplayTitle(item.title);
                        const navIdx = mediaStartIndex + idx;
                        const isSelected = navIdx === selectedIndex;
                        return (
                          <motion.button
                            key={item.id}
                            type="button"
                            className={`cp-card ${isSelected ? "is-selected" : ""}`}
                            onClick={() => {
                              StorageService.addRecentSearch(item.title);
                              onSelectMedia(item);
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(navIdx)}
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(idx, 12) * 0.025, type: "spring", stiffness: 380, damping: 28 }}
                            whileHover={{ y: -4, scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="cp-card-poster">
                              <MediaImage
                                src={item.coverImage}
                                alt=""
                                emptyLabel="No thumb"
                              />
                            </div>
                            <div className="cp-card-meta">
                              <span className="cp-card-title" title={item.title}>{name}</span>
                              <span className="cp-card-sub">
                                {[
                                  season,
                                  item.year,
                                  item.mediaType === "anime"
                                    ? "Anime"
                                    : item.mediaType === "movie"
                                    ? "Movie"
                                    : "Series",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
