import { LocalMediaItem, MpvTrack, StreamInfo, TorrentAddResult, TorrentFileItem, TorrentResult } from "../types";

// Helper check for Tauri environment
export function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export async function invokeTauri<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  }

  // Web Browser / Dev Mock Fallback implementation
  return mockTauriResponse<T>(cmd, args);
}

export interface DiscordActivityPayload {
  details?: string;
  state?: string;
  start_time?: number;
  end_time?: number;
  large_image?: string;
  large_text?: string;
  small_image?: string;
  small_text?: string;
}

export async function setDiscordActivity(activity: DiscordActivityPayload, clientId?: string): Promise<void> {
  try {
    await invokeTauri("set_discord_activity_cmd", { activity, client_id: clientId });
  } catch {
    // Discord may not be open
  }
}

export interface HealthCheckResult {
  ok: boolean;
  latency_ms: number;
  message: string;
}

export async function selectDirectory(title?: string, defaultPath?: string): Promise<string | null> {
  try {
    return await invokeTauri<string | null>("select_directory_cmd", { title, default_path: defaultPath });
  } catch (err) {
    console.warn("Folder picker error:", err);
    return null;
  }
}

export async function checkIndexerHealth(
  url: string,
  apiKey?: string,
  indexerType: "jackett" | "prowlarr" | "tmdb" | "custom" = "custom"
): Promise<HealthCheckResult> {
  try {
    return await invokeTauri<HealthCheckResult>("check_indexer_health_cmd", {
      url,
      api_key: apiKey,
      indexer_type: indexerType,
    });
  } catch (err) {
    return {
      ok: false,
      latency_ms: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function clearDiscordActivity(): Promise<void> {
  try {
    await invokeTauri("clear_discord_activity_cmd", {});
  } catch {
    // Discord may not be open
  }
}

function mockTauriResponse<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (cmd === "scan_library") {
        const pathStr = (args.path as string) || "C:\\Media\\Anime";
        const mediaType = (args.media_type as string) || "anime";
        const mocks: LocalMediaItem[] = [
          {
            id: "loc_1",
            path: `${pathStr}\\Jujutsu Kaisen S2 - 01.mkv`,
            filename: "Jujutsu Kaisen S2 - 01.mkv",
            parsed_title: "Jujutsu Kaisen Season 2",
            season: 2,
            episode: 1,
            media_type: mediaType as any,
            size_bytes: 1450000000,
            extension: "mkv",
            last_modified: Date.now() / 1000 - 86400,
          },
          {
            id: "loc_2",
            path: `${pathStr}\\Attack on Titan Final Season - 05.mp4`,
            filename: "Attack on Titan Final Season - 05.mp4",
            parsed_title: "Attack on Titan Final Season",
            season: 4,
            episode: 5,
            media_type: mediaType as any,
            size_bytes: 1200000000,
            extension: "mp4",
            last_modified: Date.now() / 1000 - 172800,
          },
        ];
        resolve({ items: mocks, error: null } as unknown as T);
        return;
      }

      if (cmd === "search_torrents_cmd") {
        const query = (args.query as string) || "Stream";
        const mediaType = (args.media_type as string) || "anime";
        const torrents: TorrentResult[] = [
          {
            id: "tor_1",
            title: `[SubsPlease] ${query} - 01 [1080p] (x264 AAC)`,
            magnet_url: `magnet:?xt=urn:btih:mock123&dn=${encodeURIComponent(query)}`,
            size_bytes: 1450000000,
            size_formatted: "1.45 GB",
            seeders: 524,
            leechers: 32,
            quality: "1080p",
            source_name: "Nyaa",
            release_group: "SubsPlease",
            date_posted: "2 hours ago",
            media_type: mediaType as any,
            is_best_release: true,
          },
          {
            id: "tor_2",
            title: `[Erai-raws] ${query} - 01 [720p]`,
            magnet_url: `magnet:?xt=urn:btih:mock456&dn=${encodeURIComponent(query)}`,
            size_bytes: 620000000,
            size_formatted: "620 MB",
            seeders: 88,
            leechers: 12,
            quality: "720p",
            source_name: "AnimeTosho",
            release_group: "Erai-raws",
            date_posted: "5 hours ago",
            media_type: mediaType as any,
            is_best_release: false,
          },
        ];
        resolve(torrents as unknown as T);
        return;
      }

      if (cmd === "add_magnet_cmd") {
        const res: TorrentAddResult = {
          task_id: "mock_tor_1",
          title: (args.title as string) || "Mock Torrent Batch",
          files: [
            { index: 0, name: "Episode 01 - Beginning.mkv", length: 1450000000, is_video: true },
            { index: 1, name: "Episode 02 - Continuation.mkv", length: 1520000000, is_video: true },
            { index: 2, name: "NCED.mkv", length: 120000000, is_video: true },
            { index: 3, name: "Subtitles.ass", length: 45000, is_video: false },
          ],
          recommended_file_index: 0,
        };
        resolve(res as unknown as T);
        return;
      }

      if (cmd === "list_torrent_files_cmd") {
        const files: TorrentFileItem[] = [
          { index: 0, name: "Episode 01 - Beginning.mkv", length: 1450000000, is_video: true },
          { index: 1, name: "Episode 02 - Continuation.mkv", length: 1520000000, is_video: true },
        ];
        resolve(files as unknown as T);
        return;
      }

      if (cmd === "start_torrent_stream_cmd") {
        const res: StreamInfo = {
          task_id: `stream_${Date.now()}`,
          stream_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          is_ready: true,
          buffered_percent: 0,
          title: (args.title as string) || "Stream Video",
          selected_file_index: (args.file_index as number) || 0,
          needs_file_pick: false,
          files: [
            { index: 0, name: "Episode 01.mkv", length: 1450000000, is_video: true },
          ],
        };
        resolve(res as unknown as T);
        return;
      }

      if (cmd === "mpv_get_tracks_cmd") {
        const tracks: MpvTrack[] = [
          { id: 1, track_type: "video", title: "1080p AVC", lang: "eng", selected: true },
          { id: 2, track_type: "audio", title: "Japanese FLAC 2.0", lang: "jpn", selected: true },
          { id: 3, track_type: "audio", title: "English AAC 5.1", lang: "eng", selected: false },
          { id: 4, track_type: "sub", title: "English Full (Dialogue)", lang: "eng", selected: true },
          { id: 5, track_type: "sub", title: "Signs & Songs", lang: "eng", selected: false },
        ];
        resolve(tracks as unknown as T);
        return;
      }

      if (cmd === "mpv_get_properties_cmd") {
        resolve({
          pause: false,
          "time-pos": 124.5,
          duration: 1420.0,
          volume: 100,
          mute: false,
          speed: 1.0,
        } as unknown as T);
        return;
      }

      if (cmd === "select_directory_cmd") {
        resolve("C:\\Downloads\\Stream" as unknown as T);
        return;
      }

      if (cmd === "check_indexer_health_cmd") {
        resolve({
          ok: true,
          latency_ms: 48,
          message: "Connected (HTTP 200, 48ms)",
        } as unknown as T);
        return;
      }

      resolve(true as unknown as T);
    }, 100);
  });
}
