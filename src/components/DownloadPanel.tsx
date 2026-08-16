import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Pause, Play, Trash2, ArrowDownCircle, HardDrive, Wifi, CheckCircle2, Download } from "lucide-react";
import { DownloadTask } from "../types";
import { Tooltip } from "./Tooltip";

interface DownloadPanelProps {
  tasks: DownloadTask[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onPlayStream: (task: DownloadTask) => void;
}

export function DownloadPanel({
  tasks,
  onPause,
  onResume,
  onCancel,
  onPlayStream,
}: DownloadPanelProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const formatSpeed = (bps: number) => {
    if (bps === 0) return "0 KB/s";
    const mbps = bps / (1024 * 1024);
    if (mbps >= 1) return `${mbps.toFixed(2)} MB/s`;
    return `${Math.round(bps / 1024)} KB/s`;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatEta = (secs: number) => {
    if (!secs || secs === 0) return "Done";
    if (secs > 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    if (secs > 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${secs}s`;
  };

  const totalSpeedBps = tasks.reduce((sum, t) => sum + (t.status === "Downloading" ? t.download_speed_bps || 0 : 0), 0);
  const activeCount = tasks.filter((t) => t.status === "Downloading" || t.status === "Streaming").length;
  const completedCount = tasks.filter((t) => t.status === "Completed").length;

  const columns: ColumnDef<DownloadTask>[] = [
    {
      accessorKey: "title",
      header: "Media & File",
      cell: (info) => (
        <div className="dl-title-cell">
          <span className="dl-task-title" title={String(info.getValue())}>
            {String(info.getValue())}
          </span>
          <div className="dl-tags">
            <span className="dl-media-type">{info.row.original.media_type.toUpperCase()}</span>
            <span className="dl-save-path">{info.row.original.save_path}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "progress",
      header: "Progress",
      cell: (info) => {
        const val = Math.round(Number(info.getValue()));
        const isComp = info.row.original.status === "Completed";
        return (
          <div className="dl-progress-cell">
            <div className="dl-progress-header">
              <span className={`dl-percentage ${isComp ? "text-emerald-400" : ""}`}>{val}%</span>
              <span className="dl-size-info">
                {formatBytes(info.row.original.downloaded_bytes)} / {formatBytes(info.row.original.total_bytes)}
              </span>
            </div>
            <div className="dl-progress-track">
              <div
                className={`dl-progress-fill ${isComp ? "completed" : ""}`}
                style={{ width: `${val}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "download_speed_bps",
      header: "Speed / Status",
      cell: (info) => (
        <div className="dl-speed-cell">
          {info.row.original.status === "Downloading" ? (
            <>
              <span className="dl-speed text-emerald-400 font-semibold">
                {formatSpeed(Number(info.getValue()))}
              </span>
              <span className="dl-eta text-zinc-400">
                ETA: {formatEta(info.row.original.eta_seconds)}
              </span>
            </>
          ) : info.row.original.status === "Completed" ? (
            <span className="dl-status-badge completed">
              <CheckCircle2 size={12} />
              <span>Finished</span>
            </span>
          ) : (
            <span className={`dl-status-badge ${info.row.original.status.toLowerCase()}`}>
              {info.row.original.status}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "seeders",
      header: "Peers",
      cell: (info) => (
        <div className="dl-peers-cell">
          <span className="text-emerald-400 font-medium">{String(info.getValue())} S</span>
          <span className="text-zinc-500">/ {info.row.original.peers} P</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const task = info.row.original;
        const isDownloading = task.status === "Downloading" || task.status === "Streaming";

        return (
          <div className="dl-action-btns">
            {task.stream_url && task.status !== "Completed" && (
              <Tooltip label="Stream Now" side="left">
                <button
                  type="button"
                  className="dl-btn stream"
                  onClick={() => onPlayStream(task)}
                >
                  <Play size={13} className="fill-current" />
                </button>
              </Tooltip>
            )}

            {isDownloading ? (
              <Tooltip label="Pause Download" side="left">
                <button type="button" className="dl-btn" onClick={() => onPause(task.id)}>
                  <Pause size={13} />
                </button>
              </Tooltip>
            ) : task.status === "Paused" ? (
              <Tooltip label="Resume Download" side="left">
                <button type="button" className="dl-btn primary" onClick={() => onResume(task.id)}>
                  <Play size={13} className="fill-current" />
                </button>
              </Tooltip>
            ) : null}

            <Tooltip label="Cancel & Remove" side="left">
              <button type="button" className="dl-btn danger" onClick={() => onCancel(task.id)}>
                <Trash2 size={13} />
              </button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: tasks,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="view-container download-panel-view">
      {/* Top Stats Banner */}
      <div className="dl-stats-strip">
        <div className="dl-stat-box">
          <div className="dl-stat-icon-wrap">
            <Download size={18} className="text-purple-400" />
          </div>
          <div className="dl-stat-content">
            <span className="dl-stat-label">Active Downloads</span>
            <span className="dl-stat-val">{activeCount}</span>
          </div>
        </div>

        <div className="dl-stat-box">
          <div className="dl-stat-icon-wrap">
            <Wifi size={18} className="text-emerald-400" />
          </div>
          <div className="dl-stat-content">
            <span className="dl-stat-label">Total Bandwidth</span>
            <span className="dl-stat-val text-emerald-400">{formatSpeed(totalSpeedBps)}</span>
          </div>
        </div>

        <div className="dl-stat-box">
          <div className="dl-stat-icon-wrap">
            <HardDrive size={18} className="text-blue-400" />
          </div>
          <div className="dl-stat-content">
            <span className="dl-stat-label">Completed Files</span>
            <span className="dl-stat-val text-blue-400">{completedCount}</span>
          </div>
        </div>
      </div>

      <div className="panel-top-bar">
        <div className="top-title">
          <h2>Download Queue</h2>
          <span className="task-count-badge">{tasks.length} Total</span>
        </div>

        <div className="top-search">
          <input
            type="text"
            placeholder="Search downloads..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="panel-search-input"
          />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="dl-empty-state">
          <div className="dl-empty-icon-wrap">
            <ArrowDownCircle size={38} className="text-purple-400/80" />
          </div>
          <h3>No Downloads Active</h3>
          <p>Start downloading media or streaming torrents to manage your queue and background tasks here.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="tanstack-table downloads-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
