import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Download,
  Star,
  ArrowLeft,
  Calendar,
  Tv,
  Users,
  Clapperboard,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Episode, MediaItem } from "../types";
import { EpisodeSelector } from "../components/EpisodeSelector";
import { getHeroImageUrl, upgradeImageUrl } from "../utils/mediaImages";
import { MediaImage } from "../components/MediaImage";
import { MediaCard } from "../components/MediaCard";
import { QuickActionPlusMenu } from "../components/QuickActionPlusMenu";
import { Tooltip } from "../components/Tooltip";
import { AniListService } from "../services/anilist";
import { TMDBService } from "../services/tmdb";

const handleOpenExternal = async (url: string) => {
  try {
    const plugin = await import("@tauri-apps/plugin-opener");
    if ("openUrl" in plugin) {
      await (plugin as any).openUrl(url);
    } else if ("open" in plugin) {
      await (plugin as any).open(url);
    } else {
      window.open(url, "_blank");
    }
  } catch {
    window.open(url, "_blank");
  }
};

function MalLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="3" width="20" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6 16V8.5l2.2 4.2L10.4 8.5V16M13.5 16V8.5h3.2M13.5 12.5h2.5M18 16V8.5h2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function AniListLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 19.5L12 4.5L19 19.5H14.8L12 13.5L9.2 19.5H5Z" fill="currentColor" />
      <path d="M12.8 11.5H18.8V14.5H12.8V11.5Z" fill="#02A9FF" />
    </svg>
  );
}

function ImdbLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size + 4} height={size - 4} viewBox="0 0 32 16" fill="currentColor">
      <rect width="32" height="16" rx="3" fill="#F5C518" />
      <path
        d="M4 3.5h2.2v9H4v-9zm4.2 0h2.4l1.4 5.2 1.4-5.2h2.4v9h-2V6.8l-1.3 5.7h-1L9.8 6.8v5.7h-1.6v-9zm8.6 0h3.2c1.8 0 2.8 1 2.8 2.8v3.4c0 1.8-1 2.8-2.8 2.8h-3.2v-9zm2 7.3h1.1c.8 0 1.1-.4 1.1-1.1V6.3c0-.7-.3-1.1-1.1-1.1h-1.1v5.6zm7.2-7.3h2.8c1.3 0 2 .6 2 1.7 0 .7-.3 1.2-.9 1.4.7.2 1.1.8 1.1 1.6 0 1.2-.8 1.9-2.2 1.9h-2.8v-6.6zm1.8 2.2h.9c.4 0 .6-.2.6-.5s-.2-.5-.6-.5h-.9v1zm0 3.3h1c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-1v1.2z"
        fill="#000"
      />
    </svg>
  );
}

function TmdbLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="3" stroke="#01b4e4" strokeWidth="2" />
      <path d="M6 9h3M7.5 9v6M11.5 9v6l2.5-3 2.5 3V9" stroke="#90cea1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TraktLogo({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke="#ed1c24" strokeWidth="1.8" />
      <path d="M7.5 8.5h9M12 8.5v8" stroke="#ed1c24" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function getExternalUrls(media: MediaItem) {
  const isAnime = media.mediaType === "anime";
  const isMovie = media.mediaType === "movie";
  const isTv = media.mediaType === "tv";

  // AniList URL
  let anilistUrl = "";
  if (media.anilistId) {
    anilistUrl = `https://anilist.co/anime/${media.anilistId}`;
  } else if (isAnime) {
    anilistUrl = `https://anilist.co/search/anime?search=${encodeURIComponent(media.title)}`;
  }

  // MAL URL
  let malUrl = "";
  if (media.malId) {
    malUrl = `https://myanimelist.net/anime/${media.malId}`;
  } else if (isAnime) {
    malUrl = `https://myanimelist.net/anime.php?q=${encodeURIComponent(media.title)}`;
  }

  // IMDb URL
  let imdbUrl = "";
  if (media.imdbId) {
    imdbUrl = `https://www.imdb.com/title/${media.imdbId}`;
  } else {
    imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(media.title)}`;
  }

  // TMDB URL
  let tmdbUrl = "";
  if (media.tmdbId && (isMovie || isTv)) {
    tmdbUrl = `https://www.themoviedb.org/${isMovie ? "movie" : "tv"}/${media.tmdbId}`;
  } else {
    tmdbUrl = `https://www.themoviedb.org/search?query=${encodeURIComponent(media.title)}`;
  }

  // Trakt URL
  let traktUrl = "";
  if (media.imdbId) {
    traktUrl = `https://trakt.tv/search/imdb/${media.imdbId}`;
  } else if (media.tmdbId) {
    traktUrl = `https://trakt.tv/search/tmdb/${media.tmdbId}?id_type=${isMovie ? "movie" : "show"}`;
  } else {
    traktUrl = `https://trakt.tv/search?query=${encodeURIComponent(media.title)}`;
  }

  return { anilistUrl, malUrl, imdbUrl, tmdbUrl, traktUrl };
}

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
  onSelectMedia?: (media: MediaItem) => void;
}

