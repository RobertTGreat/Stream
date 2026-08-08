# Stream 🎬⚡

**Stream** is a modern, high-performance desktop application for desktop Linux, macOS, and Windows. Built as a full-featured alternative to Seanime, Stream expands the core streaming experience beyond anime to include **Anime + Cinema Movies + TV Shows / Series**.

Designed with a strictly minimalist dark mode aesthetics system, sparse icon-only primary controls with tooltips, and powered by Tauri (Rust) and React 19 + TypeScript + TanStack (Query, Table).

---

## Key Features ✨

### 1. Multi-Content Ecosystem
- **Anime**: Primary focus powered by AniList GraphQL & MAL APIs.
- **Cinema Movies**: Full TMDB cinema integration with high-quality backdrops, cast, ratings, and trailers.
- **TV Shows / Series**: Full season and episode selector with thumbnails, synopses, and air dates.

### 2. Torrent Engine & Streaming
- **Torrent Streaming**: Play video media while downloading in real-time.
- **Download Queue Manager**: Progress tracking, download speed (MB/s), ETA calculations, pause/resume, and queue persistence powered by Rust.
- **TanStack Table Downloads View**: Built with `@tanstack/react-table` for column sorting, global filtering, and progress tracking.

### 3. Local Library Scanner
- Configurable separate paths for Anime, Movies, and TV Shows.
- Automatic filename parsing (Regex matching for `S01E05`, `1x05`, `Ep 05`, release groups like `[SubsPlease]`, resolution tags).
- Grid & Table library modes with 1-click local playback.

### 4. Built-in Custom Video Player
- Custom overlay interface with minimalist visual aesthetics.
- Features: Timeline scrubbing with buffer indicators, play/pause, seek 10s forward/backward, volume slider & mute, playback speed selector (0.5x – 2.0x), episode next/prev, fullscreen toggle.
- **Auto-Save Watch Progress**: Continuously tracks playback position per episode and updates watch history & AniList status.

### 5. Integrations & Profiles
- **AniList Sync**: OAuth token login, user profile sync, automated episode progress tracking.
- **TMDB API**: Rich metadata for Movies and TV Shows.
- **Indexers Support**: Built-in multi-indexer aggregator with custom Jackett / Prowlarr indexer settings.
- **Watch History & Statistics**: KPI stats (hours watched, completed count, active sessions) and detailed logs.

---

## Keyboard Shortcuts ⌨️

| Shortcut | Description |
|---|---|
| `Ctrl + K` / `Ctrl + F` | Open Global Search |
| `Ctrl + J` | Open Download Queue Manager |
| `Ctrl + ,` | Open Preferences & Settings |
| `Space` | Play / Pause Video Player |
| `Left Arrow` / `Right Arrow` | Rewind 10s / Forward 10s |
| `F` | Toggle Fullscreen |
| `M` | Mute / Unmute Audio |
| `Esc` | Close Player or Modal / Go Back |

---

## Getting Started & Build Instructions 🚀

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://www.rust-lang.org/)

### Installation & Local Development

```bash
# Clone repository
git clone https://github.com/your-username/stream.git
cd Stream

# Install dependencies
npm install

# Run Frontend Web Dev Server
npm run dev

# Run Full Tauri Desktop App locally
npm run tauri dev
```

### Production Build

```bash
# Build frontend web bundle
npm run build

# Package Tauri Desktop Executable
npm run tauri build
```

---

## Project Structure 📁

```
Stream/
├── src-tauri/                # Rust Backend (Tauri IPC, Torrent Manager, File Scanner)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs            # Tauri Command Registration
│       ├── library.rs        # Local Video File Scanner
│       ├── torrent.rs        # Torrent Engine & Download Queue
│       └── indexers.rs       # Torrent Indexers Search Aggregator
├── src/                      # React 19 Frontend
│   ├── components/           # UI Components (Sidebar, TitleBar, Tooltip, MediaCard, TorrentPickerModal, VideoPlayer, DownloadPanel, AniListModal)
│   ├── services/             # APIs (AniList, TMDB, Storage, Tauri Bridge)
│   ├── views/                # Views (Home, Anime, Movies, TV, Library, Search, Collections, Stats, Settings, MediaDetail)
│   ├── types/                # TypeScript Interfaces & Types
│   ├── App.css               # Minimalist Dark Theme Design Token System
│   └── App.tsx               # Main Application Orchestrator
└── README.md
```
