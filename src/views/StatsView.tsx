import { Clock, CheckCircle, Tv } from "lucide-react";
import { StreamProgress } from "../types";

interface StatsViewProps {
  watchHistory: StreamProgress[];
}

export function StatsView({ watchHistory }: StatsViewProps) {
  const totalWatchedCount = watchHistory.length;
  const completedEpisodes = watchHistory.filter((item) => item.percentage >= 90).length;
  const totalMinutesWatched = Math.round(
    watchHistory.reduce((acc, curr) => acc + (curr.currentTime || 0), 0) / 60
  );
  const totalHours = (totalMinutesWatched / 60).toFixed(1);

  return (
    <div className="view-container stats-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Watch Statistics & History</h1>
          <p className="subtitle">Insights into your viewing habits and playback activity</p>
        </div>
      </div>

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
          <div className="kpi-icon-box">
            <CheckCircle size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-value">{completedEpisodes}</span>
            <span className="kpi-label">Completed Episodes</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box">
            <Tv size={20} />
          </div>
          <div className="kpi-data">
            <span className="kpi-value">{totalWatchedCount}</span>
            <span className="kpi-label">Tracked Sessions</span>
          </div>
        </div>
      </div>

      <section className="stats-section">
        <h3 className="section-subtitle">Recent Watch History</h3>

        {watchHistory.length === 0 ? (
          <div className="empty-state">
            <p>No watch history recorded yet. Start watching media to track statistics.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="tanstack-table">
              <thead>
                <tr>
                  <th>Media Title</th>
                  <th>Episode</th>
                  <th>Type</th>
                  <th>Completion</th>
                  <th>Last Watched</th>
                </tr>
              </thead>
              <tbody>
                {watchHistory.map((item, idx) => (
                  <tr key={`${item.mediaId}_${idx}`}>
                    <td>
                      <span className="font-medium text-zinc-200">{item.mediaTitle}</span>
                    </td>
                    <td>
                      <span className="text-zinc-400">EP {item.episodeNumber}</span>
                    </td>
                    <td>
                      <span className="format-badge">{item.mediaType.toUpperCase()}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="history-progress-track">
                          <div
                            className="history-progress-fill"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400">{item.percentage}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-zinc-500">
                        {new Date(item.lastUpdated).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
