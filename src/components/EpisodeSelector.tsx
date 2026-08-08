import { useMemo, useState } from "react";
import { Play, Check, Clock, Download, Search } from "lucide-react";
import { Episode } from "../types";
import { Tooltip } from "./Tooltip";
import { MediaImage } from "./MediaImage";

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
  seasonsCount = 1,
  onPlayEpisode,
  onDownloadEpisode,
  watchedEpisodes = {},
  onContextMenu,
}: EpisodeSelectorProps) {
  const derivedSeasons = useMemo(() => {
    const fromEps = new Set(
      episodes.map((e) => e.seasonNumber || 1).filter(Boolean) as number[]
    );
    const max = Math.max(seasonsCount || 1, ...Array.from(fromEps), 1);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [episodes, seasonsCount]);

  const [selectedSeason, setSelectedSeason] = useState(derivedSeasons[0] || 1);
  const [searchFilter, setSearchFilter] = useState("");

  const filteredEpisodes = episodes.filter((ep) => {
    const season = ep.seasonNumber || 1;
    const matchesSeason = derivedSeasons.length <= 1 ? true : season === selectedSeason;
    const q = searchFilter.trim().toLowerCase();
    const matchesQuery =
      q === "" ||
      ep.title.toLowerCase().includes(q) ||
      `episode ${ep.episodeNumber}`.includes(q) ||
      String(ep.episodeNumber) === q;
    return matchesSeason && matchesQuery;
  });

  return (
    <div className="eps-panel">
      <div className="eps-toolbar">
        {derivedSeasons.length > 1 && (
          <div className="eps-season-pills" role="tablist" aria-label="Seasons">
            {derivedSeasons.map((seasonNum) => {
              const count = episodes.filter((e) => (e.seasonNumber || 1) === seasonNum).length;
              return (
                <button
                  key={seasonNum}
                  type="button"
                  role="tab"
                  aria-selected={selectedSeason === seasonNum}
                  className={`eps-season-pill ${selectedSeason === seasonNum ? "is-active" : ""}`}
                  onClick={() => setSelectedSeason(seasonNum)}
                >
                  <span>S{seasonNum}</span>
                  {count > 0 && <span className="eps-season-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}

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
      </div>

      {filteredEpisodes.length === 0 ? (
        <div className="eps-empty">No episodes match this filter.</div>
      ) : (
        <div className="eps-list">
          {filteredEpisodes.map((ep) => {
            const progress = watchedEpisodes[ep.episodeNumber] || 0;
            const isCompleted = progress >= 90;
            const isInProgress = progress > 0 && !isCompleted;

            return (
              <article
                key={ep.id}
                className={`eps-row ${isCompleted ? "is-watched" : ""} ${isInProgress ? "is-progress" : ""}`}
                onClick={() => onPlayEpisode(ep)}
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
                  <div className="eps-thumb-hover">
                    <Play size={16} className="fill-current" />
                  </div>
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
                  {onDownloadEpisode && (
                    <button
                      type="button"
                      className="eps-icon-btn"
                      aria-label="Download episode"
                      onClick={() => onDownloadEpisode(ep)}
                    >
                      <Download size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="eps-icon-btn primary"
                    aria-label="Play episode"
                    onClick={() => onPlayEpisode(ep)}
                  >
                    <Play size={14} className="fill-current" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
