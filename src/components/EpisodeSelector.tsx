import { useState } from "react";
import { Play, Check, Clock, Download, Search, LayoutList, Grid3X3 } from "lucide-react";
import { Episode } from "../types";
import { MediaImage } from "./MediaImage";
import { Tooltip } from "./Tooltip";

interface EpisodeSelectorProps {
  episodes: Episode[];
  seasonsCount?: number;
  onPlayEpisode: (ep: Episode) => void;
  onDownloadEpisode?: (ep: Episode) => void;
  watchedEpisodes?: Record<number, number>;
  onContextMenu?: (e: React.MouseEvent, ep: Episode) => void;
}

export function EpisodeSelector({
  episodes,
  onPlayEpisode,
  onDownloadEpisode,
  watchedEpisodes = {},
  onContextMenu,
}: EpisodeSelectorProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [viewStyle, setViewStyle] = useState<"list" | "numbers">(() => {
    return (localStorage.getItem("stream_ep_view_style") as "list" | "numbers") || "list";
  });

  const handleSetViewStyle = (style: "list" | "numbers") => {
    setViewStyle(style);
    localStorage.setItem("stream_ep_view_style", style);
  };

  const filteredEpisodes = episodes.filter((ep) => {
    const q = searchFilter.trim().toLowerCase();
    return (
      q === "" ||
      ep.title.toLowerCase().includes(q) ||
      `episode ${ep.episodeNumber}`.includes(q) ||
      String(ep.episodeNumber) === q
    );
  });

  return (
    <div className="eps-panel">
      <div className="eps-toolbar">
        <div className="eps-toolbar-controls">
          <div className="eps-search">
            <Search size={14} className="eps-search-icon" />
            <input
              type="text"
              placeholder="Filter episodes…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="eps-search-input"
            />
          </div>

          <div className="eps-view-toggle" role="group" aria-label="Display style">
            <Tooltip label="Detailed list" hint="Rows with thumbnails" side="bottom">
              <button
                type="button"
                className={`eps-view-btn ${viewStyle === "list" ? "active" : ""}`}
                onClick={() => handleSetViewStyle("list")}
                aria-label="Detailed list view"
              >
                <LayoutList size={14} />
              </button>
            </Tooltip>

            <Tooltip label="Number buttons" hint="Compact episode grid" side="bottom">
              <button
                type="button"
                className={`eps-view-btn ${viewStyle === "numbers" ? "active" : ""}`}
                onClick={() => handleSetViewStyle("numbers")}
                aria-label="Numbers only view"
              >
                <Grid3X3 size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {filteredEpisodes.length === 0 ? (
        <div className="eps-empty">No episodes match this filter.</div>
      ) : viewStyle === "numbers" ? (
        <div className="eps-numbers-grid">
          {filteredEpisodes.map((ep) => {
            const progress = watchedEpisodes[ep.episodeNumber] || 0;
            const isCompleted = progress >= 90;
            const isInProgress = progress > 0 && !isCompleted;
            const airTime = ep.airDate && /^\d{4}-\d{2}-\d{2}$/.test(ep.airDate) ? new Date(ep.airDate).getTime() : 0;
            const isUnreleased = Boolean(ep.unreleased || (airTime > 0 && airTime > Date.now()));

            const tipHint = [
              ep.durationMinutes ? `${ep.durationMinutes}m` : null,
              isCompleted ? "Watched" : isInProgress ? `${Math.round(progress)}%` : isUnreleased ? "Not released" : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Tooltip
                key={ep.id}
                label={ep.title || `Episode ${ep.episodeNumber}`}
                hint={tipHint}
                side="bottom"
              >
                <button
                  type="button"
                  className={`eps-num-btn ${isUnreleased ? "is-unreleased" : ""} ${isCompleted ? "is-watched" : ""} ${isInProgress ? "is-progress" : ""}`}
                  onClick={() => {
                    if (!isUnreleased) onPlayEpisode(ep);
                  }}
                  onContextMenu={(e) => {
                    if (onContextMenu) {
                      e.preventDefault();
                      e.stopPropagation();
                      onContextMenu(e, ep);
                    }
                  }}
                  disabled={isUnreleased}
                  aria-label={`Episode ${ep.episodeNumber}: ${ep.title}`}
                >
                  <span className="eps-num-val">{ep.episodeNumber}</span>
                  {isCompleted && (
                    <span className="eps-num-check" aria-hidden>
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                  {isInProgress && (
                    <div className="eps-num-progress-bar">
                      <div style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <div className="eps-list">
          {filteredEpisodes.map((ep) => {
            const progress = watchedEpisodes[ep.episodeNumber] || 0;
            const isCompleted = progress >= 90;
            const isInProgress = progress > 0 && !isCompleted;
            const airTime = ep.airDate && /^\d{4}-\d{2}-\d{2}$/.test(ep.airDate) ? new Date(ep.airDate).getTime() : 0;
            const isUnreleased = Boolean(ep.unreleased || (airTime > 0 && airTime > Date.now()));

            return (
              <article
                key={ep.id}
                className={`eps-row ${isUnreleased ? "is-unreleased" : ""} ${isCompleted ? "is-watched" : ""} ${isInProgress ? "is-progress" : ""}`}
                onClick={() => {
                  if (!isUnreleased) onPlayEpisode(ep);
                }}
                onContextMenu={(e) => {
                  if (onContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(e, ep);
                  }
                }}
              >
                <div className="eps-thumb">
                  <MediaImage
                    src={ep.thumbnail}
                    alt=""
                    emptyLabel="No thumbnail"
                    emptyClassName="eps-thumb-empty"
                  />
                  {!isUnreleased && (
                    <div className="eps-thumb-hover">
                      <Play size={16} className="fill-current" />
                    </div>
                  )}
                  {(isInProgress || isCompleted) && (
                    <div className="eps-thumb-bar">
                      <div style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                  )}
                  {isCompleted && (
                    <span className="eps-thumb-check" aria-hidden>
                      <Check size={12} />
                    </span>
                  )}
                </div>

                <div className="eps-body">
                  <div className="eps-topline">
                    <span className="eps-num">E{ep.episodeNumber}</span>
                    {ep.durationMinutes != null && (
                      <span className="eps-dur">
                        <Clock size={11} />
                        {ep.durationMinutes}m
                      </span>
                    )}
                    {isUnreleased && (
                      <span className="eps-unreleased-label">
                        {ep.airDate && /^\d{4}-\d{2}-\d{2}$/.test(ep.airDate) ? `Airs ${ep.airDate}` : "Unreleased"}
                      </span>
                    )}
                    {isCompleted && <span className="eps-watched-label">Watched</span>}
                    {isInProgress && (
                      <span className="eps-progress-label">{Math.round(progress)}%</span>
                    )}
                  </div>
                  <h4 className="eps-title" title={ep.title}>
                    {ep.title}
                  </h4>
                  {ep.synopsis && <p className="eps-desc">{ep.synopsis}</p>}
                </div>

                <div className="eps-actions" onClick={(e) => e.stopPropagation()}>
                  {!isUnreleased && onDownloadEpisode && (
                    <button
                      type="button"
                      className="eps-icon-btn"
                      aria-label="Download episode"
                      onClick={() => onDownloadEpisode(ep)}
                    >
                      <Download size={15} />
                    </button>
                  )}
                  {!isUnreleased && (
                    <button
                      type="button"
                      className="eps-icon-btn primary"
                      aria-label="Play episode"
                      onClick={() => onPlayEpisode(ep)}
                    >
                      <Play size={14} className="fill-current" />
                    </button>
                  )}
                  {isUnreleased && (
                    <span className="eps-unreleased-hint">Not yet released</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
