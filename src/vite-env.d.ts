/// <reference types="vite/client" />

declare module "@tauri-apps/plugin-deep-link" {
  export function onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>;
}
