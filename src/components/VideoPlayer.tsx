import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  SkipForward,
  SkipBack,
  AlertCircle,
  Loader2,
  HardDriveDownload,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize2,
  Subtitles,
  AudioLines,
  Gauge,
  FastForward,
  Keyboard,
  RefreshCw,
} from "lucide-react";
import { DownloadTask, Episode, MediaItem, MpvTrack, StreamProgress } from "../types";
import { StorageService } from "../services/storage";
import { AniListService } from "../services/anilist";
import { invokeTauri, setDiscordActivity, clearDiscordActivity } from "../services/tauri";

async function listenAndroidPlayerClosed(onClosed: () => void): Promise<() => void> {
  try {
    const { addPluginListener } = await import("@tauri-apps/api/core");
    const listener = await addPluginListener("android-player", "player-closed", () => onClosed());
    return () => {
      void listener.unregister();
    };
  } catch {
    return () => undefined;
  }
}
import { AniSkipService, SkipInterval } from "../services/aniskip";
import { isAndroid } from "../utils/platform";

interface VideoPlayerProps {
  media: MediaItem;
  episode?: Episode;
  streamUrl: string;
  torrentTask?: DownloadTask | null;
  magnetUrl?: string;
  torrentTitle?: string;
  fileIndex?: number;
  startAt?: number;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  onPreloadNextEpisode?: () => void;
  onOpenTorrentPicker?: () => void;
  initialError?: string;
  statusLabel?: string;
  autoPlayNext?: boolean;
  hardwareAcceleration?: boolean;
  defaultSubtitles?: string;
  postWatchBehavior?: "keep" | "delete";
}

