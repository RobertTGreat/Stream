import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { X, Download, Play, RefreshCw, Film, FileVideo, ArrowLeft } from "lucide-react";
import { TorrentFileItem, TorrentResult } from "../types";
import { Tooltip } from "./Tooltip";

interface TorrentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  torrents: TorrentResult[];
  isLoading: boolean;
  multiFiles?: TorrentFileItem[] | null;
  multiFileTorrentTitle?: string | null;
  onSelectStream: (torrent: TorrentResult) => void;
  onSelectFileStream?: (fileIndex: number) => void;
  onBackToTorrents?: () => void;
  onSelectDownload: (torrent: TorrentResult) => void;
}

export function TorrentPickerModal({
  isOpen,
  onClose,
  title,
  torrents,
  isLoading,
  multiFiles,
  multiFileTorrentTitle,
  onSelectStream,
  onSelectFileStream,
  onBackToTorrents,
  onSelectDownload,
}: TorrentPickerModalProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "seeders", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [customMagnet, setCustomMagnet] = useState("");

  const handleCustomMagnetStream = () => {
    if (!customMagnet.trim() || !customMagnet.includes("magnet:?")) return;
    onSelectStream({
      id: `custom_magnet_${Date.now()}`,
      title: title || "Custom Magnet Stream",
      magnet_url: customMagnet.trim(),
      size_bytes: 0,
      size_formatted: "Unknown",
      seeders: 1,
      leechers: 0,
      quality: "Direct Magnet",
      source_name: "Custom Magnet",
      date_posted: "Now",
      media_type: "anime",
    });
    setCustomMagnet("");
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1_073_741_824) {
      return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    }
    if (bytes >= 1_048_576) {
      return `${(bytes / 1_048_576).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const columns: ColumnDef<TorrentResult>[] = [
    {
      accessorKey: "title",
      header: "Release Title",
      cell: (info) => (
        <div className="torrent-title-cell">
          <span className="torrent-release-name" title={String(info.getValue())}>
            {String(info.getValue())}
          </span>
          <div className="torrent-tags">
            {info.row.original.is_best_release && (
              <span className="best-badge">BEST</span>
            )}
            <span className="quality-badge">{info.row.original.quality}</span>
            <span className="source-badge">{info.row.original.source_name}</span>
            {info.row.original.release_group && (
              <span className="group-badge">{info.row.original.release_group}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "size_formatted",
      header: "Size",
      cell: (info) => <span className="size-cell">{String(info.getValue())}</span>,
    },
    {
      accessorKey: "seeders",
      header: "Seeds",
      cell: (info) => (
        <span className="seeders-cell text-emerald-400 font-semibold">
          {String(info.getValue())}
        </span>
      ),
    },
    {
      accessorKey: "leechers",
      header: "Peers",
      cell: (info) => <span className="peers-cell text-zinc-400">{String(info.getValue())}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <div className="torrent-action-btns">
          <Tooltip label="Play Stream" side="left">
            <button
              type="button"
              className="torrent-btn stream"
              onClick={() => onSelectStream(info.row.original)}
            >
              <Play size={13} className="fill-current" />
              <span>Stream</span>
            </button>
          </Tooltip>

          <Tooltip label="Download to Queue" side="left">
            <button
              type="button"
              className="torrent-btn download"
              onClick={() => onSelectDownload(info.row.original)}
            >
              <Download size={13} />
              <span>Download</span>
            </button>
          </Tooltip>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: torrents,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content torrent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-titles">
            {multiFiles ? (
              <div className="flex items-center gap-2">
                {onBackToTorrents && (
                  <button
                    type="button"
                    onClick={onBackToTorrents}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h3>Select Video File to Stream</h3>
              </div>
            ) : (
              <h3>Torrent Streams & Downloads</h3>
            )}
            <p className="subtitle">{multiFileTorrentTitle || title}</p>
          </div>

          <div className="header-actions flex items-center gap-2">
            {!multiFiles && (
              <input
                type="text"
                placeholder="Filter resolution/group..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="modal-filter-input"
              />
            )}
            <button type="button" className="close-modal-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {!multiFiles && (
            <div className="custom-magnet-bar flex items-center gap-2 mb-4 bg-zinc-900/90 p-2 rounded-lg border border-zinc-800">
              <input
                type="text"
                placeholder="Paste direct magnet link (magnet:?xt=urn:btih:...)"
                value={customMagnet}
                onChange={(e) => setCustomMagnet(e.target.value)}
                className="flex-1 bg-zinc-950 px-3 py-1.5 rounded text-xs text-zinc-200 border border-zinc-800 focus:outline-none focus:border-purple-500 font-mono"
              />
              <button
                type="button"
                onClick={handleCustomMagnetStream}
                disabled={!customMagnet.trim().includes("magnet:?")}
                className="btn-primary py-1 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play size={12} className="fill-current" />
                <span>Stream Magnet</span>
              </button>
            </div>
          )}
          {multiFiles ? (
            <div className="multi-file-picker space-y-2">
              <p className="text-xs text-zinc-400 mb-3">
                This torrent contains multiple files. Pick a video file to start stream prioritization:
              </p>
              <div className="file-list max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {multiFiles.map((file) => (
                  <div
                    key={file.index}
                    onClick={() => file.is_video && onSelectFileStream?.(file.index)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      file.is_video
                        ? "bg-zinc-900/90 hover:bg-purple-950/40 border-zinc-800 hover:border-purple-500/50 cursor-pointer"
                        : "bg-zinc-950/40 border-zinc-900 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      {file.is_video ? (
                        <FileVideo size={18} className="text-purple-400 flex-shrink-0" />
                      ) : (
                        <Film size={18} className="text-zinc-600 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-zinc-200 truncate" title={file.name}>
                        {file.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <span className="text-xs text-zinc-400 font-mono">{formatSize(file.length)}</span>
                      {file.is_video && (
                        <button
                          type="button"
                          className="torrent-btn stream py-1 px-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectFileStream?.(file.index);
                          }}
                        >
                          <Play size={12} className="fill-current" />
                          <span>Stream</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isLoading ? (
            <div className="loading-state">
              <RefreshCw size={24} className="spin-icon text-zinc-400 mb-2" />
              <p>Searching indexers for best high-speed streams...</p>
            </div>
          ) : torrents.length === 0 ? (
            <div className="empty-state">
              <p>No indexer results found. Try adjusting settings or indexers.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="tanstack-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className={header.column.getCanSort() ? "sortable" : ""}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: " 🔼",
                            desc: " 🔽",
                          }[header.column.getIsSorted() as string] ?? null}
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
      </div>
    </div>
  );
}
