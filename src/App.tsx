import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ViewMode, MediaItem, Episode, StreamProgress, UserProfile, AppSettings, Collection, DownloadTask, LocalMediaItem, TorrentResult, MediaType, TorrentFileItem, StreamInfo, TorrentAddResult } from "./types";
import { StorageService } from "./services/storage";
import { AniListService } from "./services/anilist";
import { TMDBService } from "./services/tmdb";
import { isTauri, invokeTauri } from "./services/tauri";
import { selectBestTorrent } from "./services/torrentRank";
import { applyAccentColor } from "./utils/theme";

import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TorrentPickerModal } from "./components/TorrentPickerModal";
import { VideoPlayer } from "./components/VideoPlayer";
import { AniListModal } from "./components/AniListModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { ContextMenu, ContextMenuState } from "./components/ContextMenu";
import { CommandPalette } from "./components/CommandPalette";

import { HomeView } from "./views/HomeView";
import { AnimeView } from "./views/AnimeView";
import { MoviesView } from "./views/MoviesView";
import { TvView } from "./views/TvView";
import { LibraryView } from "./views/LibraryView";
import { SearchView } from "./views/SearchView";
import { CollectionsView } from "./views/CollectionsView";
import { StatsView } from "./views/StatsView";
import { DownloadPanel } from "./components/DownloadPanel";
import { SettingsView } from "./views/SettingsView";
import { MediaDetailView } from "./views/MediaDetailView";

