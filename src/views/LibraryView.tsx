import { useState } from "react";
import { RefreshCw, LayoutGrid, List, Play, FileVideo, HardDrive } from "lucide-react";
import { LocalMediaItem, MediaType } from "../types";

interface LibraryViewProps {
  localItems: LocalMediaItem[];
  isScanning: boolean;
  onScanFolder: (mediaType: MediaType) => void;
  onPlayLocalItem: (item: LocalMediaItem) => void;
}

export function LibraryView({
  localItems,
  isScanning,
  onScanFolder,
  onPlayLocalItem,
}: LibraryViewProps) {
  const [selectedType, setSelectedType] = useState<MediaType | "all">("all");
  const [viewStyle, setViewStyle] = useState<"grid" | "table">("grid");

  const filteredItems = localItems.filter((item) =>
    selectedType === "all" ? true : item.media_type === selectedType
  );

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  return (
    <div className="view-container library-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Local Library</h1>
          <p className="subtitle">Scanned media files from local drive folders</p>
        </div>

        <div className="filter-controls">
          <div className="scan-actions flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onScanFolder("anime")}
              disabled={isScanning}
            >
              <RefreshCw size={13} className={isScanning ? "spin-icon" : ""} />
              <span>Scan Anime</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onScanFolder("movie")}
              disabled={isScanning}
            >
              <RefreshCw size={13} className={isScanning ? "spin-icon" : ""} />
              <span>Scan Movies</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onScanFolder("tv")}
              disabled={isScanning}
            >
              <RefreshCw size={13} className={isScanning ? "spin-icon" : ""} />
              <span>Scan TV</span>
            </button>
          </div>

          <div className="view-style-toggle flex gap-1">
            <button
              type="button"
              className={`icon-btn-toggle ${viewStyle === "grid" ? "active" : ""}`}
              onClick={() => setViewStyle("grid")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`icon-btn-toggle ${viewStyle === "table" ? "active" : ""}`}
              onClick={() => setViewStyle("table")}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="genre-pills-bar">
        {(["all", "anime", "movie", "tv"] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={`genre-pill-btn ${selectedType === type ? "active" : ""}`}
            onClick={() => setSelectedType(type)}
          >
            {type.toUpperCase()}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="empty-state">
          <HardDrive size={36} className="text-zinc-600 mb-2" />
          <h3>No Scanned Local Media Found</h3>
          <p>Click "Scan" above to index video files from your configured media folders.</p>
        </div>
      ) : viewStyle === "grid" ? (
        <div className="library-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="local-media-card" onClick={() => onPlayLocalItem(item)}>
              <div className="local-thumb-box">
                <FileVideo size={32} className="text-zinc-600" />
                <div className="cw-play-overlay">
                  <Play size={20} className="fill-current text-white" />
                </div>
                <span className="ext-badge">{item.extension.toUpperCase()}</span>
              </div>
              <div className="local-info">
                <h4 className="local-title" title={item.filename}>
                  {item.parsed_title}
                </h4>
                <div className="local-meta">
                  {item.season && <span>S{item.season}</span>}
                  {item.episode && <span>E{item.episode}</span>}
                  <span className="ml-auto text-zinc-500">{formatSize(item.size_bytes)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="tanstack-table">
            <thead>
              <tr>
                <th>Title & File Name</th>
                <th>Type</th>
                <th>Season/Ep</th>
                <th>Size</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="dl-title-cell">
                      <span className="font-medium text-zinc-200">{item.parsed_title}</span>
                      <span className="text-xs text-zinc-500">{item.filename}</span>
                    </div>
                  </td>
                  <td>
                    <span className="format-badge">{item.media_type.toUpperCase()}</span>
                  </td>
                  <td>
                    <span className="text-xs text-zinc-400">
                      {item.season ? `S${item.season}` : ""} {item.episode ? `EP${item.episode}` : "-"}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-zinc-400">{formatSize(item.size_bytes)}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="torrent-btn stream"
                      onClick={() => onPlayLocalItem(item)}
                    >
                      <Play size={13} className="fill-current" />
                      <span>Play</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
