import {
  Play,
  Download,
  Star,
  Plus,
  Check,
  Heart,
  ArrowLeft,
  Calendar,
  Tv,
  Users,
  Clapperboard,
} from "lucide-react";
import { Episode, MediaItem } from "../types";
import { EpisodeSelector } from "../components/EpisodeSelector";
import { Tooltip } from "../components/Tooltip";
import { getHeroImageUrl, upgradeImageUrl } from "../utils/mediaImages";
import { MediaImage } from "../components/MediaImage";
import { QuickActionPlusMenu } from "../components/QuickActionPlusMenu";

interface MediaDetailViewProps {
  media: MediaItem;
  episodes: Episode[];
  onBack: () => void;
  onOpenTorrentModal: (actionType: "stream" | "download", ep?: Episode) => void;
  onPlayEpisode: (ep: Episode) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  isInWatchlist: boolean;
  onToggleWatchlist: (id: string) => void;
  watchedEpisodes?: Record<number, number>;
  onContextMenu?: (e: React.MouseEvent, media: MediaItem, ep?: Episode) => void;
}

export function MediaDetailView({
  media,
  episodes,
  onBack,
  onOpenTorrentModal,
  onPlayEpisode,
  isFavorite,
  onToggleFavorite,
  isInWatchlist,
  onToggleWatchlist,
  watchedEpisodes = {},
  onContextMenu,
}: MediaDetailViewProps) {
  const isSingleEpisode = episodes.length <= 1 || media.mediaType === "movie";
  const watchedCount = Object.values(watchedEpisodes).filter((p) => p >= 90).length;

  return (
    <div className="detail-page">
      {/* Full-bleed cinematic header */}
      <header className="detail-top">
        <div className="detail-top-bg">
          <img
            src={getHeroImageUrl(media)}
            alt=""
            className="detail-top-img"
            decoding="async"
          />
          <div className="detail-top-scrim" />
        </div>

        <div className="detail-top-inner">
          <button type="button" className="detail-back" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          <div className="detail-hero-row">
            <div className="detail-poster">
              <MediaImage
                src={upgradeImageUrl(media.coverImage) || media.coverImage}
                alt={media.title}
                emptyLabel="No cover"
              />
            </div>

            <div className="detail-info">
              <div className="detail-chips">
                <span className="detail-chip">{media.format || media.mediaType}</span>
                {media.status && (
                  <span className="detail-chip muted">
                    {media.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                )}
                {media.year && (
                  <span className="detail-chip muted">
                    <Calendar size={11} /> {media.year}
                  </span>
                )}
                {media.score != null && (
                  <span className="detail-chip score">
                    <Star size={11} className="fill-current" />
                    {media.score}
                  </span>
                )}
                {media.studio && (
                  <span className="detail-chip muted">{media.studio}</span>
                )}
              </div>

              <h1 className="detail-heading">{media.title}</h1>
              {media.japaneseTitle && (
                <p className="detail-subheading">{media.japaneseTitle}</p>
              )}

              {media.genres.length > 0 && (
                <div className="detail-genres">
                  {media.genres.map((g) => (
                    <span key={g} className="detail-genre">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {media.synopsis && (
                <p className="detail-blurb">{media.synopsis}</p>
              )}

              <div className="detail-cta">
                <button
                  type="button"
                  className="detail-btn-play"
                  onClick={() => onOpenTorrentModal("stream")}
                >
                  <Play size={15} className="fill-current" />
                  <span>{isSingleEpisode ? "Play" : "Play series"}</span>
                </button>

                <button
                  type="button"
                  className="detail-btn-ghost"
                  onClick={() => onOpenTorrentModal("download")}
                >
                  <Download size={15} />
                  <span>{isSingleEpisode ? "Download" : "Download series"}</span>
                </button>

                <QuickActionPlusMenu
                  mediaId={media.id}
                  mediaTitle={media.title}
                  mediaType={media.mediaType}
                  coverImage={media.coverImage}
                  isFavorite={isFavorite}
                  onToggleFavorite={onToggleFavorite}
                  onToggleWatchlist={onToggleWatchlist}
                  buttonClassName="detail-btn-icon"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-body">
        {media.cast && media.cast.length > 0 && (
          <section className="detail-block">
            <div className="detail-block-head">
              <Users size={15} />
              <h2>Cast</h2>
            </div>
            <div className="detail-cast-rail">
              {media.cast.map((member) => (
                <div key={member.name} className="detail-cast-card">
                  {member.avatar ? (
                    <img src={member.avatar} alt="" className="detail-cast-avatar" />
                  ) : (
                    <div className="detail-cast-fallback">{member.name.charAt(0)}</div>
                  )}
                  <span className="detail-cast-name" title={member.name}>
                    {member.name}
                  </span>
                  <span className="detail-cast-role">{member.role}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isSingleEpisode && (
          <section className="detail-block">
            <div className="detail-block-head">
              <Tv size={15} />
              <h2>Episodes</h2>
              <span className="detail-block-meta">
                {watchedCount > 0
                  ? `${watchedCount} / ${episodes.length} watched`
                  : `${episodes.length} episodes`}
              </span>
            </div>

            <EpisodeSelector
              episodes={episodes}
              seasonsCount={media.seasonsCount || 1}
              onPlayEpisode={onPlayEpisode}
              onDownloadEpisode={(ep) => onOpenTorrentModal("download", ep)}
              watchedEpisodes={watchedEpisodes}
              onContextMenu={(e, ep) => {
                if (onContextMenu) onContextMenu(e, media, ep);
              }}
            />
          </section>
        )}

        {isSingleEpisode && (
          <section className="detail-block">
            <div className="detail-block-head">
              <Clapperboard size={15} />
              <h2>{media.mediaType === "movie" ? "Movie" : "Title"}</h2>
            </div>
            <button
              type="button"
              className="detail-single-play"
              onClick={() => onOpenTorrentModal("stream")}
            >
              <div className="detail-single-thumb">
                <img src={getHeroImageUrl(media)} alt="" />
                <span className="detail-single-play-icon">
                  <Play size={22} className="fill-current" />
                </span>
              </div>
              <div className="detail-single-meta">
                <span className="detail-single-title">{media.title}</span>
                <span className="detail-single-sub">
                  {[media.year, media.format || media.mediaType, media.score != null ? `★ ${media.score}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
