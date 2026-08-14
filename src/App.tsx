import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ViewMode, MediaItem, Episode, StreamProgress, UserProfile, AppSettings, Collection, DownloadTask, LocalMediaItem, TorrentResult, MediaType, TorrentFileItem, StreamInfo, ScanLibraryResult } from "./types";
import { StorageService } from "./services/storage";
import { AniListService } from "./services/anilist";
import { TMDBService } from "./services/tmdb";
import { invokeTauri } from "./services/tauri";
import { selectBestTorrent } from "./services/torrentRank";
import { applyAccentColor } from "./utils/theme";
import {
  buildSearchInvokeArgs,
  findRememberedTorrent,
  isValidMagnet,
  rememberSuccessfulStream,
  rememberedToTorrent,
  resolvePlayEpisode,
  toResumeTorrent,
} from "./services/playback";

import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { VideoPlayer } from "./components/VideoPlayer";
import { ContextMenu, ContextMenuState } from "./components/ContextMenu";
import { CommandPalette } from "./components/CommandPalette";
import { HomeView } from "./views/HomeView";

// Code-split secondary views & heavy modals
const AnimeView = lazy(() => import("./views/AnimeView").then((m) => ({ default: m.AnimeView })));
const MoviesView = lazy(() => import("./views/MoviesView").then((m) => ({ default: m.MoviesView })));
const TvView = lazy(() => import("./views/TvView").then((m) => ({ default: m.TvView })));
const LibraryView = lazy(() => import("./views/LibraryView").then((m) => ({ default: m.LibraryView })));
const SearchView = lazy(() => import("./views/SearchView").then((m) => ({ default: m.SearchView })));
const CollectionsView = lazy(() => import("./views/CollectionsView").then((m) => ({ default: m.CollectionsView })));
const StatsView = lazy(() => import("./views/StatsView").then((m) => ({ default: m.StatsView })));
const SettingsView = lazy(() => import("./views/SettingsView").then((m) => ({ default: m.SettingsView })));
const MediaDetailView = lazy(() => import("./views/MediaDetailView").then((m) => ({ default: m.MediaDetailView })));
const DownloadPanel = lazy(() => import("./components/DownloadPanel").then((m) => ({ default: m.DownloadPanel })));
const TorrentPickerModal = lazy(() => import("./components/TorrentPickerModal").then((m) => ({ default: m.TorrentPickerModal })));
const AniListModal = lazy(() => import("./components/AniListModal").then((m) => ({ default: m.AniListModal })));
const OnboardingModal = lazy(() => import("./components/OnboardingModal").then((m) => ({ default: m.OnboardingModal })));

import { useGamepadNav } from "./utils/useGamepadNav";

import "./App.css";

