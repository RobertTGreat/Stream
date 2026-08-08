import { useState } from "react";
import { Bookmark, Heart, Plus } from "lucide-react";
import { Collection, MediaItem } from "../types";
import { MediaCard } from "../components/MediaCard";

interface CollectionsViewProps {
  collections: Collection[];
  watchlistMedia: MediaItem[];
  favoriteMedia: MediaItem[];
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onAddNewCollection: (name: string, description: string) => void;
}

export function CollectionsView({
  collections,
  watchlistMedia,
  favoriteMedia,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
  onAddNewCollection,
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
          onClick={() => setActiveTab("watchlist")}
        >
          Watchlist ({watchlistMedia.length})
        </button>
        <button
          type="button"
          className={`genre-pill-btn ${activeTab === "favorites" ? "active" : ""}`}
          onClick={() => setActiveTab("favorites")}
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
          <div className="catalog-grid">
            {watchlistMedia.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onSelect={onSelectMedia}
                onPlay={onPlayMedia}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )
      ) : activeTab === "favorites" ? (
        favoriteMedia.length === 0 ? (
          <div className="empty-state">
            <Heart size={36} />
            <p>No favorite titles yet. Click the heart icon on any media card.</p>
          </div>
        ) : (
          <div className="catalog-grid">
            {favoriteMedia.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onSelect={onSelectMedia}
                onPlay={onPlayMedia}
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )
      ) : (
        <div className="collections-grid">
          {collections.map((col) => (
            <div key={col.id} className="collection-card">
              <div className="col-header flex items-center justify-between">
                <h4>{col.name}</h4>
                <span className="count-badge">{col.mediaIds.length} ITEMS</span>
              </div>
              <p className="col-desc">{col.description || "Custom media list"}</p>
            </div>
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