const OBSERVED_PROPERTIES = ["time-pos", "duration", "pause", "volume", "eof-reached", "mute", "speed", "sub-delay", "audio-delay"];

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function VideoPlayer({
  media,
  episode,
  streamUrl,
  torrentTask,
  magnetUrl,
  torrentTitle,
  fileIndex,
  startAt = 0,
  onClose,
  onNextEpisode,
  onPrevEpisode,
  onPreloadNextEpisode,
  onOpenTorrentPicker,
  initialError,
  statusLabel,
  autoPlayNext = true,
  hardwareAcceleration = true,
  defaultSubtitles = "English",
  postWatchBehavior = "keep",
}: VideoPlayerProps) {
  const onCloseRef = useRef(onClose);
  const onNextRef = useRef(onNextEpisode);
  const onPreloadRef = useRef(onPreloadNextEpisode);
  onCloseRef.current = onClose;
  onNextRef.current = onNextEpisode;
  onPreloadRef.current = onPreloadNextEpisode;

  const savedVol = useRef(StorageService.getPlayerVolume()).current;
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(startAt || 0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(savedVol.volume);
  const [muted, setMuted] = useState(savedVol.muted);
  const [speed, setSpeed] = useState(1.0);
  const [, setSubDelay] = useState(0);
  const [, setAudioDelay] = useState(0);
  const [hudToast, setHudToast] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(initialError || null);
  const [mpvActive, setMpvActive] = useState(false);
  const [htmlActive, setHtmlActive] = useState(false);
  const useAndroidPlayer = isAndroid();
  const [tracks, setTracks] = useState<MpvTrack[]>([]);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);
  const [activeSkip, setActiveSkip] = useState<SkipInterval | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const seekingRef = useRef(false);
  const anilistSyncedRef = useRef(false);
  const preloadedRef = useRef(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLaunchingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const eofHandledRef = useRef(false);
  const launchedAtRef = useRef(0);
  const isMountedRef = useRef(true);
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      void clearDiscordActivity();
    };
  }, []);

  const send = useCallback(async (command: (string | number | boolean)[]) => {
    try {
      await invokeTauri("mpv_command_cmd", { command });
    } catch {
      // session not ready
    }
  }, []);

  // Fetch AniSkip intervals on mount / episode change
  useEffect(() => {
    let active = true;
    if (media.malId && episode?.episodeNumber) {
      void AniSkipService.getSkipTimes(media.malId, episode.episodeNumber, duration).then((intervals) => {
        if (active) setSkipIntervals(intervals);
      });
    }
    return () => {
      active = false;
    };
  }, [media.malId, episode?.episodeNumber, duration]);

  // Push AniSkip intervals to MPV custom GUI for timeline markers
  useEffect(() => {
    if (!mpvActive || skipIntervals.length === 0) return;
    void send(["script-message", "clear-skip-intervals"]);
    for (const interval of skipIntervals) {
      void send([
        "script-message",
        "register-skip-interval",
        interval.startTime,
        interval.endTime,
        interval.label,
        interval.skipType,
      ]);
    }
  }, [mpvActive, skipIntervals, send]);

  // Update Discord Rich Presence
  useEffect(() => {
    if (!mpvActive) return;

    const now = Math.floor(Date.now() / 1000);
    const remaining = duration > currentTime ? Math.floor(duration - currentTime) : undefined;
    const isMovie = media.mediaType === "movie";

    let stateStr = isMovie ? "Movie" : episode ? `Episode ${episode.episodeNumber}${episode.title ? ` - ${episode.title}` : ""}` : "Watching";
    if (paused) stateStr += " (Paused)";

    void setDiscordActivity({
      details: media.title,
      state: stateStr,
      start_time: paused ? undefined : now - Math.floor(currentTime),
      end_time: paused || !remaining ? undefined : now + remaining,
      large_image: media.coverImage || "logo",
      large_text: media.title,
      small_image: paused ? "pause" : "play",
      small_text: paused ? "Paused" : "Playing",
    });
  }, [mpvActive, media.title, media.coverImage, media.mediaType, episode, duration, currentTime, paused]);

  useEffect(() => {
    setPlaybackError(initialError || null);
    if (initialError) setIsBuffering(false);
  }, [initialError]);

  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  currentTimeRef.current = currentTime;
  durationRef.current = duration;

  const saveProgress = useCallback(() => {
    const curTime = currentTimeRef.current;
    const dur = durationRef.current;
    if (dur === 0 || !curTime) return;
    const pct = Math.round((curTime / dur) * 100);
    const currentMedia = mediaRef.current;
    const currentEpisode = episodeRef.current;

    const progressObj: StreamProgress = {
      mediaId: currentMedia.id,
      mediaTitle: currentMedia.title,
      mediaType: currentMedia.mediaType,
      coverImage: currentMedia.coverImage,
      episodeNumber: currentEpisode ? currentEpisode.episodeNumber : 1,
      seasonNumber: currentEpisode?.seasonNumber,
      currentTime: curTime,
      duration: dur,
      percentage: pct,
      lastUpdated: Date.now(),
      anilistId: currentMedia.anilistId,
      magnetUrl: magnetUrl || torrentTask?.magnet_link,
      torrentTitle: torrentTitle || torrentTask?.title,
      streamUrl,
      fileIndex,
    };
    StorageService.saveWatchProgress(progressObj);
    StorageService.cacheMedia(currentMedia);
    if (currentMedia.anilistId && pct >= 90 && !anilistSyncedRef.current) {
      anilistSyncedRef.current = true;
      const epNum = currentEpisode ? currentEpisode.episodeNumber : 1;
      const finished = currentMedia.episodesCount ? epNum >= currentMedia.episodesCount : currentMedia.mediaType === "movie";
      void AniListService.updateAniListProgress({
        anilistId: currentMedia.anilistId,
        episodeNumber: epNum,
        status: finished ? "COMPLETED" : "CURRENT",
      });
    }
    if (postWatchBehavior === "delete" && pct >= 90 && torrentTask?.id) {
      void invokeTauri("cancel_download_cmd", { id: torrentTask.id }).catch(() => undefined);
    }
  }, [magnetUrl, torrentTask, streamUrl, fileIndex, postWatchBehavior]);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopMpv = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    clearPoll();
    setMpvActive(false);
    setHtmlActive(false);
    try {
      if (useAndroidPlayer) {
        await invokeTauri("android_player_stop_cmd", {});
      } else {
        await invokeTauri("mpv_stop_cmd", {});
      }
    } catch {
      // session already gone
    }
  }, [clearPoll, useAndroidPlayer]);

  const handleClose = useCallback(() => {
    clearPoll();
    saveProgress();
    void stopMpv();
    onCloseRef.current();
  }, [clearPoll, saveProgress, stopMpv]);

  const mediaRef = useRef(media);
  const episodeRef = useRef(episode);
  mediaRef.current = media;
  episodeRef.current = episode;

  const startMpv = useCallback(async (url: string) => {
    if (!url || isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    isStoppingRef.current = false;
    eofHandledRef.current = false;
    anilistSyncedRef.current = false;
    launchedAtRef.current = Date.now();
    setPlaybackError(null);
    setIsBuffering(true);
    const currentMedia = mediaRef.current;
    const currentEpisode = episodeRef.current;
    const resumeAt = startAtRef.current;

    try {
      await invokeTauri("mpv_play_cmd", {
        url,
        title: `${currentMedia.title}${currentEpisode ? ` - Episode ${currentEpisode.episodeNumber}` : ""}`,
        start_at: resumeAt && resumeAt > 5 ? resumeAt : undefined,
        hardware_acceleration: hardwareAcceleration,
        default_subtitles: defaultSubtitles,
      });
      if (!isMountedRef.current) {
        await invokeTauri("mpv_stop_cmd", {});
        return;
      }

      setMpvActive(true);
      setIsBuffering(false);

      clearPoll();
      pollRef.current = setInterval(async () => {
        if (!isMountedRef.current || isStoppingRef.current) return;
        try {
          const isRunning = await invokeTauri<boolean>("mpv_is_running_cmd", {});
          const grace = Date.now() - launchedAtRef.current < 2500;
          if (!isRunning && !grace && isMountedRef.current) {
            clearPoll();
            handleClose();
            return;
          }
          if (!isRunning && !grace) {
            return;
          }
        } catch {
          // ignore
        }

        try {
          const props = await invokeTauri<Record<string, unknown>>("mpv_get_properties_cmd", {
            names: OBSERVED_PROPERTIES,
          });
          if (!isMountedRef.current) return;
          const pos = typeof props["time-pos"] === "number" ? props["time-pos"] : 0;
          const dur = typeof props.duration === "number" ? props.duration : 0;

          if (!seekingRef.current && pos > 0) {
            setCurrentTime(pos);
            setIsBuffering(false);
          }
          if (dur > 0) {
            setDuration(dur);
            setIsBuffering(false);
          }
          if (typeof props.pause === "boolean") setPaused(props.pause);
          if (typeof props.volume === "number") setVolume(props.volume);
          if (typeof props.mute === "boolean") setMuted(props.mute);
          if (typeof props.speed === "number") setSpeed(props.speed);

          // AniSkip check
          if (skipIntervals.length > 0 && pos > 0) {
            const active = AniSkipService.getActiveInterval(skipIntervals, pos);
            setActiveSkip(active);
            if (active) {
              void send(["script-message", "set-skip-interval", active.endTime, active.label]);
            }
          }

          // Preload next episode when 35s remaining
          if (dur > 60 && pos > 0 && dur - pos <= 35 && !preloadedRef.current) {
            preloadedRef.current = true;
            onPreloadRef.current?.();
          }

          // Auto-next episode countdown when < 15s remaining
          if (dur > 60 && pos > 0 && dur - pos <= 15 && autoPlayNext && currentMedia.mediaType !== "movie" && onNextRef.current) {
            const remaining = Math.max(1, Math.ceil(dur - pos));
            setNextCountdown(remaining);
          } else {
            setNextCountdown(null);
          }

          if (props["eof-reached"] === true && !eofHandledRef.current) {
            eofHandledRef.current = true;
            if (autoPlayNext && currentMedia.mediaType !== "movie") {
              onNextRef.current?.();
            }
          }
        } catch {
          // silent poll
        }
      }, 400);

      try {
        const nextTracks = await invokeTauri<MpvTrack[]>("mpv_get_tracks_cmd", {});
        setTracks(nextTracks);
      } catch {
        setTracks([]);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setMpvActive(false);
        setIsBuffering(false);
        setPlaybackError(`Could not start playback engine: ${err}`);
      }
    } finally {
      isLaunchingRef.current = false;
    }
  }, [handleClose, hardwareAcceleration, defaultSubtitles, autoPlayNext, skipIntervals, send]);

  const triggerHudToast = useCallback((msg: string) => {
    setHudToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setHudToast(null);
    }, 1800);
  }, []);

  const adjustSubDelay = useCallback((delta: number) => {
    setSubDelay((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      void send(["set_property", "sub-delay", next]);
      triggerHudToast(`Subtitle Delay: ${next >= 0 ? "+" : ""}${(next * 1000).toFixed(0)} ms`);
      return next;
    });
  }, [send, triggerHudToast]);

  const adjustAudioDelay = useCallback((delta: number) => {
    setAudioDelay((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      void send(["set_property", "audio-delay", next]);
      triggerHudToast(`Audio Delay: ${next >= 0 ? "+" : ""}${(next * 1000).toFixed(0)} ms`);
      return next;
    });
  }, [send, triggerHudToast]);

  const adjustVolume = useCallback((delta: number) => {
    setVolume((prev) => {
      const next = Math.min(100, Math.max(0, prev + delta));
      void send(["set_property", "volume", next]);
      StorageService.savePlayerVolume(next, muted);
      triggerHudToast(`Volume: ${next}%`);
      return next;
    });
  }, [send, muted, triggerHudToast]);

  const cycleSpeed = useCallback(() => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.findIndex((s) => Math.abs(s - speed) < 0.05);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setSpeed(nextSpeed);
    void send(["set_property", "speed", nextSpeed]);
    triggerHudToast(`Speed: ${nextSpeed}x`);
  }, [speed, send, triggerHudToast]);

  const handleSkipIntro = useCallback(() => {
    if (activeSkip) {
      void send(["seek", activeSkip.endTime, "absolute"]);
      setCurrentTime(activeSkip.endTime);
      setActiveSkip(null);
    }
  }, [activeSkip, send]);

  useEffect(() => {
    if (!streamUrl || initialError) {
      return undefined;
    }
    if (useAndroidPlayer) {
      let cancelled = false;
      const resumeAt = startAt > 5 ? startAt : undefined;
      setPlaybackError(null);
      setIsBuffering(true);
      void (async () => {
        try {
          await invokeTauri("android_player_play_cmd", {
            url: streamUrl,
            start_at: resumeAt,
            default_subtitles: defaultSubtitles,
          });
          if (cancelled) return;
          setHtmlActive(true);
          setIsBuffering(false);
        } catch (err) {
          if (!cancelled) {
            setHtmlActive(false);
            setIsBuffering(false);
            setPlaybackError(`Could not start Android player: ${err}`);
          }
        }
      })();

      let sawReady = false;
      const poll = window.setInterval(async () => {
        if (cancelled) return;
        try {
          const state = await invokeTauri<{
            ready: boolean;
            playing: boolean;
            paused: boolean;
            position: number;
            duration: number;
            ended: boolean;
            buffering: boolean;
            closed?: boolean;
            error?: string | null;
          }>("android_player_get_state_cmd", {});
          if (cancelled) return;
          if (state.ready) sawReady = true;
          if (typeof state.position === "number") setCurrentTime(state.position);
          if (typeof state.duration === "number" && state.duration > 0) setDuration(state.duration);
          setPaused(Boolean(state.paused));
          setIsBuffering(Boolean(state.buffering));
          if (state.error) {
            setPlaybackError(state.error);
            setHtmlActive(false);
          }
          if (state.ended && !eofHandledRef.current) {
            eofHandledRef.current = true;
            if (autoPlayNext && media.mediaType !== "movie") {
              onNextEpisode?.();
            } else {
              handleClose();
            }
          }
          if (sawReady && (state.closed || !state.ready) && !isStoppingRef.current) {
            handleClose();
          }
        } catch {
          // ignore poll misses
        }
      }, 500);

      const unlistenClosed = listenAndroidPlayerClosed(() => {
        if (!cancelled) handleClose();
      });

      return () => {
        cancelled = true;
        window.clearInterval(poll);
        void unlistenClosed.then((fn) => fn()).catch(() => undefined);
      };
    }
    void startMpv(streamUrl);
    return () => {
      void stopMpv();
    };
  }, [streamUrl, initialError, useAndroidPlayer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
        handleClose();
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }
      if (!mpvActive) return;

      if (e.key === " ") {
        e.preventDefault();
        void send(["cycle", "pause"]);
      } else if (e.key === "ArrowRight") {
        void send(["seek", 10, "relative"]);
      } else if (e.key === "ArrowLeft") {
        void send(["seek", -10, "relative"]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        adjustVolume(5);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        adjustVolume(-5);
      } else if (e.key === "f" || e.key === "F") {
        void send(["cycle", "fullscreen"]);
      } else if (e.key === "m" || e.key === "M") {
        void send(["cycle", "mute"]);
      } else if (e.key === "s" || e.key === "S") {
        cycleSpeed();
      } else if (e.key === "[" || e.key === "z" || e.key === "Z") {
        adjustSubDelay(-0.1);
      } else if (e.key === "]" || e.key === "x" || e.key === "X") {
        adjustSubDelay(+0.1);
      } else if (e.key === "{" || (e.shiftKey && e.key === "[")) {
        adjustAudioDelay(-0.1);
      } else if (e.key === "}" || (e.shiftKey && e.key === "]")) {
        adjustAudioDelay(+0.1);
      } else if ((e.key === "n" || e.key === "N") && onNextEpisode) {
        onNextEpisode();
      } else if ((e.key === "p" || e.key === "P") && onPrevEpisode) {
        onPrevEpisode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, mpvActive, send, showShortcutsModal, adjustVolume, cycleSpeed, adjustSubDelay, adjustAudioDelay, onNextEpisode, onPrevEpisode]);

  useEffect(() => {
    const interval = setInterval(saveProgress, 4000);
    return () => clearInterval(interval);
  }, [saveProgress]);

  const formatSpeed = (bps: number) => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
    if (bps >= 1000) return `${(bps / 1000).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  const audioTracks = tracks.filter((t) => t.track_type === "audio");
  const subTracks = tracks.filter((t) => t.track_type === "sub");

  const resolving = !streamUrl && !playbackError;
  const playerReady = useAndroidPlayer ? htmlActive : mpvActive;
  const showOverlay = (resolving || isBuffering || playbackError) && !playerReady;
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className={`video-player-modal ${playerReady ? "is-playing" : "is-loading"}`}>
      <div className="player-chrome">
        <div className="player-title-info">
          <h3 className="media-heading">{media.title}</h3>
          {episode && (
            <span className="ep-heading">
              Episode {episode.episodeNumber}
              {episode.title ? `: ${episode.title}` : ""}
            </span>
          )}
        </div>
        <button type="button" onClick={handleClose} className="close-player-btn" aria-label="Close player">
          <X size={18} />
        </button>
      </div>

      {useAndroidPlayer && htmlActive && !playbackError && (
        <div className="android-player-placeholder">
          <p>Playing with Android player</p>
          {torrentTask && (
            <div className="torrent-live-bar">
              <HardDriveDownload size={14} />
              <span>{formatSpeed(torrentTask.download_speed_bps)}</span>
              <span>{torrentTask.peers} peers</span>
              <span>{torrentTask.progress.toFixed(1)}% cached</span>
            </div>
          )}
        </div>
      )}

      {!useAndroidPlayer && mpvActive && !playbackError && (
        <div className="mpv-console">
          <div className="mpv-console-hero">
            {media.coverImage ? (
              <img src={media.coverImage} alt="" className="mpv-console-poster" />
            ) : (
              <div className="mpv-console-poster fallback" />
            )}
            <div className="mpv-console-copy">
              <p className="mpv-console-kicker">Playing in MPV</p>
              <h2>{media.title}</h2>
              {episode && <p>Episode {episode.episodeNumber}{episode.title ? ` · ${episode.title}` : ""}</p>}
              {startAt > 5 && duration === 0 && <p className="mpv-console-resume">Resuming at {formatClock(startAt)}</p>}
              {torrentTask && (
                <div className="torrent-live-bar">
                  <HardDriveDownload size={14} />
                  <span>{formatSpeed(torrentTask.download_speed_bps)}</span>
                  <span>{torrentTask.peers} peers</span>
                  <span>{torrentTask.progress.toFixed(1)}% cached</span>
                </div>
              )}
            </div>
          </div>

          <div className="mpv-transport">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={1}
              value={Math.min(currentTime, duration || currentTime)}
              className="mpv-seek"
              style={{ "--progress": `${progressPct}%` } as React.CSSProperties}
              onMouseDown={() => {
                seekingRef.current = true;
              }}
              onMouseUp={() => {
                seekingRef.current = false;
              }}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCurrentTime(next);
                void send(["seek", next, "absolute"]);
              }}
            />
            <div className="mpv-transport-row">
              <span className="mpv-time">{formatClock(currentTime)}</span>
              <div className="mpv-transport-buttons">
                {onPrevEpisode && (
                  <button type="button" onClick={onPrevEpisode} title="Previous episode">
                    <SkipBack size={18} />
                  </button>
                )}
                <button type="button" onClick={() => void send(["seek", -10, "relative"])} title="Back 10s">
                  -10
                </button>
                <button
                  type="button"
                  className="mpv-play-btn"
                  onClick={() => void send(["cycle", "pause"])}
                  title={paused ? "Play" : "Pause"}
                >
                  {paused ? <Play size={20} className="fill-current" /> : <Pause size={20} />}
                </button>
                <button type="button" onClick={() => void send(["seek", 10, "relative"])} title="Forward 10s">
                  +10
                </button>
                {onNextEpisode && (
                  <button type="button" onClick={onNextEpisode} title="Next episode">
                    <SkipForward size={18} />
                  </button>
                )}
              </div>
              <span className="mpv-time">{formatClock(duration)}</span>
            </div>

            <div className="mpv-extra-row">
              <label className="mpv-vol">
                <button type="button" onClick={() => void send(["cycle", "mute"])} title="Mute">
                  {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    setMuted(next === 0);
                    void send(["set_property", "volume", next]);
                    if (next > 0) void send(["set_property", "mute", false]);
                  }}
                />
              </label>

              <button
                type="button"
                className="mpv-btn-secondary mpv-speed-btn"
                onClick={cycleSpeed}
                title="Playback Speed"
              >
                <Gauge size={14} />
                <span>{speed.toFixed(2)}x</span>
              </button>

              {audioTracks.length > 0 && (
                <label className="mpv-select">
                  <AudioLines size={14} />
                  <select
                    value={audioTracks.find((t) => t.selected)?.id ?? ""}
                    onChange={(e) => void send(["set_property", "aid", Number(e.target.value)])}
                  >
                    {audioTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.lang || "und"} {t.title || `Audio ${t.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {subTracks.length > 0 && (
                <label className="mpv-select">
                  <Subtitles size={14} />
                  <select
                    value={subTracks.find((t) => t.selected)?.id ?? 0}
                    onChange={(e) => void send(["set_property", "sid", Number(e.target.value)])}
                  >
                    <option value={0}>Subs off</option>
                    {subTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.lang || "und"} {t.title || `Sub ${t.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="button"
                className="mpv-btn-secondary"
                onClick={() => setShowShortcutsModal((prev) => !prev)}
                title="Keyboard Shortcuts (?)"
              >
                <Keyboard size={14} />
                Shortcuts
              </button>
              <button type="button" className="mpv-btn-secondary" onClick={() => void send(["cycle", "fullscreen"])}>
                <Maximize2 size={14} />
                Fullscreen
              </button>
              <button type="button" className="mpv-btn-secondary" onClick={handleClose}>
                Stop
              </button>
            </div>
          </div>

          {/* Temporary HUD Toast for volume/delay adjustments */}
          {hudToast && (
            <div className="player-hud-toast">
              <span>{hudToast}</span>
            </div>
          )}

          {/* AniSkip floating button in Web HUD */}
          {activeSkip && (
            <button
              type="button"
              className="player-aniskip-btn"
              onClick={handleSkipIntro}
              title={`Press to ${activeSkip.label}`}
            >
              <FastForward size={14} />
              <span>{activeSkip.label}</span>
            </button>
          )}

          {/* Next Episode Countdown Card */}
          {nextCountdown != null && onNextEpisode && (
            <div className="player-next-card">
              <div className="player-next-info">
                <p className="player-next-label">Next Episode in {nextCountdown}s</p>
                <p className="player-next-title">{media.title}</p>
              </div>
              <div className="player-next-actions">
                <button type="button" className="player-next-btn-now" onClick={onNextEpisode}>
                  <FastForward size={14} />
                  <span>Play Now</span>
                </button>
                <button
                  type="button"
                  className="player-next-btn-cancel"
                  onClick={() => setNextCountdown(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {showShortcutsModal && (
        <div className="modal-backdrop" onClick={() => setShowShortcutsModal(false)}>
          <div className="modal-content shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Keyboard size={18} className="text-purple-400" />
                <h3>Player Keyboard Shortcuts</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowShortcutsModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="shortcuts-grid">
                <div className="shortcut-item">
                  <span className="shortcut-desc">Play / Pause</span>
                  <div className="shortcut-keys"><kbd>Space</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Seek -10s / +10s</span>
                  <div className="shortcut-keys"><kbd>←</kbd> <kbd>→</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Volume Up / Down</span>
                  <div className="shortcut-keys"><kbd>↑</kbd> <kbd>↓</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Toggle Mute</span>
                  <div className="shortcut-keys"><kbd>M</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Toggle Fullscreen</span>
                  <div className="shortcut-keys"><kbd>F</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Cycle Playback Speed</span>
                  <div className="shortcut-keys"><kbd>S</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Subtitle Delay (+/- 100ms)</span>
                  <div className="shortcut-keys"><kbd>[</kbd> <kbd>]</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Audio Delay (+/- 100ms)</span>
                  <div className="shortcut-keys"><kbd>&#123;</kbd> <kbd>&#125;</kbd></div>
                </div>
                {onNextEpisode && (
                  <div className="shortcut-item">
                    <span className="shortcut-desc">Next Episode</span>
                    <div className="shortcut-keys"><kbd>N</kbd></div>
                  </div>
                )}
                {onPrevEpisode && (
                  <div className="shortcut-item">
                    <span className="shortcut-desc">Previous Episode</span>
                    <div className="shortcut-keys"><kbd>P</kbd></div>
                  </div>
                )}
                <div className="shortcut-item">
                  <span className="shortcut-desc">Toggle Shortcuts Help</span>
                  <div className="shortcut-keys"><kbd>?</kbd></div>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Exit / Close Player</span>
                  <div className="shortcut-keys"><kbd>Esc</kbd></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOverlay && (
        <div className="player-stage">
          {playbackError ? (
            <div className="player-error-overlay">
              <AlertCircle size={36} className="text-amber-400 mb-2" />
              <h4>Could not start stream</h4>
              <p>{playbackError}</p>
              <div className="flex items-center gap-3 mt-2">
                {streamUrl && (
                  <button type="button" onClick={() => void startMpv(streamUrl)} className="mpv-btn-primary">
                    Retry
                  </button>
                )}
                {onOpenTorrentPicker && (
                  <button type="button" onClick={onOpenTorrentPicker} className="mpv-btn-secondary">
                    Pick Different Release
                  </button>
                )}
                <button type="button" onClick={handleClose} className="mpv-btn-secondary">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="player-buffering-overlay">
              <Loader2 size={40} className="spin-icon animate-spin" />
              <h4>{resolving ? "Finding the best source" : "Starting playback"}</h4>
              <p>
                {statusLabel ||
                  (resolving
                    ? "Searching indexers and connecting to the swarm."
                    : "Launching the player.")}
              </p>
              {startAt > 5 && <p>Will resume at {formatClock(startAt)}</p>}
              {torrentTask && (
                <div className="torrent-live-bar">
                  <span>{formatSpeed(torrentTask.download_speed_bps)}</span>
                  <span>{torrentTask.peers} peers</span>
                  <span>{torrentTask.progress.toFixed(1)}% cached</span>
                </div>
              )}
              {torrentTask && torrentTask.peers === 0 && onOpenTorrentPicker && (
                <div className="low-swarm-notice">
                  <span>Connecting to swarm... low seeds detected.</span>
                  <button
                    type="button"
                    className="low-swarm-btn"
                    onClick={onOpenTorrentPicker}
                  >
                    <RefreshCw size={12} />
                    <span>Choose another source</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