function ViewLoader() {
  return (
    <div className="view-container animate-pulse p-6">
      <div className="h-10 w-48 bg-zinc-800/60 rounded-lg mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-zinc-800/40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const BROWSE_VIEWS: ViewMode[] = ["home", "anime", "movies", "tv", "library", "search", "collections", "stats", "downloads", "settings"];

function MainApp() {
  const [currentView, setCurrentView] = useState<ViewMode>("home");
  const [, setViewHistory] = useState<ViewMode[]>(["home"]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [mediaEpisodes, setMediaEpisodes] = useState<Episode[]>([]);
  const [, setCatalogQuery] = useState("");
  const [catalogType, setCatalogType] = useState<MediaType | null>(null);
  const [catalogFiltered, setCatalogFiltered] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [collectionPicker, setCollectionPicker] = useState<{ mediaId: string } | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const mediaLoadGenRef = useRef(0);
  const streamGenRef = useRef(0);

  const [profile, setProfile] = useState<UserProfile>(() => StorageService.getProfile());
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());
  const [watchProgress, setWatchProgress] = useState<StreamProgress[]>(() => StorageService.getWatchProgress());

  // Theme accent (customizable purple / other)
  useEffect(() => {
    applyAccentColor(settings.accentColor || "#a855f7");
  }, [settings.accentColor]);
  const [favorites, setFavorites] = useState<string[]>(() => StorageService.getFavorites());
  const [watchlist, setWatchlist] = useState<string[]>(() => StorageService.getWatchlist());
  const [collections, setCollections] = useState<Collection[]>(() => StorageService.getCollections());
  const [localLibrary, setLocalLibrary] = useState<LocalMediaItem[]>(() => StorageService.getLibrary());
  const [isScanning, setIsScanning] = useState(false);

  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Command Palette & Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const [showAniListModal, setShowAniListModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem("stream_onboarding_completed");
  });

  const handleAuthenticateAniListToken = useCallback(async (cleanToken: string) => {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: `query { Viewer { id name avatar { large } bannerImage } }`,
        }),
      });

      if (!res.ok) return;
      const json = await res.json();
      const viewer = json.data?.Viewer;

      if (viewer) {
        const updated: UserProfile = {
          ...profile,
          name: viewer.name || profile.name,
          avatar: viewer.avatar?.large || profile.avatar,
          anilistToken: cleanToken,
          anilistUser: {
            id: viewer.id,
            name: viewer.name,
            avatar: viewer.avatar?.large,
            bannerImage: viewer.bannerImage,
          },
        };
        StorageService.saveProfile(updated);
        setProfile(updated);
        setShowAniListModal(false);
      }
    } catch (e) {
      console.warn("AniList deep link authentication failed", e);
    }
  }, [profile]);

  // Deep Link Listener for stream:// custom protocol
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function initDeepLink() {
      const isTauriEnv = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
      if (!isTauriEnv) return;
      try {
        const modName = "@tauri-apps/plugin-deep-link";
        const plugin = await import(/* @vite-ignore */ modName);
        if ("onOpenUrl" in plugin) {
          unlisten = await (plugin as any).onOpenUrl((urls: string[]) => {
            for (const url of urls) {
              if (url.includes("access_token=")) {
                const match = url.match(/access_token=([^&]+)/);
                if (match && match[1]) {
                  const token = decodeURIComponent(match[1]);
                  handleAuthenticateAniListToken(token);
                }
              }
            }
          });
        }
      } catch {
        // Silently handle web mode fallback
      }
    }
    initDeepLink();
    return () => {
      if (unlisten) unlisten();
    };
  }, [handleAuthenticateAniListToken]);

  const [torrentModal, setTorrentModal] = useState<{
    isOpen: boolean;
    type: "stream" | "download";
    title: string;
    media?: MediaItem;
    ep?: Episode;
    selectedTorrent?: TorrentResult;
    multiFiles?: TorrentFileItem[];
  }>({ isOpen: false, type: "stream", title: "" });

  const [torrentResults, setTorrentResults] = useState<TorrentResult[]>([]);
  const [isFetchingTorrents, setIsFetchingTorrents] = useState(false);

  const [videoPlayer, setVideoPlayer] = useState<{
    isOpen: boolean;
    media: MediaItem | null;
    episode?: Episode;
    streamUrl: string;
    taskId?: string;
    magnetUrl?: string;
    torrentTitle?: string;
    fileIndex?: number;
    startAt?: number;
    error?: string;
    statusLabel?: string;
  }>({ isOpen: false, media: null, streamUrl: "" });

  const {
    data: trendingAnime = [],
    isError: animeError,
    error: animeErrorObj,
    isLoading: animeLoading,
  } = useQuery({
    queryKey: ["trendingAnime"],
    queryFn: () => AniListService.fetchTrending(1, 36),
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  const {
    data: trendingMovies = [],
    isError: moviesError,
    error: moviesErrorObj,
    isLoading: moviesLoading,
  } = useQuery({
    queryKey: ["trendingMovies"],
    queryFn: () => TMDBService.fetchTrendingMovies(),
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  const {
    data: trendingTv = [],
    isError: tvError,
    error: tvErrorObj,
    isLoading: tvLoading,
  } = useQuery({
    queryKey: ["trendingTv"],
    queryFn: () => TMDBService.fetchTrendingTV(),
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  const needsDownloadPoll =
    currentView === "downloads" ||
    videoPlayer.isOpen ||
    Boolean(videoPlayer.taskId);

  const { data: downloadTasks = [] } = useQuery({
    queryKey: ["downloadTasks"],
    queryFn: () => invokeTauri<DownloadTask[]>("get_download_queue_cmd"),
    // Poll fast only when the queue or player needs live progress
    refetchInterval: (query) => {
      const tasks = query.state.data as DownloadTask[] | undefined;
      const hasActive = tasks?.some(
        (t) => t.status === "Downloading" || t.status === "Streaming" || t.status === "Queued"
      );
      if (needsDownloadPoll || hasActive) return 1500;
      return 12_000;
    },
  });

  const spotlightMedia = trendingAnime[0] || trendingMovies[0] || null;

  const activeDownloadTasks = downloadTasks.filter((t) => t.status === "Downloading" || t.status === "Streaming");
  const activeDownloads = activeDownloadTasks.length;
  const overallProgress = activeDownloads > 0
    ? Math.round(activeDownloadTasks.reduce((acc, t) => acc + t.progress, 0) / activeDownloads)
    : 0;

  const navigateTo = useCallback((view: ViewMode) => {
    setCurrentView((prev) => {
      if (view !== prev && BROWSE_VIEWS.includes(prev)) {
        setViewHistory((h) => [...h.slice(-20), prev]);
      }
      return view;
    });
    if (view !== "media-detail") {
      setSelectedMedia(null);
      setMediaEpisodes([]);
    }
    if (view !== "collections") setActiveCollectionId(null);
  }, []);

  const goBack = useCallback(() => {
    setViewHistory((h) => {
      const next = [...h];
      const prev = next.pop() || "home";
      setCurrentView(prev);
      if (prev !== "media-detail") {
        setSelectedMedia(null);
        setMediaEpisodes([]);
      }
      return next.length ? next : ["home"];
    });
  }, []);

  useEffect(() => {
    void invokeTauri("configure_engine_cmd", {
      max_concurrent: settings.maxConcurrentDownloads || 3,
      speed_limit_mbps: settings.speedLimitMBps || 0,
    }).catch(() => undefined);
  }, [settings.maxConcurrentDownloads, settings.speedLimitMBps]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "f")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        navigateTo("downloads");
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        navigateTo("settings");
      } else if (e.key === "Escape") {
        if (videoPlayer.isOpen) {
          return;
        }
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
        } else if (contextMenu.isOpen) {
          setContextMenu((prev) => ({ ...prev, isOpen: false }));
        } else if (collectionPicker) {
          setCollectionPicker(null);
        } else if (torrentModal.isOpen) {
          setTorrentModal((prev) => ({ ...prev, isOpen: false }));
        } else if (showAniListModal) {
          setShowAniListModal(false);
        } else if (currentView === "media-detail") {
          goBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, contextMenu.isOpen, torrentModal.isOpen, showAniListModal, currentView, videoPlayer.isOpen, collectionPicker, navigateTo, goBack]);

  const browseViews: ViewMode[] = useMemo(
    () => ["home", "anime", "movies", "tv", "library", "search", "collections", "stats"],
    []
  );

  useGamepadNav({
    enabled: true,
    onBack: () => {
      if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
      else if (contextMenu.isOpen) setContextMenu((prev) => ({ ...prev, isOpen: false }));
      else if (collectionPicker) setCollectionPicker(null);
      else if (torrentModal.isOpen) setTorrentModal((prev) => ({ ...prev, isOpen: false }));
      else if (showAniListModal) setShowAniListModal(false);
      else if (currentView === "media-detail") goBack();
    },
    onOpenSearch: () => setIsCommandPaletteOpen(true),
    onPrevTab: () => {
      const idx = browseViews.indexOf(currentView);
      if (idx > 0) navigateTo(browseViews[idx - 1]);
    },
    onNextTab: () => {
      const idx = browseViews.indexOf(currentView);
      if (idx >= 0 && idx < browseViews.length - 1) navigateTo(browseViews[idx + 1]);
    },
  });

  const loadEpisodesForMedia = useCallback(async (media: MediaItem, gen: number) => {
    try {
      if (media.mediaType === "anime" && media.anilistId) {
        const detail = await AniListService.getAnimeDetail(media.anilistId);
        if (mediaLoadGenRef.current !== gen) return [];
        setSelectedMedia((prev) => (prev?.id === media.id ? { ...prev, ...detail.media } : prev));
        setMediaEpisodes(detail.episodes);
        return detail.episodes;
      }
      if (media.tmdbId) {
        const detail = await TMDBService.getMediaDetail(media.tmdbId, media.mediaType);
        if (mediaLoadGenRef.current !== gen) return [];
        setSelectedMedia((prev) => (prev?.id === media.id ? { ...prev, ...detail.media } : prev));
        setMediaEpisodes(detail.episodes);
        return detail.episodes;
      }
      const fallback: Episode[] = [
        {
          id: `ep_default_${media.id}`,
          episodeNumber: 1,
          seasonNumber: 1,
          title: media.title,
          synopsis: media.synopsis,
          thumbnail: media.coverImage,
          durationMinutes: 24,
        },
      ];
      if (mediaLoadGenRef.current === gen) setMediaEpisodes(fallback);
      return fallback;
    } catch (err) {
      if (mediaLoadGenRef.current !== gen) return [];
      setCatalogError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }, []);

  const handleSelectMedia = useCallback(async (media: MediaItem) => {
    StorageService.cacheMedia(media);
    const gen = ++mediaLoadGenRef.current;
    setSelectedMedia(media);
    setMediaEpisodes([]);
    setCatalogError(null);
    setCurrentView((prev) => {
      if (prev !== "media-detail" && BROWSE_VIEWS.includes(prev)) {
        setViewHistory((h) => [...h.slice(-20), prev]);
      }
      return "media-detail";
    });
    await loadEpisodesForMedia(media, gen);
  }, [loadEpisodesForMedia]);

  const isStartingStreamRef = useRef(false);

  const startStreamWithFile = useCallback(async (
    torrent: TorrentResult,
    fileIdx?: number,
    overrides?: { media?: MediaItem; ep?: Episode; title?: string; startAt?: number; fromMemory?: boolean }
  ) => {
    const media = overrides?.media || torrentModal.media;
    const ep = overrides?.ep !== undefined ? overrides.ep : torrentModal.ep;
    const startAt = overrides?.startAt ?? 0;
    const gen = streamGenRef.current;
    if (!media) return false;
    if (!isValidMagnet(torrent.magnet_url)) {
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
        error: "That release has no valid magnet link.",
      });
      return false;
    }

    const title =
      overrides?.title ||
      (ep ? `${media.title} Ep ${ep.episodeNumber}` : torrentModal.title || torrent.title);

    setTorrentModal((prev) => ({ ...prev, isOpen: false }));
    setVideoPlayer({
      isOpen: true,
      media,
      episode: ep,
      streamUrl: "",
      magnetUrl: torrent.magnet_url,
      torrentTitle: torrent.title,
      fileIndex: fileIdx,
      startAt,
      statusLabel: overrides?.fromMemory
        ? (startAt > 5
          ? `Reusing last torrent… will resume at ${Math.floor(startAt / 60)}m`
          : "Reusing the last working torrent…")
        : (startAt > 5
          ? `Connecting to swarm… will resume at ${Math.floor(startAt / 60)}m`
          : "Connecting to swarm and waiting until the file can stream…"),
    });

    try {
      const streamInfo = await invokeTauri<StreamInfo>("start_torrent_stream_cmd", {
        title,
        media_type: media.mediaType,
        magnet_link: torrent.magnet_url,
        file_index: fileIdx,
        save_path: settings.downloadPath,
        season: ep?.seasonNumber,
        episode: ep?.episodeNumber,
      });
      if (streamGenRef.current !== gen) return false;

      if (streamInfo.needs_file_pick) {
        setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
        setTorrentModal({
          isOpen: true,
          type: "stream",
          title,
          media,
          ep,
          selectedTorrent: torrent,
          multiFiles: streamInfo.files,
        });
        return true;
      }

      rememberSuccessfulStream(media, ep, torrent.magnet_url, torrent.title, streamInfo);
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: streamInfo.stream_url,
        taskId: streamInfo.task_id,
        magnetUrl: torrent.magnet_url,
        torrentTitle: torrent.title,
        fileIndex: streamInfo.selected_file_index,
        startAt,
        statusLabel: "Launching player…",
      });
      return true;
    } catch (e) {
      if (streamGenRef.current !== gen) return false;
      if (overrides?.fromMemory) {
        StorageService.forgetTorrentMemory(media.id, torrent.magnet_url);
      }
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
        error: `Could not start torrent stream: ${e}`,
      });
      return false;
    }
  }, [settings.downloadPath, torrentModal.ep, torrentModal.media, torrentModal.title]);

  const handleOpenTorrentModal = async (type: "stream" | "download", ep?: Episode, targetMedia?: MediaItem) => {
    const media = targetMedia || selectedMedia;
    if (!media) return;
    if (isStartingStreamRef.current) return;
    isStartingStreamRef.current = true;
    const gen = ++streamGenRef.current;
    StorageService.cacheMedia(media);
    const playEpisode = type === "stream" ? resolvePlayEpisode(media, ep, watchProgress) : ep;
    const resumePoint = playEpisode
      ? watchProgress.find(
          (p) => p.mediaId === media.id && p.episodeNumber === playEpisode.episodeNumber && p.percentage < 90
        )
      : undefined;
    const startAt = resumePoint && resumePoint.currentTime > 5 ? resumePoint.currentTime : 0;
    const useEasyWatch = type === "stream" && (settings.easyWatch ?? true);
    const remembered = type === "stream" ? findRememberedTorrent(media, playEpisode) : null;

    if (remembered) {
      setVideoPlayer({
        isOpen: true,
        media,
        episode: playEpisode,
        streamUrl: "",
        startAt,
        magnetUrl: remembered.magnetUrl,
        torrentTitle: remembered.torrentTitle,
        statusLabel: "Reusing the last working torrent…",
      });
      const reused = await startStreamWithFile(
        rememberedToTorrent(remembered),
        remembered.isPack ? undefined : remembered.fileIndex,
        {
          media,
          ep: playEpisode,
          title: playEpisode ? `${media.title} Ep ${playEpisode.episodeNumber}` : media.title,
          startAt,
          fromMemory: true,
        }
      );
      if (reused) {
        isStartingStreamRef.current = false;
        return;
      }
    }

    setTorrentModal({
      isOpen: !useEasyWatch,
      type,
      title: media.title,
      media,
      ep: playEpisode,
      multiFiles: undefined,
    });

    if (useEasyWatch) {
      setVideoPlayer({
        isOpen: true,
        media,
        episode: playEpisode,
        streamUrl: "",
        startAt,
        statusLabel: startAt > 5
          ? `Searching indexers… will resume at ${Math.floor(startAt / 60)}m`
          : "Searching Nyaa, SeaDex, Torrentio, and other indexers…",
      });
    }

    setIsFetchingTorrents(true);
    try {
      const results = await invokeTauri<TorrentResult[]>(
        "search_torrents_cmd",
        buildSearchInvokeArgs(media, playEpisode, settings)
      );
      if (streamGenRef.current !== gen) return;
      const usable = results.filter((t) => isValidMagnet(t.magnet_url));
      setTorrentResults(usable);

      if (useEasyWatch) {
        const best = selectBestTorrent(
          usable,
          settings.preferredQuality || "1080p",
          settings.minSeeders ?? 1,
          playEpisode?.episodeNumber
        );
        if (best) {
          setTorrentModal((prev) => ({
            ...prev,
            isOpen: false,
            selectedTorrent: best,
            media,
            ep: playEpisode,
          }));
          await startStreamWithFile(best, resumePoint?.fileIndex, {
            media,
            ep: playEpisode,
            title: playEpisode ? `${media.title} Ep ${playEpisode.episodeNumber}` : media.title,
            startAt,
          });
          return;
        }
        setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
        setTorrentModal({
          isOpen: true,
          type,
          title: media.title,
          media,
          ep: playEpisode,
          multiFiles: undefined,
        });
      }
    } catch (err) {
      if (streamGenRef.current !== gen) return;
      setTorrentResults([]);
      if (useEasyWatch) {
        setVideoPlayer({
          isOpen: true,
          media,
          episode: playEpisode,
          streamUrl: "",
          error: `Could not find streams: ${err}`,
        });
      }
    } finally {
      if (streamGenRef.current === gen) setIsFetchingTorrents(false);
      isStartingStreamRef.current = false;
    }
  };

  const handleSelectStreamTorrent = async (torrent: TorrentResult) => {
    if (isStartingStreamRef.current) return;
    isStartingStreamRef.current = true;
    try {
      await startStreamWithFile(torrent);
    } finally {
      isStartingStreamRef.current = false;
    }
  };


  const handleSelectDownloadTorrent = async (torrent: TorrentResult) => {
    setTorrentModal((prev) => ({ ...prev, isOpen: false }));
    await invokeTauri("start_download_cmd", {
      title: torrent.title,
      media_type: torrent.media_type,
      magnet_link: torrent.magnet_url,
      save_path: settings.downloadPath,
      seeders: torrent.seeders,
      peers: torrent.leechers,
    });
    navigateTo("downloads");
  };

  const handlePlayMediaDirectly = (media: MediaItem) => {
    setSelectedMedia(media);
    handleOpenTorrentModal("stream", undefined, media);
  };

  const handleToggleFavorite = (id: string) => {
    const cached = StorageService.getMediaCache()[id];
    if (cached) StorageService.cacheMedia(cached);
    StorageService.toggleFavorite(id);
    setFavorites(StorageService.getFavorites());
  };

  const handleToggleWatchlist = (id: string) => {
    const cached = StorageService.getMediaCache()[id];
    if (cached) StorageService.cacheMedia(cached);
    StorageService.toggleWatchlist(id);
    setWatchlist(StorageService.getWatchlist());
  };

  const handleMarkWatched = async (media: MediaItem, ep?: Episode, markAsWatched = true) => {
    if (ep) {
      if (markAsWatched) {
        const progressObj: StreamProgress = {
          mediaId: media.id,
          mediaTitle: media.title,
          mediaType: media.mediaType,
          coverImage: media.coverImage,
          episodeNumber: ep.episodeNumber,
          currentTime: 1440,
          duration: 1440,
          percentage: 100,
          completed: true,
          lastUpdated: Date.now(),
          anilistId: media.anilistId,
        };
        StorageService.saveWatchProgress(progressObj);
      } else {
        StorageService.removeWatchProgress(media.id, ep.episodeNumber);
      }
      setWatchProgress(StorageService.getWatchProgress());

      if (media.anilistId && profile.anilistToken) {
        if (markAsWatched) {
          const isFinished = media.episodesCount ? ep.episodeNumber >= media.episodesCount : false;
          await AniListService.updateAniListProgress({
            anilistId: media.anilistId,
            episodeNumber: ep.episodeNumber,
            status: isFinished ? "COMPLETED" : "CURRENT",
          });
        } else {
          await AniListService.updateAniListProgress({
            anilistId: media.anilistId,
            episodeNumber: Math.max(0, ep.episodeNumber - 1),
            status: ep.episodeNumber <= 1 ? "PLANNING" : "CURRENT",
          });
        }
      }
    } else {
      if (markAsWatched) {
        const epCount =
          media.episodesCount ||
          (selectedMedia?.id === media.id && mediaEpisodes.length > 0 ? mediaEpisodes.length : 0) ||
          (media.mediaType === "movie" ? 1 : 12);
        StorageService.markSeriesWatched(media, epCount);
        setWatchProgress(StorageService.getWatchProgress());

        if (media.anilistId && profile.anilistToken) {
          await AniListService.updateAniListProgress({
            anilistId: media.anilistId,
            episodeNumber: epCount,
            status: "COMPLETED",
          });
        }
      } else {
        StorageService.removeSeriesProgress(media.id);
        setWatchProgress(StorageService.getWatchProgress());

        if (media.anilistId && profile.anilistToken) {
          await AniListService.updateAniListProgress({
            anilistId: media.anilistId,
            episodeNumber: 0,
            status: "PLANNING",
          });
        }
      }
    }
  };

  const handleOpenContextMenu = (
    e: React.MouseEvent,
    media: MediaItem,
    ep?: Episode,
    opts?: { fromContinue?: boolean; progress?: StreamProgress }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const epNum = ep?.episodeNumber ?? opts?.progress?.episodeNumber ?? 1;
    const existingProgress =
      opts?.progress ||
      watchProgress.find((p) => p.mediaId === media.id && p.episodeNumber === epNum);
    const isWatched = existingProgress ? existingProgress.percentage >= 90 : false;

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      media,
      episode: ep || (opts?.progress
        ? {
            id: `ep_ctx_${media.id}_${epNum}`,
            episodeNumber: epNum,
            title: `Episode ${epNum}`,
          }
        : undefined),
      isWatched,
      isFavorite: favorites.includes(media.id),
      isInWatchlist: watchlist.includes(media.id),
      fromContinue: opts?.fromContinue,
      progress: existingProgress,
    });
  };

  const [continueDismissed, setContinueDismissed] = useState<string[]>(() =>
    StorageService.getContinueDismissed()
  );

  const handleRemoveFromContinue = (media: MediaItem, progress?: StreamProgress) => {
    StorageService.dismissFromContinue(media.id);
    if (media.anilistId) {
      StorageService.dismissFromContinue(String(media.anilistId));
      StorageService.dismissFromContinue(`ani_${media.anilistId}`);
    }
    if (media.id.startsWith("ani_")) {
      StorageService.dismissFromContinue(media.id.replace("ani_", ""));
    }
    if (progress) {
      StorageService.removeWatchProgress(progress.mediaId, progress.episodeNumber);
      StorageService.removeSeriesProgress(progress.mediaId);
    } else {
      StorageService.removeSeriesProgress(media.id);
    }
    setContinueDismissed(StorageService.getContinueDismissed());
    setWatchProgress(StorageService.getWatchProgress());
  };

  const handleScanFolder = async (mediaType: MediaType, customPath?: string) => {
    setIsScanning(true);
    setLibraryError(null);
    const pathMap = {
      anime: settings.animeFolder,
      movie: settings.moviesFolder,
      tv: settings.tvFolder,
    };
    const targetPath = customPath || pathMap[mediaType];
    try {
      const result = await invokeTauri<ScanLibraryResult>("scan_library", {
        path: targetPath,
        media_type: mediaType,
      });
      const items = Array.isArray(result) ? result : result.items || [];
      const error = Array.isArray(result) ? null : result.error;
      setLocalLibrary((prev) => {
        const next = [...prev.filter((i) => i.media_type !== mediaType), ...items];
        StorageService.saveLibrary(next);
        return next;
      });
      if (error) setLibraryError(error);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleGlobalSearch = async (
    query: string,
    type: MediaType = "anime",
    genre?: string,
    year?: number,
    sort?: string
  ) => {
    setIsSearching(true);
    setCatalogQuery(query);
    setCatalogType(type);
    const hasActiveFilters = Boolean(
      query.trim() ||
      (genre && genre !== "All") ||
      year ||
      (sort && sort !== "trending" && sort !== "TRENDING_DESC")
    );
    setCatalogFiltered(hasActiveFilters);
    setCatalogError(null);
    try {
      if (type === "anime") {
        if (query.trim()) {
          const results = await AniListService.searchAnime({
            query: query.trim(),
            genre: genre && genre !== "All" ? genre : undefined,
            year,
            sort: sort ? [sort] : ["POPULARITY_DESC"],
          });
          setSearchResults(results);
        } else if (sort || (genre && genre !== "All")) {
          const results = await AniListService.fetchAnimeBySort(
            (sort as any) || "TRENDING_DESC",
            genre
          );
          setSearchResults(results);
        } else {
          setSearchResults(trendingAnime);
        }
      } else if (type === "movie") {
        if (query.trim()) {
          const results = await TMDBService.searchTMDB(query.trim(), "movie", {
            genre: genre && genre !== "All" ? genre : undefined,
            year,
          });
          setSearchResults(results);
        } else if (sort || (genre && genre !== "All")) {
          const results = await TMDBService.fetchMoviesBySort(
            (sort as any) || "trending",
            genre
          );
          setSearchResults(results);
        } else {
          setSearchResults(trendingMovies);
        }
      } else {
        if (query.trim()) {
          const results = await TMDBService.searchTMDB(query.trim(), "tv", {
            genre: genre && genre !== "All" ? genre : undefined,
            year,
          });
          setSearchResults(results);
        } else if (sort || (genre && genre !== "All")) {
          const results = await TMDBService.fetchTVBySort(
            (sort as any) || "trending",
            genre
          );
          setSearchResults(results);
        } else {
          setSearchResults(trendingTv);
        }
      }
    } catch (err) {
      setSearchResults([]);
      setCatalogError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const persistCollections = (updated: Collection[]) => {
    setCollections(updated);
    StorageService.saveCollections(updated);
  };

  const handlePauseDownload = async (id: string) => {
    await invokeTauri("pause_download_cmd", { id });
  };
  const handleResumeDownload = async (id: string) => {
    await invokeTauri("resume_download_cmd", { id });
  };
  const handleCancelDownload = async (id: string) => {
    await invokeTauri("cancel_download_cmd", { id });
  };

  const getWatchedEpisodesMap = (mediaId: string) => {
    const map: Record<number, number> = {};
    watchProgress
      .filter((p) => p.mediaId === mediaId)
      .forEach((p) => {
        map[p.episodeNumber] = p.percentage;
      });
    return map;
  };

  const allMediaPool = useMemo(
    () => [...trendingAnime, ...trendingMovies, ...trendingTv],
    [trendingAnime, trendingMovies, trendingTv]
  );
  const watchlistMediaList = useMemo(
    () => StorageService.resolveMediaList(watchlist, allMediaPool),
    [watchlist, allMediaPool]
  );
  const favoriteMediaList = useMemo(
    () => StorageService.resolveMediaList(favorites, allMediaPool),
    [favorites, allMediaPool]
  );

  return (
    <div className="app-container">
      <TitleBar
        profile={profile}
        onOpenSearch={() => setIsCommandPaletteOpen(true)}
        onNavigate={navigateTo}
        currentViewTitle={currentView === "media-detail" && selectedMedia ? selectedMedia.title : currentView}
      />

      <div className="app-main-layout">
        <Sidebar
          currentView={currentView}
          onNavigate={navigateTo}
          activeDownloads={activeDownloads}
          overallProgress={overallProgress}
          onOpenAniListModal={() => setShowAniListModal(true)}
          aniListConnected={Boolean(profile.anilistUser)}
        />

        <main className="app-content-body">
          {currentView === "home" && (
            <HomeView
              spotlightMedia={spotlightMedia}
              trendingAnime={trendingAnime}
              trendingMovies={trendingMovies}
              trendingTv={trendingTv}
              continueWatching={watchProgress}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              onResumeStream={async (progress) => {
                const cached = StorageService.getMediaCache()[progress.mediaId];
                const match: MediaItem = cached ||
                  allMediaPool.find((m) => m.id === progress.mediaId) ||
                  {
                    id: progress.mediaId,
                    title: progress.mediaTitle,
                    mediaType: progress.mediaType,
                    coverImage: progress.coverImage,
                    synopsis: "",
                    genres: [],
                    anilistId: progress.anilistId,
                  };

                StorageService.cacheMedia(match);
                setSelectedMedia(match);

                const ep: Episode = {
                  id: `ep_resume_${progress.mediaId}_${progress.episodeNumber}`,
                  episodeNumber: progress.episodeNumber,
                  title: `Episode ${progress.episodeNumber}`,
                };

                const remembered = findRememberedTorrent(match, ep);
                const resumeTorrent = toResumeTorrent(progress, match)
                  || (remembered ? rememberedToTorrent(remembered) : null);
                if (resumeTorrent) {
                  await startStreamWithFile(
                    resumeTorrent,
                    remembered?.isPack ? undefined : progress.fileIndex,
                    {
                    media: match,
                    ep,
                    title: progress.torrentTitle || remembered?.torrentTitle || `${match.title} Ep ${progress.episodeNumber}`,
                    startAt: progress.percentage < 90 ? progress.currentTime : 0,
                    fromMemory: true,
                  });
                } else {
                  await handleOpenTorrentModal("stream", ep, match);
                }
              }}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onNavigateTab={(tab) => navigateTo(tab)}
              onContextMenu={handleOpenContextMenu}
              continueDismissed={continueDismissed}
            />
          )}

          <Suspense fallback={<ViewLoader />}>
            {currentView === "anime" && (
              <AnimeView
                items={catalogFiltered && catalogType === "anime" ? searchResults : trendingAnime}
                isLoading={catalogFiltered && catalogType === "anime" ? isSearching : animeLoading}
                error={catalogFiltered && catalogType === "anime" ? catalogError : animeError ? String(animeErrorObj) : null}
                onSelectMedia={handleSelectMedia}
                onPlayMedia={handlePlayMediaDirectly}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchlist={handleToggleWatchlist}
                onSearch={(q, g, s) => handleGlobalSearch(q, "anime", g, undefined, s)}
                onContextMenu={handleOpenContextMenu}
              />
            )}

            {currentView === "movies" && (
              <MoviesView
                items={catalogFiltered && catalogType === "movie" ? searchResults : trendingMovies}
                isLoading={catalogFiltered && catalogType === "movie" ? isSearching : moviesLoading}
                error={catalogFiltered && catalogType === "movie" ? catalogError : moviesError ? String(moviesErrorObj) : null}
                onSelectMedia={handleSelectMedia}
                onPlayMedia={handlePlayMediaDirectly}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchlist={handleToggleWatchlist}
                onSearch={(q, g, s) => handleGlobalSearch(q, "movie", g, undefined, s)}
                onContextMenu={handleOpenContextMenu}
              />
            )}

            {currentView === "tv" && (
              <TvView
                items={catalogFiltered && catalogType === "tv" ? searchResults : trendingTv}
                isLoading={catalogFiltered && catalogType === "tv" ? isSearching : tvLoading}
                error={catalogFiltered && catalogType === "tv" ? catalogError : tvError ? String(tvErrorObj) : null}
                onSelectMedia={handleSelectMedia}
                onPlayMedia={handlePlayMediaDirectly}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchlist={handleToggleWatchlist}
                onSearch={(q, g, s) => handleGlobalSearch(q, "tv", g, undefined, s)}
                onContextMenu={handleOpenContextMenu}
              />
            )}

            {currentView === "library" && (
              <LibraryView
                localItems={localLibrary}
                isScanning={isScanning}
                scanError={libraryError}
                onScanFolder={handleScanFolder}
                onPlayLocalItem={async (item) => {
                  setVideoPlayer({
                    isOpen: true,
                    media: {
                      id: item.id,
                      title: item.parsed_title,
                      mediaType: item.media_type,
                      coverImage: "",
                      synopsis: item.filename,
                      genres: ["Local Library"],
                    },
                    episode: {
                      id: item.id,
                      episodeNumber: item.episode || 1,
                      seasonNumber: item.season || 1,
                      title: item.parsed_title,
                    },
                    streamUrl: item.path,
                    statusLabel: "Opening local file…",
                  });
                }}
              />
            )}

            {currentView === "search" && (
              <SearchView
                searchResults={searchResults}
                trendingAnime={trendingAnime}
                trendingMovies={trendingMovies}
                trendingTv={trendingTv}
                isLoading={isSearching}
                error={catalogError}
                onSearch={handleGlobalSearch}
                onSelectMedia={handleSelectMedia}
                onPlayMedia={handlePlayMediaDirectly}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchlist={handleToggleWatchlist}
                onContextMenu={handleOpenContextMenu}
              />
            )}

            {currentView === "collections" && (
              <CollectionsView
                collections={collections}
                watchlistMedia={watchlistMediaList}
                favoriteMedia={favoriteMediaList}
                mediaPool={allMediaPool}
                activeCollectionId={activeCollectionId}
                onOpenCollection={setActiveCollectionId}
                onSelectMedia={handleSelectMedia}
                onPlayMedia={handlePlayMediaDirectly}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchlist={handleToggleWatchlist}
                onContextMenu={handleOpenContextMenu}
                onAddNewCollection={(name, description) => {
                  persistCollections([
                    ...collections,
                    {
                      id: `col_${Date.now()}`,
                      name,
                      description,
                      mediaIds: [],
                      createdAt: Date.now(),
                    },
                  ]);
                }}
                onDeleteCollection={(id) => {
                  persistCollections(collections.filter((c) => c.id !== id));
                  if (activeCollectionId === id) setActiveCollectionId(null);
                }}
                onRemoveFromCollection={(collectionId, mediaId) => {
                  persistCollections(
                    collections.map((c) =>
                      c.id === collectionId
                        ? { ...c, mediaIds: c.mediaIds.filter((id) => id !== mediaId) }
                        : c
                    )
                  );
                }}
              />
            )}

            {currentView === "stats" && (
              <StatsView
                watchHistory={watchProgress}
                onResumeStream={async (progress) => {
                  const cached = StorageService.getMediaCache()[progress.mediaId];
                  const match: MediaItem = cached || {
                    id: progress.mediaId,
                    title: progress.mediaTitle,
                    mediaType: progress.mediaType,
                    coverImage: progress.coverImage,
                    synopsis: "",
                    genres: [],
                    anilistId: progress.anilistId,
                  };
                  const ep: Episode = {
                    id: `ep_resume_${progress.mediaId}_${progress.episodeNumber}`,
                    episodeNumber: progress.episodeNumber,
                    title: `Episode ${progress.episodeNumber}`,
                  };
                  await handleOpenTorrentModal("stream", ep, match);
                }}
                onDeleteProgress={(mediaId, epNum) => {
                  StorageService.removeWatchProgress(mediaId, epNum);
                  setWatchProgress(StorageService.getWatchProgress());
                }}
                onClearHistory={() => {
                  StorageService.clearAllWatchProgress();
                  setWatchProgress([]);
                }}
              />
            )}

            {currentView === "downloads" && (
              <div className="view-container">
                <DownloadPanel
                  tasks={downloadTasks}
                  onPause={handlePauseDownload}
                  onResume={handleResumeDownload}
                  onCancel={handleCancelDownload}
                  onPlayStream={(task) => {
                    setVideoPlayer({
                      isOpen: true,
                      media: {
                        id: task.id,
                        title: task.title,
                        mediaType: task.media_type,
                        coverImage: "",
                        synopsis: task.title,
                        genres: ["Torrent Stream"],
                      },
                      streamUrl: task.stream_url || "",
                      magnetUrl: task.magnet_link,
                      torrentTitle: task.title,
                      error: task.stream_url ? undefined : "This download does not have a streamable file yet.",
                    });
                  }}
                />
              </div>
            )}

            {currentView === "settings" && (
              <SettingsView
                settings={settings}
                onSaveSettings={(updated) => {
                  setSettings(updated);
                  StorageService.saveSettings(updated);
                  void invokeTauri("configure_engine_cmd", {
                    max_concurrent: updated.maxConcurrentDownloads || 3,
                    speed_limit_mbps: updated.speedLimitMBps || 0,
                  }).catch(() => undefined);
                }}
                profile={profile}
                onSaveProfile={(updatedProfile) => {
                  setProfile(updatedProfile);
                  StorageService.saveProfile(updatedProfile);
                }}
                onOpenAniListModal={() => setShowAniListModal(true)}
              />
            )}

            {currentView === "media-detail" && selectedMedia && (
              <MediaDetailView
                media={selectedMedia}
                episodes={mediaEpisodes}
                onBack={goBack}
                onOpenTorrentModal={handleOpenTorrentModal}
                onPlayEpisode={(ep) => handleOpenTorrentModal("stream", ep)}
                isFavorite={favorites.includes(selectedMedia.id)}
                onToggleFavorite={handleToggleFavorite}
                isInWatchlist={watchlist.includes(selectedMedia.id)}
                onToggleWatchlist={handleToggleWatchlist}
                watchedEpisodes={getWatchedEpisodesMap(selectedMedia.id)}
                onContextMenu={handleOpenContextMenu}
                onSelectMedia={handleSelectMedia}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={navigateTo}
        onSelectMedia={handleSelectMedia}
      />

      {/* Global Right-Click Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onMarkWatched={handleMarkWatched}
        onPlay={(media, ep) => {
          StorageService.cacheMedia(media);
          setSelectedMedia(media);
          if (ep) {
            void handleOpenTorrentModal("stream", ep, media);
          } else {
            handlePlayMediaDirectly(media);
          }
        }}
        onDownload={(media, ep) => {
          StorageService.cacheMedia(media);
          setSelectedMedia(media);
          void handleOpenTorrentModal("download", ep, media);
        }}
        onToggleFavorite={handleToggleFavorite}
        onToggleWatchlist={handleToggleWatchlist}
        onAddToCollection={(mediaId) => {
          if (contextMenu.media) StorageService.cacheMedia(contextMenu.media);
          setCollectionPicker({ mediaId });
        }}
        onOpenDetails={(media) => {
          StorageService.cacheMedia(media);
          handleSelectMedia(media);
        }}
        onRemoveFromContinue={handleRemoveFromContinue}
      />

      <Suspense fallback={null}>
        {torrentModal.isOpen && (
          <TorrentPickerModal
            isOpen={torrentModal.isOpen}
            onClose={() => setTorrentModal((prev) => ({ ...prev, isOpen: false }))}
            title={torrentModal.title}
            torrents={torrentResults}
            isLoading={isFetchingTorrents}
            multiFiles={torrentModal.multiFiles}
            multiFileTorrentTitle={torrentModal.selectedTorrent?.title}
            onSelectStream={handleSelectStreamTorrent}
            onSelectFileStream={(fileIdx) => {
              if (torrentModal.selectedTorrent) {
                void startStreamWithFile(torrentModal.selectedTorrent, fileIdx);
              }
            }}
            onBackToTorrents={() => setTorrentModal((prev) => ({ ...prev, multiFiles: undefined }))}
            onSelectDownload={handleSelectDownloadTorrent}
          />
        )}

        {showAniListModal && (
          <AniListModal
            isOpen={showAniListModal}
            onClose={() => setShowAniListModal(false)}
            profile={profile}
            onProfileUpdated={(updated) => setProfile(updated)}
          />
        )}

        {showOnboarding && (
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={() => setShowOnboarding(false)}
            settings={settings}
            onSaveSettings={(updated) => {
              setSettings(updated);
              StorageService.saveSettings(updated);
            }}
          />
        )}
      </Suspense>

      {videoPlayer.isOpen && videoPlayer.media && (
        <VideoPlayer
          media={videoPlayer.media}
          episode={videoPlayer.episode}
          streamUrl={videoPlayer.streamUrl}
          torrentTask={downloadTasks.find((t) => t.id === videoPlayer.taskId)}
          magnetUrl={videoPlayer.magnetUrl}
          torrentTitle={videoPlayer.torrentTitle}
          fileIndex={videoPlayer.fileIndex}
          startAt={videoPlayer.startAt}
          autoPlayNext={settings.autoPlayNext}
          hardwareAcceleration={settings.hardwareAcceleration}
          defaultSubtitles={settings.defaultSubtitles}
          postWatchBehavior={settings.postWatchBehavior}
          initialError={videoPlayer.error}
          statusLabel={videoPlayer.statusLabel}
          onClose={() => {
            setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
            setWatchProgress(StorageService.getWatchProgress());
          }}
          onOpenTorrentPicker={() => {
            const media = videoPlayer.media;
            const ep = videoPlayer.episode;
            if (media) {
              setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
              void handleOpenTorrentModal("stream", ep, media);
            }
          }}
          onPrevEpisode={() => {
            const media = videoPlayer.media;
            const ep = videoPlayer.episode;
            if (!media || !ep) return;
            const prevEp =
              mediaEpisodes.find(
                (e) =>
                  (e.seasonNumber || 1) === (ep.seasonNumber || 1) &&
                  e.episodeNumber === ep.episodeNumber - 1
              ) || mediaEpisodes.find((e) => e.episodeNumber === ep.episodeNumber - 1);
            if (prevEp) void handleOpenTorrentModal("stream", prevEp, media);
          }}
          onNextEpisode={async () => {
            const media = videoPlayer.media;
            const ep = videoPlayer.episode;
            if (!media || media.mediaType === "movie") return;
            let list = mediaEpisodes;
            if (!list.length || selectedMedia?.id !== media.id) {
              const gen = ++mediaLoadGenRef.current;
              list = await loadEpisodesForMedia(media, gen);
            }
            const nextEp =
              list.find(
                (e) =>
                  (e.seasonNumber || 1) === (ep?.seasonNumber || 1) &&
                  e.episodeNumber === (ep?.episodeNumber || 0) + 1
              ) || list.find((e) => e.episodeNumber === (ep?.episodeNumber || 0) + 1);
            if (nextEp) {
              await handleOpenTorrentModal("stream", nextEp, media);
            }
          }}
        />
      )}

      {collectionPicker && (
        <div className="modal-backdrop" onClick={() => setCollectionPicker(null)}>
          <div className="modal-content col-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to collection</h3>
            </div>
            <div className="modal-body space-y-2">
              {collections.length === 0 && (
                <p className="text-xs text-zinc-400">Create a collection first from the Collections tab.</p>
              )}
              {collections.map((col) => {
                const already = col.mediaIds.includes(collectionPicker.mediaId);
                return (
                  <button
                    key={col.id}
                    type="button"
                    className="btn-secondary w-full justify-between"
                    disabled={already}
                    onClick={() => {
                      persistCollections(
                        collections.map((c) =>
                          c.id === col.id && !c.mediaIds.includes(collectionPicker.mediaId)
                            ? { ...c, mediaIds: [...c.mediaIds, collectionPicker.mediaId] }
                            : c
                        )
                      );
                      setCollectionPicker(null);
                    }}
                  >
                    <span>{col.name}</span>
                    <span className="text-xs text-zinc-500">{already ? "Added" : `${col.mediaIds.length} items`}</span>
                  </button>
                );
              })}
              <div className="flex justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setCollectionPicker(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainApp />
    </QueryClientProvider>
  );
}
