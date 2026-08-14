import { useState, useMemo } from "react";
import {
  Clock,
  CheckCircle2,
  Tv,
  Film,
  Sparkles,
  Trash2,
  Search,
  Play,
  Filter,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { StreamProgress, MediaType } from "../types";
import { Tooltip } from "../components/Tooltip";

interface StatsViewProps {
  watchHistory: StreamProgress[];
  onResumeStream?: (progress: StreamProgress) => void;
  onDeleteProgress?: (mediaId: string, episodeNumber?: number) => void;
  onClearHistory?: () => void;
}

export function StatsView({
  watchHistory,
  onResumeStream,
  onDeleteProgress,
  onClearHistory,
}: StatsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MediaType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "in_progress">("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Overall statistics
  const totalWatchedCount = watchHistory.length;
  const completedEpisodes = watchHistory.filter((item) => item.percentage >= 90).length;
  const completionRate = totalWatchedCount > 0 ? Math.round((completedEpisodes / totalWatchedCount) * 100) : 0;

  const totalMinutesWatched = Math.round(
    watchHistory.reduce((acc, curr) => acc + (curr.currentTime || 0), 0) / 60
  );
  const totalHours = (totalMinutesWatched / 60).toFixed(1);

  // Category breakdowns (Anime vs Movie vs TV)
  const animeHistory = useMemo(() => watchHistory.filter((item) => item.mediaType === "anime"), [watchHistory]);
  const movieHistory = useMemo(() => watchHistory.filter((item) => item.mediaType === "movie"), [watchHistory]);
  const tvHistory = useMemo(() => watchHistory.filter((item) => item.mediaType === "tv"), [watchHistory]);

  const animeMinutes = Math.round(animeHistory.reduce((acc, curr) => acc + (curr.currentTime || 0), 0) / 60);
  const movieMinutes = Math.round(movieHistory.reduce((acc, curr) => acc + (curr.currentTime || 0), 0) / 60);
  const tvMinutes = Math.round(tvHistory.reduce((acc, curr) => acc + (curr.currentTime || 0), 0) / 60);

  const animeHours = (animeMinutes / 60).toFixed(1);
  const movieHours = (movieMinutes / 60).toFixed(1);
  const tvHours = (tvMinutes / 60).toFixed(1);

  const totalMins = animeMinutes + movieMinutes + tvMinutes || 1;
  const animePct = Math.round((animeMinutes / totalMins) * 100);
  const moviePct = Math.round((movieMinutes / totalMins) * 100);
  const tvPct = 100 - animePct - moviePct;

  // Filtered history list
  const filteredHistory = useMemo(() => {
    return watchHistory.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.mediaTitle.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        `episode ${item.episodeNumber}`.includes(searchQuery.trim().toLowerCase());

      const matchesType = filterType === "all" || item.mediaType === filterType;

      const isCompleted = item.percentage >= 90;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "completed" && isCompleted) ||
        (filterStatus === "in_progress" && !isCompleted);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [watchHistory, searchQuery, filterType, filterStatus]);

  return (
    <div className="view-container stats-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Watch Statistics & History</h1>
          <p className="subtitle">Insights into your viewing habits, playback distribution, and media history</p>
        </div>

        {watchHistory.length > 0 && onClearHistory && (
          <div className="filter-controls">
            <button
              type="button"
              className="btn-secondary text-rose-400 hover:text-rose-300 hover:border-rose-800"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 size={13} />
              <span>Clear History</span>
            </button>
          </div>
        )}
      </div>

      {/* Primary KPI Grid */}
      <div className="stats-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box">
            <Clock size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-value">{totalHours} hrs</span>
            <span className="kpi-label">Total Time Watched</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box success">
            <CheckCircle2 size={20} className="text-emerald-400" />
          </div>
          <div className="kpi-data">
            <span className="kpi-value">{completedEpisodes} / {totalWatchedCount}</span>
            <span className="kpi-label">Completed ({completionRate}%)</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box purple">
            <BarChart3 size={20} className="text-purple-400" />
          </div>
          <div className="kpi-data">
            <span className="kpi-value">{totalWatchedCount}</span>
            <span className="kpi-label">Tracked Sessions</span>
          </div>
        </div>
      </div>

      {/* Media Type Breakdown Cards */}
      <div className="stats-categories-grid">
        <div className="category-stat-card anime-card">
          <div className="cat-header">
            <div className="cat-title-group">
              <Sparkles size={16} className="text-purple-400" />
              <h4>Anime</h4>
            </div>
            <span className="cat-pct">{animePct}%</span>
          </div>
          <div className="cat-metrics">
            <span className="cat-hours">{animeHours} hrs</span>
            <span className="cat-count">{animeHistory.length} sessions</span>
          </div>
          <div className="cat-progress-track">
            <div className="cat-progress-fill anime" style={{ width: `${animePct}%` }} />
          </div>
        </div>

        <div className="category-stat-card movie-card">
          <div className="cat-header">
            <div className="cat-title-group">
              <Film size={16} className="text-blue-400" />
              <h4>Cinema Movies</h4>
            </div>
            <span className="cat-pct">{moviePct}%</span>
          </div>
          <div className="cat-metrics">
            <span className="cat-hours">{movieHours} hrs</span>
            <span className="cat-count">{movieHistory.length} films</span>
          </div>
          <div className="cat-progress-track">
            <div className="cat-progress-fill movie" style={{ width: `${moviePct}%` }} />
          </div>
        </div>

        <div className="category-stat-card tv-card">
          <div className="cat-header">
            <div className="cat-title-group">
              <Tv size={16} className="text-emerald-400" />
              <h4>TV Shows & Series</h4>
            </div>
            <span className="cat-pct">{tvPct}%</span>
          </div>
          <div className="cat-metrics">
            <span className="cat-hours">{tvHours} hrs</span>
            <span className="cat-count">{tvHistory.length} episodes</span>
          </div>
          <div className="cat-progress-track">
            <div className="cat-progress-fill tv" style={{ width: `${tvPct}%` }} />
          </div>
        </div>
      </div>

      {/* Interactive History Section */}
      <section className="stats-section">
        <div className="history-toolbar">
          <div className="history-title-row">
            <h3 className="section-subtitle">Playback History Log</h3>
            <span className="text-xs text-zinc-500">
              Showing {filteredHistory.length} of {watchHistory.length} items
            </span>
          </div>

          <div className="history-filters-row">
            {/* Search Input */}
            <div className="history-search-wrap">
              <Search size={14} className="text-zinc-500" />
              <input
                type="text"
                placeholder="Search history by title or episode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="history-search-input"
              />
            </div>

            {/* Type Filter Tabs */}
            <div className="history-type-pills">
              {(["all", "anime", "movie", "tv"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`history-filter-pill ${filterType === t ? "active" : ""}`}
                  onClick={() => setFilterType(t)}
                >
                  {t === "all" ? "All Media" : t.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Status Filter Tabs */}
            <div className="history-status-select-wrap">
              <Filter size={13} className="text-zinc-500" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="history-status-select"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed (90%+)</option>
                <option value="in_progress">In Progress (&lt;90%)</option>
              </select>
            </div>
          </div>
        </div>

        {watchHistory.length === 0 ? (
          <div className="empty-state">
            <Clock size={36} className="text-zinc-600 mb-2" />
            <h3>No Watch History Yet</h3>
            <p>Start streaming anime, movies, or series to record viewing insights and history.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="empty-state">
            <p>No history entries match your current search and filters.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="tanstack-table history-table">
              <thead>
                <tr>
                  <th>Media Title</th>
                  <th>Episode</th>
                  <th>Type</th>
                  <th>Completion Progress</th>
                  <th>Last Watched</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item, idx) => {
                  const isCompleted = item.percentage >= 90;
                  return (
                    <tr key={`${item.mediaId}_${item.episodeNumber}_${idx}`}>
                      <td>
                        <div className="history-media-title-cell">
                          {item.coverImage && (
                            <img src={item.coverImage} alt="" className="history-thumb-tiny" />
                          )}
                          <span className="font-medium text-zinc-200" title={item.mediaTitle}>
                            {item.mediaTitle}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-zinc-400 font-mono">
                          {item.mediaType === "movie" ? "Film" : `EP ${item.episodeNumber}`}
                        </span>
                      </td>
                      <td>
                        <span className={`format-badge format-${item.mediaType}`}>
                          {item.mediaType.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="history-progress-cell">
                          <div className="history-progress-track">
                            <div
                              className={`history-progress-fill ${isCompleted ? "completed" : ""}`}
                              style={{ width: `${Math.min(100, item.percentage)}%` }}
                            />
                          </div>
                          <span className="history-pct-label font-mono">
                            {item.percentage}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-zinc-500">
                          {new Date(item.lastUpdated).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <div className="history-action-btns">
                          {onResumeStream && (
                            <Tooltip label="Resume / Play" side="left">
                              <button
                                type="button"
                                className="history-action-btn play"
                                onClick={() => onResumeStream(item)}
                              >
                                <Play size={12} className="fill-current" />
                              </button>
                            </Tooltip>
                          )}
                          {onDeleteProgress && (
                            <Tooltip label="Remove Entry" side="left">
                              <button
                                type="button"
                                className="history-action-btn delete"
                                onClick={() => onDeleteProgress(item.mediaId, item.episodeNumber)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-backdrop" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-content clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} />
                <h3>Clear Entire Watch History?</h3>
              </div>
            </div>
            <div className="modal-body space-y-3">
              <p className="text-sm text-zinc-300">
                This will permanently delete all {watchHistory.length} recorded watch sessions and reset your stats.
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary bg-rose-600 hover:bg-rose-500 border-none"
                  onClick={() => {
                    if (onClearHistory) onClearHistory();
                    setShowClearConfirm(false);
                  }}
                >
                  Clear All History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