export function MediaDetailView({
  media,
  episodes,
  onBack,
  onOpenTorrentModal,
  onPlayEpisode,
  isFavorite,
  onToggleFavorite,
  onToggleWatchlist,
  watchedEpisodes = {},
  onContextMenu,
  onSelectMedia,
}: MediaDetailViewProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const isSingleEpisode = episodes.length <= 1 || media.mediaType === "movie";
  const watchedCount = Object.values(watchedEpisodes).filter((p) => p >= 90).length;
  const externalUrls = getExternalUrls(media);

  const recsRailRef = useRef<HTMLDivElement>(null);
  const [recsScrollState, setRecsScrollState] = useState({ canLeft: false, canRight: false });

  const updateRecsScroll = useCallback(() => {
    if (!recsRailRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = recsRailRef.current;
    setRecsScrollState({
      canLeft: scrollLeft > 5,
      canRight: scrollLeft + clientWidth < scrollWidth - 5,
    });
  }, []);

  useEffect(() => {
    const el = recsRailRef.current;
    if (!el) return;
    updateRecsScroll();
    el.addEventListener("scroll", updateRecsScroll, { passive: true });
    const ro = new ResizeObserver(updateRecsScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateRecsScroll);
      ro.disconnect();
    };
  }, [updateRecsScroll, recommendations]);

  const scrollRecs = (direction: 1 | -1) => {
    if (!recsRailRef.current) return;
    const amount = recsRailRef.current.clientWidth * 0.8 * direction;
    recsRailRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  useEffect(() => {
    let active = true;
    const fetchRecs = async () => {
      try {
        let recs: MediaItem[] = [];
        if (media.anilistId) {
          recs = await AniListService.fetchRecommendations(media.anilistId);
        } else if (media.tmdbId && (media.mediaType === "movie" || media.mediaType === "tv")) {
          recs = await TMDBService.fetchRecommendations(media.tmdbId, media.mediaType);
        }
        if (active) setRecommendations(recs);
      } catch {
        if (active) setRecommendations([]);
      }
    };
    void fetchRecs();
    return () => {
      active = false;
    };
  }, [media.id, media.anilistId, media.tmdbId, media.mediaType]);

  return (
    <div className="detail-page">
      {/* Full-bleed cinematic header */}
      <header className="detail-top">
        <button type="button" className="detail-back" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        <div className="detail-top-bg">
          <img
            src={getHeroImageUrl(media)}
            alt=""
            className="detail-top-img"
            decoding="async"
          />
          <div className="detail-top-scrim" />
        </div>
      </header>

      {/* Main Grid Layout: Floating Left Sidebar + Main Content Right */}
      <div className="detail-layout-container">
        {/* Floating Left Sidebar Section */}
        <aside className="detail-floating-left">
          {/* Poster Artwork */}
          <div className="detail-poster">
            <MediaImage
              src={upgradeImageUrl(media.coverImage) || media.coverImage}
              alt={media.title}
              emptyLabel="No cover"
            />
          </div>

          {/* Floating Metadata Card */}
          <div className="detail-floating-card">
            {/* Rating */}
            {media.score != null && (
              <div className="detail-info-group">
                <span className="detail-info-label">Rating</span>
                <div className="detail-rating-box">
                  <Star size={16} className="fill-current text-amber-400" />
                  <span className="detail-rating-score">{media.score}</span>
                  <span className="detail-rating-max">/ 10</span>
                </div>
              </div>
            )}

            {/* Release Date & Details */}
            {(media.year || media.status || media.format || media.studio) && (
              <div className="detail-info-group">
                <span className="detail-info-label">Release & Details</span>
                <div className="detail-meta-stack">
                  {media.year && (
                    <div className="detail-meta-row">
                      <Calendar size={13} className="text-zinc-400" />
                      <span>{media.year}</span>
                    </div>
                  )}
                  {media.status && (
                    <div className="detail-meta-row">
                      <span className="detail-status-dot" />
                      <span className="capitalize">
                        {media.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                  )}
                  {media.format && (
                    <div className="detail-meta-row">
                      <span className="detail-format-badge">{media.format}</span>
                    </div>
                  )}
                  {media.studio && (
                    <div className="detail-meta-row">
                      <Clapperboard size={13} className="text-zinc-400" />
                      <span className="text-zinc-300">{media.studio}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Genres */}
            {media.genres.length > 0 && (
              <div className="detail-info-group">
                <span className="detail-info-label">Genres</span>
                <div className="detail-genre-tags">
                  {media.genres.map((g) => (
                    <span key={g} className="detail-genre-tag">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* External Links */}
            <div className="detail-info-group">
              <span className="detail-info-label">External Pages</span>
              <div className="detail-ext-links">
                {externalUrls.anilistUrl && (
                  <Tooltip label="AniList" hint="Open on AniList" side="top">
                    <button
                      type="button"
                      className="detail-ext-btn hover-anilist"
                      aria-label="AniList"
                      onClick={() => handleOpenExternal(externalUrls.anilistUrl)}
                    >
                      <AniListLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.malUrl && (
                  <Tooltip label="MyAnimeList" hint="Open on MyAnimeList" side="top">
                    <button
                      type="button"
                      className="detail-ext-btn hover-mal"
                      aria-label="MyAnimeList"
                      onClick={() => handleOpenExternal(externalUrls.malUrl)}
                    >
                      <MalLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.imdbUrl && (
                  <Tooltip label="IMDb" hint="Open on IMDb" side="top">
                    <button
                      type="button"
                      className="detail-ext-btn hover-imdb"
                      aria-label="IMDb"
                      onClick={() => handleOpenExternal(externalUrls.imdbUrl)}
                    >
                      <ImdbLogo size={16} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.tmdbUrl && (
                  <Tooltip label="TMDB" hint="Open on TMDB" side="top">
                    <button
                      type="button"
                      className="detail-ext-btn hover-tmdb"
                      aria-label="TMDB"
                      onClick={() => handleOpenExternal(externalUrls.tmdbUrl)}
                    >
                      <TmdbLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.traktUrl && (
                  <Tooltip label="Trakt" hint="Open on Trakt.tv" side="top">
                    <button
                      type="button"
                      className="detail-ext-btn hover-trakt"
                      aria-label="Trakt"
                      onClick={() => handleOpenExternal(externalUrls.traktUrl)}
                    >
                      <TraktLogo size={15} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Cast */}
            {media.cast && media.cast.length > 0 && (
              <div className="detail-info-group">
                <div className="detail-info-label-row">
                  <Users size={13} />
                  <span className="detail-info-label">Cast & Characters</span>
                </div>
                <div className="detail-sidebar-cast">
                  {media.cast.map((member) => (
                    <div key={member.name} className="detail-cast-mini-item">
                      {member.avatar ? (
                        <img src={member.avatar} alt="" className="detail-cast-mini-avatar" />
                      ) : (
                        <div className="detail-cast-mini-fallback">
                          {member.name.charAt(0)}
                        </div>
                      )}
                      <div className="detail-cast-mini-info">
                        <span className="detail-cast-mini-name" title={member.name}>
                          {member.name}
                        </span>
                        <span className="detail-cast-mini-role">{member.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Right Section */}
        <main className="detail-main-content">
          <div className="detail-hero-info">
            <h1 className="detail-heading">{media.title}</h1>
            {media.japaneseTitle && (
              <p className="detail-subheading">{media.japaneseTitle}</p>
            )}

            {media.synopsis && (
              <div className="detail-synopsis-wrap">
                <p className={`detail-blurb ${!isDescriptionExpanded ? "is-clamped" : ""}`}>
                  {media.synopsis}
                </p>
                {media.synopsis.length > 100 && (
                  <button
                    type="button"
                    className="detail-synopsis-toggle"
                    onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                  >
                    <span>{isDescriptionExpanded ? "Show less" : "Show more"}</span>
                    {isDescriptionExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
              </div>
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
                className="detail-btn-icon"
                onClick={() => onOpenTorrentModal("download")}
                title={isSingleEpisode ? "Download" : "Download series"}
                aria-label={isSingleEpisode ? "Download" : "Download series"}
              >
                <Download size={16} />
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

              <div className="detail-cta-divider" />

              {/* Quick external buttons in CTA bar */}
              <div className="detail-cta-ext-group">
                {externalUrls.anilistUrl && (
                  <Tooltip label="AniList" hint="View on AniList" side="top">
                    <button
                      type="button"
                      className="detail-btn-icon detail-btn-ext hover-anilist"
                      aria-label="AniList"
                      onClick={() => handleOpenExternal(externalUrls.anilistUrl)}
                    >
                      <AniListLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.malUrl && (
                  <Tooltip label="MyAnimeList" hint="View on MyAnimeList" side="top">
                    <button
                      type="button"
                      className="detail-btn-icon detail-btn-ext hover-mal"
                      aria-label="MyAnimeList"
                      onClick={() => handleOpenExternal(externalUrls.malUrl)}
                    >
                      <MalLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.imdbUrl && (
                  <Tooltip label="IMDb" hint="View on IMDb" side="top">
                    <button
                      type="button"
                      className="detail-btn-icon detail-btn-ext hover-imdb"
                      aria-label="IMDb"
                      onClick={() => handleOpenExternal(externalUrls.imdbUrl)}
                    >
                      <ImdbLogo size={16} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.tmdbUrl && (
                  <Tooltip label="TMDB" hint="View on TMDB" side="top">
                    <button
                      type="button"
                      className="detail-btn-icon detail-btn-ext hover-tmdb"
                      aria-label="TMDB"
                      onClick={() => handleOpenExternal(externalUrls.tmdbUrl)}
                    >
                      <TmdbLogo size={15} />
                    </button>
                  </Tooltip>
                )}

                {externalUrls.traktUrl && (
                  <Tooltip label="Trakt" hint="View on Trakt.tv" side="top">
                    <button
                      type="button"
                      className="detail-btn-icon detail-btn-ext hover-trakt"
                      aria-label="Trakt"
                      onClick={() => handleOpenExternal(externalUrls.traktUrl)}
                    >
                      <TraktLogo size={15} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          <div className="detail-main-body">
            {/* Multi-Season / Franchise Quick Switcher (e.g. S1, S2, S3 for Grand Blue, Attack on Titan, etc.) */}
            {media.relatedSeasons && media.relatedSeasons.length > 1 && (
              <section className="detail-block detail-seasons-block">
                <div className="detail-block-head">
                  <Sparkles size={15} className="text-purple-400" />
                  <h2>Franchise & Seasons</h2>
                  <span className="detail-block-meta">{media.relatedSeasons.length} seasons / parts</span>
                </div>
                <div className="detail-seasons-bar">
                  {media.relatedSeasons.map((season) => {
                    const isActive =
                      season.id === media.id ||
                      (season.anilistId && season.anilistId === media.anilistId) ||
                      (season.tmdbId && season.tmdbId === media.tmdbId && (media.seasonsCount ? season.seasonNumber === (media.episodesCount ? 1 : 1) : true));
                    const tipHint = [
                      season.year,
                      season.episodesCount ? `${season.episodesCount} eps` : null,
                      season.format || "TV",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <Tooltip
                        key={`season_${season.id}_${season.seasonNumber}`}
                        label={season.title}
                        hint={tipHint}
                        side="bottom"
                      >
                        <button
                          type="button"
                          className={`season-chip-btn ${isActive ? "active" : ""}`}
                          onClick={() => {
                            if (isActive) return;
                            const targetMedia: MediaItem = {
                              id: season.id,
                              anilistId: season.anilistId,
                              tmdbId: season.tmdbId,
                              title: season.title,
                              mediaType: season.mediaType || media.mediaType,
                              format: (season.format as any) || media.format,
                              status: (season.status as any) || media.status,
                              coverImage: season.coverImage || media.coverImage,
                              bannerImage: season.bannerImage || media.bannerImage,
                              synopsis: "",
                              genres: media.genres || [],
                              year: season.year || media.year,
                              score: season.score || media.score,
                              episodesCount: season.episodesCount,
                              relatedSeasons: media.relatedSeasons,
                            };
                            onSelectMedia?.(targetMedia);
                          }}
                          aria-label={season.title}
                        >
                          <span className="season-badge-tag">{season.seasonLabel}</span>
                          {season.year && <span className="season-year-tag">{season.year}</span>}
                        </button>
                      </Tooltip>
                    );
                  })}
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
                      {[
                        media.year,
                        media.format || media.mediaType,
                        media.score != null ? `★ ${media.score}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </button>
              </section>
            )}

            {/* Recommendations / More Like This */}
            {recommendations.length > 0 && (
              <section className="detail-block detail-recs-section">
                <div className="detail-block-head">
                  <Sparkles size={15} className="text-purple-400" />
                  <h2>More Like This</h2>
                  <span className="detail-block-meta">{recommendations.length} recommendations</span>
                </div>

                <div className="detail-recs-rail-wrap">
                  {recsScrollState.canLeft && (
                    <button
                      type="button"
                      className="detail-recs-nav is-left"
                      onClick={() => scrollRecs(-1)}
                      aria-label="Scroll left"
                    >
                      <ChevronLeft size={16} />
                    </button>
                  )}

                  {recsScrollState.canRight && (
                    <button
                      type="button"
                      className="detail-recs-nav is-right"
                      onClick={() => scrollRecs(1)}
                      aria-label="Scroll right"
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}

                  <div
                    ref={recsRailRef}
                    className="detail-recs-rail"
                  >
                    {recommendations.map((rec, idx) => (
                      <div key={rec.id} className="detail-rec-slot">
                        <MediaCard
                          item={rec}
                          index={idx}
                          onSelect={onSelectMedia || (() => {})}
                          onToggleFavorite={onToggleFavorite}
                          onToggleWatchlist={onToggleWatchlist}
                          onContextMenu={onContextMenu ? (e, m) => onContextMenu(e, m) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