import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function MainApp() {
  const [currentView, setCurrentView] = useState<ViewMode>("home");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [mediaEpisodes, setMediaEpisodes] = useState<Episode[]>([]);

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
  const [localLibrary, setLocalLibrary] = useState<LocalMediaItem[]>([]);
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
    error?: string;
  }>({ isOpen: false, media: null, streamUrl: "" });

  const { data: trendingAnime = [] } = useQuery({
    queryKey: ["trendingAnime"],
    queryFn: () => AniListService.fetchTrending(1, 36),
    staleTime: 1000 * 60 * 15,
  });

  const { data: trendingMovies = [] } = useQuery({
    queryKey: ["trendingMovies"],
    queryFn: () => TMDBService.fetchTrendingMovies(),
    staleTime: 1000 * 60 * 15,
  });

  const { data: trendingTv = [] } = useQuery({
    queryKey: ["trendingTv"],
    queryFn: () => TMDBService.fetchTrendingTV(),
    staleTime: 1000 * 60 * 15,
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

  const activeDownloads = downloadTasks.filter((t) => t.status === "Downloading" || t.status === "Streaming").length;
  const overallProgress = activeDownloads > 0
    ? Math.round(downloadTasks.reduce((acc, t) => acc + t.progress, 0) / downloadTasks.length)
    : 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setCurrentView("downloads");
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setCurrentView("settings");
      } else if (e.key === "Escape") {
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
        } else if (contextMenu.isOpen) {
          setContextMenu((prev) => ({ ...prev, isOpen: false }));
        } else if (torrentModal.isOpen) {
          setTorrentModal((prev) => ({ ...prev, isOpen: false }));
        } else if (showAniListModal) {
          setShowAniListModal(false);
        } else if (currentView === "media-detail") {
          setCurrentView("home");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, contextMenu.isOpen, torrentModal.isOpen, showAniListModal, currentView]);

  const handleSelectMedia = useCallback(async (media: MediaItem) => {
    StorageService.cacheMedia(media);
    setSelectedMedia(media);
    setCurrentView("media-detail");
    if (media.mediaType === "anime" && media.anilistId) {
      const detail = await AniListService.getAnimeDetail(media.anilistId);
      setMediaEpisodes(detail.episodes);
    } else if (media.tmdbId) {
      const detail = await TMDBService.getMediaDetail(media.tmdbId, media.mediaType);
      setMediaEpisodes(detail.episodes);
    } else {
      setMediaEpisodes([
        {
          id: `ep_default_${media.id}`,
          episodeNumber: 1,
          seasonNumber: 1,
          title: media.title,
          synopsis: media.synopsis,
          thumbnail: media.coverImage,
          durationMinutes: 24,
        },
      ]);
    }
  }, []);

  const handleOpenTorrentModal = async (type: "stream" | "download", ep?: Episode, targetMedia?: MediaItem) => {
    isStartingStreamRef.current = false;
    const media = targetMedia || selectedMedia;
    if (!media) return;
    StorageService.cacheMedia(media);
    const titleQuery = ep ? `${media.title} - ${ep.episodeNumber}` : media.title;
    const useEasyWatch = type === "stream" && (settings.easyWatch ?? true);

    // Easy Watch: keep picker closed and show player loading while we search + pick
    setTorrentModal({
      isOpen: !useEasyWatch,
      type,
      title: titleQuery,
      media,
      ep,
      multiFiles: undefined,
    });

    if (useEasyWatch) {
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
      });
    }

    setIsFetchingTorrents(true);
    try {
      const results = await invokeTauri<TorrentResult[]>("search_torrents_cmd", {
        query: titleQuery,
        media_type: media.mediaType,
        anilist_id: media.anilistId || undefined,
      });
      setTorrentResults(results);

      if (useEasyWatch) {
        const best = selectBestTorrent(
          results,
          settings.preferredQuality || "1080p",
          settings.minSeeders ?? 1
        );
        if (best) {
          // Seed modal context so stream handlers see media/ep
          setTorrentModal((prev) => ({
            ...prev,
            isOpen: false,
            type,
            title: titleQuery,
            media,
            ep,
            selectedTorrent: best,
          }));
          await handleSelectStreamTorrentEasy(best, media, ep, titleQuery);
          return;
        }
        // No viable torrent — fall back to manual picker
        setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
        setTorrentModal({
          isOpen: true,
          type,
          title: titleQuery,
          media,
          ep,
          multiFiles: undefined,
        });
      }
    } catch (err) {
      console.warn("Torrent indexer search failed gracefully:", err);
      setTorrentResults([]);
      if (useEasyWatch) {
        setVideoPlayer({
          isOpen: true,
          media,
          episode: ep,
          streamUrl: "",
          error: `Could not find streams: ${err}`,
        });
      }
    } finally {
      setIsFetchingTorrents(false);
    }
  };

  /** Easy Watch path: stream without depending on torrentModal race. */
  const handleSelectStreamTorrentEasy = async (
    torrent: TorrentResult,
    media: MediaItem,
    ep: Episode | undefined,
    titleQuery: string
  ) => {
    if (isStartingStreamRef.current) return;
    isStartingStreamRef.current = true;
    try {
      const addResult = await invokeTauri<TorrentAddResult>("add_magnet_cmd", {
        magnet_link: torrent.magnet_url,
        title: torrent.title,
        media_type: media.mediaType,
        save_path: settings.downloadPath,
      });

      const videoFiles = addResult.files.filter((f: TorrentFileItem) => f.is_video);
      if (videoFiles.length > 1) {
        // Need user to pick a file inside multi-file torrent
        setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
        setTorrentModal({
          isOpen: true,
          type: "stream",
          title: titleQuery,
          media,
          ep,
          selectedTorrent: torrent,
          multiFiles: addResult.files,
        });
        return;
      }

      const title = ep ? `${media.title} Ep ${ep.episodeNumber}` : titleQuery;
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
      });

      const streamInfo = await invokeTauri<StreamInfo>("start_torrent_stream_cmd", {
        title,
        media_type: media.mediaType,
        magnet_link: torrent.magnet_url,
        file_index: addResult.recommended_file_index,
        save_path: settings.downloadPath,
      });

      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: streamInfo.stream_url,
        taskId: streamInfo.task_id,
      });
    } catch (e) {
      console.warn("Easy Watch stream failed:", e);
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
        error: `Could not start torrent stream: ${e}`,
      });
    } finally {
      isStartingStreamRef.current = false;
    }
  };

  const startStreamWithFile = async (
    torrent: TorrentResult,
    fileIdx?: number,
    overrides?: { media?: MediaItem; ep?: Episode; title?: string }
  ) => {
    const media = overrides?.media || torrentModal.media;
    const ep = overrides?.ep !== undefined ? overrides.ep : torrentModal.ep;
    if (!media) return;

    const title =
      overrides?.title ||
      (ep ? `${media.title} Ep ${ep.episodeNumber}` : torrentModal.title || torrent.title);

    setTorrentModal((prev) => ({ ...prev, isOpen: false }));

    setVideoPlayer({
      isOpen: true,
      media,
      episode: ep,
      streamUrl: "",
    });

    try {
      const streamInfo = await invokeTauri<StreamInfo>("start_torrent_stream_cmd", {
        title,
        media_type: media.mediaType,
        magnet_link: torrent.magnet_url,
        file_index: fileIdx !== undefined ? fileIdx : undefined,
        save_path: settings.downloadPath,
      });

      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: streamInfo.stream_url,
        taskId: streamInfo.task_id,
      });
    } catch (e) {
      console.warn("Torrent stream start failed:", e);
      setVideoPlayer({
        isOpen: true,
        media,
        episode: ep,
        streamUrl: "",
        error: `Could not start torrent stream: ${e}`,
      });
    }
  };

  const isStartingStreamRef = useRef(false);

  const handleSelectStreamTorrent = async (torrent: TorrentResult) => {
    if (isStartingStreamRef.current) return;
    isStartingStreamRef.current = true;
    const media = torrentModal.media;
    if (!media) {
      isStartingStreamRef.current = false;
      return;
    }

    try {
      const addResult = await invokeTauri<TorrentAddResult>("add_magnet_cmd", {
        magnet_link: torrent.magnet_url,
        title: torrent.title,
        media_type: media.mediaType,
        save_path: settings.downloadPath,
      });

      const videoFiles = addResult.files.filter((f: TorrentFileItem) => f.is_video);
      if (videoFiles.length > 1) {
        setTorrentModal((prev) => ({
          ...prev,
          selectedTorrent: torrent,
          multiFiles: addResult.files,
        }));
        isStartingStreamRef.current = false;
        return;
      }

      await startStreamWithFile(torrent, addResult.recommended_file_index);
    } catch (e) {
      // Fall back to direct stream attempt
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
    setCurrentView("downloads");
  };

  const handlePlayMediaDirectly = (media: MediaItem) => {
    setSelectedMedia(media);
    handleOpenTorrentModal("stream", undefined, media);
  };

  const handleToggleFavorite = (id: string) => {
    StorageService.toggleFavorite(id);
    setFavorites(StorageService.getFavorites());
  };

  const handleToggleWatchlist = (id: string) => {
    StorageService.toggleWatchlist(id);
    setWatchlist(StorageService.getWatchlist());
  };

  const handleMarkWatched = async (media: MediaItem, ep?: Episode, markAsWatched = true) => {
    const epNum = ep ? ep.episodeNumber : 1;
    const progressObj: StreamProgress = {
      mediaId: media.id,
      mediaTitle: media.title,
      mediaType: media.mediaType,
      coverImage: media.coverImage,
      episodeNumber: epNum,
      currentTime: markAsWatched ? 1440 : 0,
      duration: 1440,
      percentage: markAsWatched ? 100 : 0,
      lastUpdated: Date.now(),
      anilistId: media.anilistId,
    };

    StorageService.saveWatchProgress(progressObj);
    setWatchProgress(StorageService.getWatchProgress());

    if (media.anilistId && profile.anilistToken && markAsWatched) {
      const isFinished = media.episodesCount ? epNum >= media.episodesCount : false;
      await AniListService.updateAniListProgress({
        anilistId: media.anilistId,
        episodeNumber: epNum,
        status: isFinished ? "COMPLETED" : "CURRENT",
      });
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

  const handleRemoveFromContinue = (media: MediaItem) => {
    StorageService.dismissFromContinue(media.id);
    setContinueDismissed(StorageService.getContinueDismissed());
    setWatchProgress(StorageService.getWatchProgress());
  };

  const handleScanFolder = async (mediaType: MediaType) => {
    setIsScanning(true);
    const pathMap = {
      anime: settings.animeFolder,
      movie: settings.moviesFolder,
      tv: settings.tvFolder,
    };
    try {
      const items = await invokeTauri<LocalMediaItem[]>("scan_library", {
        path: pathMap[mediaType],
        media_type: mediaType,
      });
      setLocalLibrary((prev) => [...prev.filter((i) => i.media_type !== mediaType), ...items]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleGlobalSearch = async (query: string, type: MediaType = "anime", genre?: string, year?: number) => {
    setIsSearching(true);
    try {
      if (type === "anime") {
        const results = await AniListService.searchAnime({ query, genre, year });
        setSearchResults(results);
      } else {
        const results = await TMDBService.searchTMDB(query, type);
        setSearchResults(results);
      }
    } finally {
      setIsSearching(false);
    }
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
        onNavigate={setCurrentView}
        currentViewTitle={currentView === "media-detail" && selectedMedia ? selectedMedia.title : currentView}
      />

      <div className="app-main-layout">
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => {
            if (view !== "media-detail") setSelectedMedia(null);
            setCurrentView(view);
          }}
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
                // Resolve media from pool → cache → progress payload (never fall back to spotlight)
                const cached = StorageService.getMediaCache()[progress.mediaId];
                const match: MediaItem =
                  allMediaPool.find((m) => m.id === progress.mediaId) ||
                  cached ||
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

                if (progress.magnetUrl) {
                  await startStreamWithFile(
                    {
                      id: `res_${progress.mediaId}_${progress.episodeNumber}`,
                      title: progress.torrentTitle || match.title,
                      magnet_url: progress.magnetUrl,
                      size_bytes: 0,
                      size_formatted: "",
                      seeders: 0,
                      leechers: 0,
                      quality: "",
                      source_name: "Resume",
                      date_posted: "",
                      media_type: progress.mediaType,
                    },
                    progress.fileIndex,
                    {
                      media: match,
                      ep,
                      title: progress.torrentTitle || `${match.title} Ep ${progress.episodeNumber}`,
                    }
                  );
                } else {
                  await handleOpenTorrentModal("stream", ep, match);
                }
              }}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onNavigateTab={(tab) => setCurrentView(tab)}
              onContextMenu={handleOpenContextMenu}
              continueDismissed={continueDismissed}
            />
          )}

          {currentView === "anime" && (
            <AnimeView
              items={trendingAnime}
              isLoading={false}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onSearch={(q, g) => handleGlobalSearch(q, "anime", g)}
              onContextMenu={handleOpenContextMenu}
            />
          )}

          {currentView === "movies" && (
            <MoviesView
              items={trendingMovies}
              isLoading={false}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onSearch={(q) => handleGlobalSearch(q, "movie")}
              onContextMenu={handleOpenContextMenu}
            />
          )}

          {currentView === "tv" && (
            <TvView
              items={trendingTv}
              isLoading={false}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onSearch={(q) => handleGlobalSearch(q, "tv")}
              onContextMenu={handleOpenContextMenu}
            />
          )}

          {currentView === "library" && (
            <LibraryView
              localItems={localLibrary}
              isScanning={isScanning}
              onScanFolder={handleScanFolder}
              onPlayLocalItem={async (item) => {
                // Local file playback: use Tauri's asset protocol so the built-in player
                // can load raw filesystem paths (WebView2 can't open file:// URLs).
                const src = isTauri()
                  ? (await import("@tauri-apps/api/core")).convertFileSrc(item.path)
                  : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
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
                  streamUrl: src,
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
              onSearch={handleGlobalSearch}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onContextMenu={handleOpenContextMenu}
            />
          )}

          {currentView === "collections" && (
            <CollectionsView
              collections={collections}
              watchlistMedia={watchlistMediaList}
              favoriteMedia={favoriteMediaList}
              onSelectMedia={handleSelectMedia}
              onPlayMedia={handlePlayMediaDirectly}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onAddNewCollection={(name, description) => {
                const newCol: Collection = {
                  id: `col_${Date.now()}`,
                  name,
                  description,
                  mediaIds: [],
                  createdAt: Date.now(),
                };
                const updated = [...collections, newCol];
                setCollections(updated);
                StorageService.saveCollections(updated);
              }}
            />
          )}

          {currentView === "stats" && <StatsView watchHistory={watchProgress} />}

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
                    streamUrl: task.stream_url || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
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
              onBack={() => setCurrentView("home")}
              onOpenTorrentModal={handleOpenTorrentModal}
              onPlayEpisode={(ep) => handleOpenTorrentModal("stream", ep)}
              isFavorite={favorites.includes(selectedMedia.id)}
              onToggleFavorite={handleToggleFavorite}
              isInWatchlist={watchlist.includes(selectedMedia.id)}
              onToggleWatchlist={handleToggleWatchlist}
              watchedEpisodes={getWatchedEpisodesMap(selectedMedia.id)}
              onContextMenu={handleOpenContextMenu}
            />
          )}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setCurrentView}
        onSelectMedia={handleSelectMedia}
      />

      {/* Global Right-Click Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onMarkWatched={handleMarkWatched}
        onPlay={(media, ep) => handleOpenTorrentModal("stream", ep, media)}
        onDownload={(media, ep) => handleOpenTorrentModal("download", ep, media)}
        onToggleFavorite={handleToggleFavorite}
        onToggleWatchlist={handleToggleWatchlist}
        onOpenDetails={handleSelectMedia}
        onRemoveFromContinue={handleRemoveFromContinue}
      />

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

      {videoPlayer.isOpen && videoPlayer.media && (
        <VideoPlayer
          media={videoPlayer.media}
          episode={videoPlayer.episode}
          streamUrl={videoPlayer.streamUrl}
          torrentTask={downloadTasks.find((t) => t.id === videoPlayer.taskId)}
          initialError={videoPlayer.error}
          onClose={() => {
            setVideoPlayer((prev) => ({ ...prev, isOpen: false }));
            setWatchProgress(StorageService.getWatchProgress());
          }}
          onNextEpisode={() => {
            if (videoPlayer.episode) {
              const nextNum = videoPlayer.episode.episodeNumber + 1;
              const nextEp = mediaEpisodes.find((e) => e.episodeNumber === nextNum);
              if (nextEp && videoPlayer.media) {
                handleOpenTorrentModal("stream", nextEp);
              }
            }
          }}
        />
      )}


      <AniListModal
        isOpen={showAniListModal}
        onClose={() => setShowAniListModal(false)}
        profile={profile}
        onProfileUpdated={(updated) => setProfile(updated)}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        settings={settings}
        onSaveSettings={(updated) => {
          setSettings(updated);
          StorageService.saveSettings(updated);
        }}
      />
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
