import { invokeTauri } from "./tauri";

export interface MpvTrack {
  id: number;
  track_type: "video" | "audio" | "sub";
  title?: string;
  lang?: string;
  selected: boolean;
}

export class MpvService {
  static async play(url: string, title?: string, startAt?: number): Promise<void> {
    return invokeTauri("mpv_play_cmd", { url, title, start_at: startAt });
  }

  static async stop(): Promise<void> {
    return invokeTauri("mpv_stop_cmd", {});
  }

  static async isRunning(): Promise<boolean> {
    return invokeTauri<boolean>("mpv_is_running_cmd", {});
  }

  static async command(command: (string | number | boolean)[]): Promise<unknown> {
    return invokeTauri("mpv_command_cmd", { command });
  }

  static async getProperties(names: string[]): Promise<Record<string, unknown>> {
    return invokeTauri("mpv_get_properties_cmd", { names });
  }

  static async getTracks(): Promise<MpvTrack[]> {
    return invokeTauri<MpvTrack[]>("mpv_get_tracks_cmd", {});
  }

  static async setTrack(trackType: "audio" | "sub", id: number): Promise<unknown> {
    const propName = trackType === "audio" ? "aid" : "sid";
    return this.command(["set_property", propName, id]);
  }

  static async setProperty(name: string, value: string | number | boolean): Promise<unknown> {
    return this.command(["set_property", name, value]);
  }

  static async seek(seconds: number, mode: "relative" | "absolute" = "absolute"): Promise<unknown> {
    return this.command(["seek", seconds, mode]);
  }

  static async togglePause(): Promise<unknown> {
    return this.command(["cycle", "pause"]);
  }

  static async setVolume(volume: number): Promise<unknown> {
    return this.setProperty("volume", Math.max(0, Math.min(100, volume)));
  }

  static async getLogTail(lines = 50): Promise<string> {
    return invokeTauri<string>("mpv_log_tail_cmd", { lines });
  }
}
