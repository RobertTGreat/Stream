import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  SkipForward,
  SkipBack,
  AlertCircle,
  Loader2,
  HardDriveDownload,
  Tv,
  ExternalLink,
  Radio,
} from "lucide-react";
import { DownloadTask, Episode, MediaItem, StreamProgress } from "../types";
import { StorageService } from "../services/storage";
import { invokeTauri } from "../services/tauri";

interface VideoPlayerProps {
  media: MediaItem;
  episode?: Episode;
  streamUrl: string;
  torrentTask?: DownloadTask | null;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  initialError?: string;
}

const OBSERVED_PROPERTIES = [
  "time-pos",
  "duration",
  "eof-reached",
];

export function VideoPlayer({
  media,
  episode,
  streamUrl,
  torrentTask,
  onClose,
  onNextEpisode,
  onPrevEpisode,
  initialError,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLaunchingRef = useRef(false);
  const eofHandledRef = useRef(false);

  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(initialError || null);
  const [mpvActive, setMpvActive] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    document.documentElement.classList.add("mpv-embed-active");
    return () => {
      isMountedRef.current = false;
      document.documentElement.classList.remove("mpv-embed-active");
      document.documentElement.classList.remove("mpv-playing");
    };
  }, []);

  useEffect(() => {
    if (initialError) {
      setPlaybackError(initialError);
      setIsBuffering(false);
    }
  }, [initialError]);

  // IPC command wrapper
  const mpvCommand = useCallback(async (command: (string | number | boolean)[]) => {
    try {
      return await invokeTauri<unknown>("mpv_command_cmd", { command });
    } catch (e) {
      console.warn("MPV command failed:", command, e);
    }
  }, []);

  const isStoppingRef = useRef(false);

  // Stop MPV
  const stopMpv = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setMpvActive(false);
    try {
      await invokeTauri("mpv_stop_cmd", {});
    } catch {
      // session gone
    }
  }, []);

  const handleClose = useCallback(() => {
    void stopMpv();
    onClose();
  }, [stopMpv, onClose]);

  // Load saved progress
  const getSavedProgress = useCallback(() => {
    return StorageService.getWatchProgress().find(
      (p) => p.mediaId === media.id && (episode ? p.episodeNumber === episode.episodeNumber : true)
    );
  }, [media.id, episode]);

  // Launch single MPV session and start property polling & process exit monitoring
  const startMpv = useCallback(async () => {
    if (!streamUrl || isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    setPlaybackError(null);
    setIsBuffering(true);

    try {
      await invokeTauri("mpv_play_cmd", {
        url: streamUrl,
        title: `${media.title}${episode ? ` - Episode ${episode.episodeNumber}` : ""}`,
      });

      if (!isMountedRef.current) return;
      setMpvActive(true);
      setIsBuffering(false);

      const saved = getSavedProgress();
      if (saved && saved.currentTime > 5) {
        void mpvCommand(["seek", saved.currentTime, "absolute"]);
      }

      // Auto-dismiss full screen overlay modal so MPV window is directly visible and active
      setTimeout(() => {
        if (isMountedRef.current) {
          onClose();
        }
      }, 800);

      // Process Exit & Property Polling Loop
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!isMountedRef.current) return;

        // Check if MPV process was closed by user
        try {
          const isRunning = await invokeTauri<boolean>("mpv_is_running_cmd", {});
          if (!isRunning && isMountedRef.current) {
            handleClose();
            return;
          }
        } catch {
          // ignore
        }

        // Poll properties for progress display
        try {
          const props = await invokeTauri<Record<string, unknown>>("mpv_get_properties_cmd", {
            names: OBSERVED_PROPERTIES,
          });
          if (!isMountedRef.current) return;

          if (typeof props["time-pos"] === "number") {
            setCurrentTime(props["time-pos"]);
            if (props["time-pos"] > 0) setIsBuffering(false);
          }
          if (typeof props["duration"] === "number" && props["duration"] > 0) {
            setDuration(props["duration"]);
            setIsBuffering(false);
          }

          if (props["eof-reached"] === true && !eofHandledRef.current) {
            eofHandledRef.current = true;
            if (onNextEpisode) onNextEpisode();
          }
        } catch {
          // silent fail poll
        }
      }, 1000);
    } catch (err) {
      console.warn("MPV launch error:", err);
      if (isMountedRef.current) {
        setMpvActive(false);
        setIsBuffering(false);
        setPlaybackError(`Could not start playback engine: ${err}`);
      }
    } finally {
      isLaunchingRef.current = false;
    }
  }, [streamUrl, media.title, episode, onNextEpisode, getSavedProgress, mpvCommand, handleClose, onClose]);

  useEffect(() => {
    if (streamUrl && !initialError) {
      void startMpv();
    }
    return () => {
      void stopMpv();
    };
  }, [streamUrl, initialError, startMpv, stopMpv]);

  // Save progress periodically
  const saveProgress = useCallback(() => {
    if (duration === 0 || !currentTime) return;
    const pct = Math.round((currentTime / duration) * 100);

    const progressObj: StreamProgress = {
      mediaId: media.id,
      mediaTitle: media.title,
      mediaType: media.mediaType,
      coverImage: media.coverImage,
      episodeNumber: episode ? episode.episodeNumber : 1,
      currentTime,
      duration,
      percentage: pct,
      lastUpdated: Date.now(),
      anilistId: media.anilistId,
      magnetUrl: torrentTask?.magnet_link,
      torrentTitle: torrentTask?.title,
      streamUrl: streamUrl,
      fileIndex: undefined,
    };

    StorageService.saveWatchProgress(progressObj);
    StorageService.cacheMedia(media);
  }, [media, episode, duration, currentTime, torrentTask, streamUrl]);

  useEffect(() => {
    const interval = setInterval(saveProgress, 5000);
    return () => clearInterval(interval);
  }, [saveProgress]);

  // Global Keyboard Shortcuts (Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const formatSpeed = (bps: number) => {
    if (bps >= 1_000_000) {
      return `${(bps / 1_000_000).toFixed(1)} MB/s`;
    }
    if (bps >= 1000) {
      return `${(bps / 1000).toFixed(0)} KB/s`;
    }
    return `${bps} B/s`;
  };

  const showBuffering = (isBuffering || !streamUrl) && !playbackError && !mpvActive;

  return (
    <div ref={containerRef} className="video-player-modal">
      {/* Blurred Cover Art Ambient Backdrop */}
      {media.coverImage && (
        <div
          className="mpv-ambient-backdrop"
          style={{ backgroundImage: `url(${media.coverImage})` }}
        />
      )}

      {/* MPV Active Sleek Ambient UI Card */}
      {mpvActive && (
        <div className="mpv-active-overlay">
          {media.coverImage && (
            <div className="mpv-card-poster-wrapper">
              <img src={media.coverImage} alt={media.title} className="mpv-card-poster" />
              <div className="mpv-card-poster-glow" />
            </div>
          )}

          <div className="mpv-status-badge">
            <Radio size={14} className="animate-pulse text-purple-400" />
            <span>MPV Player Active with On-Screen Controls</span>
          </div>

          <h3 className="mpv-card-title">{media.title}</h3>
          {episode && (
            <p className="mpv-card-subtitle">
              Episode {episode.episodeNumber}: {episode.title}
            </p>
          )}

          <p className="mpv-card-description">
            Native MPV window is running with built-in video controls. You can minimize it to your Windows Taskbar or close it to exit the stream.
          </p>

          {/* Torrent Stream Performance Stats Pill */}
          {torrentTask && (
            <div className="mpv-torrent-stats-pill">
              <div className="mpv-stat-item text-purple-400 font-bold">
                <HardDriveDownload size={16} />
                <span>{formatSpeed(torrentTask.download_speed_bps)}</span>
              </div>
              <span className="mpv-stat-divider">|</span>
              <div className="mpv-stat-item">
                <span className="font-semibold text-white">{torrentTask.peers}</span>
                <span className="text-zinc-400">Peers</span>
                <span className="text-zinc-500">({torrentTask.seeders} Seeds)</span>
              </div>
              <span className="mpv-stat-divider">|</span>
              <div className="mpv-stat-item text-emerald-400 font-bold">
                <span>{torrentTask.progress.toFixed(1)}%</span>
                <span className="text-zinc-400 font-normal">Cached</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mpv-actions-bar">
            <button type="button" onClick={startMpv} className="mpv-btn-primary">
              <ExternalLink size={16} />
              <span>Bring MPV to Front</span>
            </button>

            {onPrevEpisode && (
              <button type="button" onClick={onPrevEpisode} className="mpv-btn-secondary">
                <SkipBack size={15} />
                <span>Prev Ep</span>
              </button>
            )}

            {onNextEpisode && (
              <button type="button" onClick={onNextEpisode} className="mpv-btn-secondary">
                <SkipForward size={15} />
                <span>Next Ep</span>
              </button>
            )}

            <button type="button" onClick={handleClose} className="mpv-btn-danger">
              Close Stream
            </button>
          </div>
        </div>
      )}

      {/* Buffering & Initial Torrent Swarm Connection Screen */}
      {showBuffering && (
        <div className="player-buffering-overlay">
          <Loader2 size={42} className="spin-icon text-purple-400 mb-3 animate-spin" />
          <h4 className="text-base font-bold text-white mb-1">Resolving Torrent Stream...</h4>
          <p className="text-xs text-zinc-400 max-w-sm text-center mb-3">
            Connecting to torrent swarm, prioritizing video header pieces & launching MPV.
          </p>
          {torrentTask && (
            <div className="torrent-live-bar">
              <span className="text-purple-300 font-semibold">{formatSpeed(torrentTask.download_speed_bps)}</span>
              <span>•</span>
              <span>{torrentTask.peers} Peers</span>
              <span>•</span>
              <span>{torrentTask.progress.toFixed(1)}% Cached</span>
            </div>
          )}
        </div>
      )}

      {/* Error Overlay Fallback */}
      {playbackError && !mpvActive && (
        <div className="player-error-overlay z-30">
          <AlertCircle size={38} className="text-amber-400 mb-2" />
          <h4 className="text-lg font-bold text-white mb-1">Stream Launch Error</h4>
          <p className="text-xs text-zinc-300 whitespace-pre-wrap max-w-md text-center mb-4">
            {playbackError}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={startMpv} className="mpv-btn-primary">
              <Tv size={16} />
              <span>Retry MPV Stream</span>
            </button>
            <button type="button" onClick={handleClose} className="mpv-btn-secondary">
              Close Player
            </button>
          </div>
        </div>
      )}

      {/* Player Header Bar Overlay */}
      <div className="player-header-bar">
        <div className="player-title-info">
          <h3 className="media-heading">{media.title}</h3>
          {episode && (
            <span className="ep-heading">
              Episode {episode.episodeNumber}: {episode.title}
            </span>
          )}
        </div>

        {/* Live Torrent Stats Badge */}
        {torrentTask && (
          <div className="torrent-live-bar">
            <HardDriveDownload size={14} className="text-purple-400 animate-pulse" />
            <span className="font-semibold text-purple-300">{formatSpeed(torrentTask.download_speed_bps)}</span>
            <span className="text-zinc-500">|</span>
            <span>{torrentTask.peers} Peers</span>
            <span className="text-zinc-500">|</span>
            <span>{torrentTask.progress.toFixed(1)}% Cached</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClose} className="close-player-btn" aria-label="Close Player">
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
