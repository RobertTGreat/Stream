import { useMemo, useState } from "react";
import { Bookmark, Heart, Plus, Trash2, ArrowLeft } from "lucide-react";
import { Collection, MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";
import { StorageService } from "../services/storage";

interface CollectionsViewProps {
  collections: Collection[];
  watchlistMedia: MediaItem[];
  favoriteMedia: MediaItem[];
  mediaPool?: MediaItem[];
  activeCollectionId?: string | null;
  onOpenCollection?: (id: string | null) => void;
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchlist?: (id: string) => void;
  onMarkWatched?: (item: MediaItem, watched: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem) => void;
  onAddNewCollection: (name: string, description: string) => void;
  onDeleteCollection?: (id: string) => void;
  onRemoveFromCollection?: (collectionId: string, mediaId: string) => void;
}

export function CollectionsView({
  collections,
  watchlistMedia,
  favoriteMedia,
  mediaPool = [],
  activeCollectionId = null,
  onOpenCollection,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onToggleWatchlist,
  onMarkWatched,
  onContextMenu,
  onAddNewCollection,
  onDeleteCollection,
  onRemoveFromCollection,
}: CollectionsViewProps) {
  const [activeTab, setActiveTab] = useState<"watchlist" | "favorites" | "collections">("watchlist");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");

  const handleCreate = () => {
    if (!newColName.trim()) return;
    onAddNewCollection(newColName.trim(), newColDesc.trim());
    setNewColName("");
    setNewColDesc("");
    setShowCreateModal(false);
  };

  const activeCollection = collections.find((c) => c.id === activeCollectionId) || null;
  const collectionItems = useMemo(() => {
    if (!activeCollection) return [];
    return StorageService.resolveMediaList(activeCollection.mediaIds, mediaPool);
  }, [activeCollection, mediaPool]);

  const renderGrid = (items: MediaItem[]) => (
    <div className="catalog-grid">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          onSelect={onSelectMedia}
          onPlay={onPlayMedia}
          isFavorite={favorites.includes(item.id)}
          onToggleFavorite={onToggleFavorite}
          onToggleWatchlist={onToggleWatchlist}
          onMarkWatched={onMarkWatched}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );

  return (
    <div className="view-container collections-view">
      <div className="catalog-header">
        <div className="title-area">
          <h1>Collections & Bookmarks</h1>
          <p className="subtitle">Your saved watchlist, favorites and custom media sets</p>
        </div>

        <div className="filter-controls">
          <button type="button" className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      <div className="genre-pills-bar">
        <button
          type="button"
          className={`genre-pill-btn ${activeTab === "watchlist" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("watchlist");
            onOpenCollection?.(null);
          }}
        >
          Watchlist ({watchlistMedia.length})
        </button>
        <button
          type="button"
          className={`genre-pill-btn ${activeTab === "favorites" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("favorites");
            onOpenCollection?.(null);
          }}
        >
          Favorites ({favoriteMedia.length})
        </button>
        <button
          type="button"
          className={`genre-pill-btn ${activeTab === "collections" ? "active" : ""}`}
          onClick={() => setActiveTab("collections")}
        >
          Custom Collections ({collections.length})
        </button>
      </div>

      {activeTab === "watchlist" ? (
        watchlistMedia.length === 0 ? (
          <div className="empty-state">
            <Bookmark size={36} />
            <p>Your watchlist is empty. Add titles to watch them later.</p>
          </div>
        ) : (
          renderGrid(watchlistMedia)
        )
      ) : activeTab === "favorites" ? (
        favoriteMedia.length === 0 ? (
          <div className="empty-state">
            <Heart size={36} />
            <p>No favorite titles yet. Click the heart icon on any media card.</p>
          </div>
        ) : (
          renderGrid(favoriteMedia)
        )
      ) : activeCollection ? (
        <div>
          <div className="catalog-header" style={{ paddingTop: 0 }}>
            <div className="title-area">
              <button type="button" className="btn-secondary" onClick={() => onOpenCollection?.(null)}>
                <ArrowLeft size={14} />
                <span>All collections</span>
              </button>
              <h2 style={{ marginTop: 12 }}>{activeCollection.name}</h2>
              <p className="subtitle">{activeCollection.description || "Custom media list"}</p>
            </div>
            {onDeleteCollection && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onDeleteCollection(activeCollection.id)}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            )}
          </div>
          {collectionItems.length === 0 ? (
            <div className="empty-state">
              <p>Nothing in this collection yet. Right-click a title and choose Add to collection.</p>
            </div>
          ) : (
            <div className="catalog-grid">
              {collectionItems.map((item) => (
                <div key={item.id} className="relative">
                  <MediaCard
                    item={item}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    isFavorite={favorites.includes(item.id)}
                    onToggleFavorite={onToggleFavorite}
                    onToggleWatchlist={onToggleWatchlist}
                    onMarkWatched={onMarkWatched}
                    onContextMenu={onContextMenu}
                  />
                  {onRemoveFromCollection && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: 8 }}
                      onClick={() => onRemoveFromCollection(activeCollection.id, item.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="collections-grid">
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              className="collection-card"
              onClick={() => {
                setActiveTab("collections");
                onOpenCollection?.(col.id);
              }}
            >
              <div className="col-header flex items-center justify-between">
                <h4>{col.name}</h4>
                <span className="count-badge">{col.mediaIds.length} ITEMS</span>
              </div>
              <p className="col-desc">{col.description || "Custom media list"}</p>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content col-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Custom Collection</h3>
            </div>
            <div className="modal-body space-y-3">
              <div>
                <label className="input-label">Collection Name</label>
                <input
                  type="text"
                  placeholder="e.g. Cyberpunk Vibes..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="modal-text-input"
                />
              </div>
              <div>
                <label className="input-label">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Neon aesthetic films and futuristic series"
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="modal-text-input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleCreate}>
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
