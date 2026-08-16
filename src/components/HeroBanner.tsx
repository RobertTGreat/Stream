import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue } from "motion/react";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem } from "../types";
import { getHeroImageUrl } from "../utils/mediaImages";
import { QuickActionPlusMenu } from "./QuickActionPlusMenu";

interface HeroBannerProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  watchlist: string[];
  onToggleWatchlist: (id: string) => void;
  onMarkWatched?: (item: MediaItem, watched: boolean) => void;
  onRefresh?: () => void;
}

export function HeroBanner({
  items,
  onSelect,
  onPlay,
  watchlist: _watchlist,
  onToggleWatchlist,
  onMarkWatched,
}: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (!items || items.length === 0) return null;

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }
  ) => {
    const width = containerRef.current?.offsetWidth || 800;
    const swipeThreshold = width * 0.15;
    if (info.offset.x < -swipeThreshold || info.velocity.x < -400) {
      setCurrentIndex((p) => (p + 1) % items.length);
    } else if (info.offset.x > swipeThreshold || info.velocity.x > 400) {
      setCurrentIndex((p) => (p - 1 + items.length) % items.length);
    }
  };

  return (
    <section ref={containerRef} className="home-hero" aria-label="Featured">
      {/* Continuous Slidable Track */}
      <motion.div
        className="home-hero-slider-track"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={handleDragEnd}
        style={{ x: dragX }}
        animate={{ x: `-${currentIndex * 100}%` }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
      >
        {items.map((item, idx) => {
          const metaBits = [
            item.year,
            item.format || (item.mediaType === "anime" ? "Anime" : item.mediaType),
            item.score ? `${item.score}` : null,
            item.episodesCount && item.episodesCount > 1 ? `${item.episodesCount} eps` : null,
          ].filter(Boolean);

          return (
            <div key={item.id} className={`home-hero-slide ${idx === currentIndex ? "is-active" : ""}`}>
              <div className="home-hero-media">
                <img
                  src={getHeroImageUrl(item)}
                  alt=""
                  className="home-hero-img"
                  decoding="async"
                  fetchPriority={idx === currentIndex ? "high" : "low"}
                  draggable={false}
                />
                <div className="home-hero-scrim" />
              </div>

              <div className="home-hero-body">
                <p className="home-hero-kicker">Featured</p>
                <h1 className="home-hero-title" title={item.title}>
                  {item.title}
                </h1>

                <div className="home-hero-meta">
                  {metaBits.map((bit) => (
                    <span key={String(bit)}>{bit}</span>
                  ))}
                </div>

                {item.synopsis && <p className="home-hero-synopsis">{item.synopsis}</p>}

                <div className="home-hero-actions">
                  <motion.button
                    type="button"
                    className="home-hero-play"
                    onClick={() => onPlay(item)}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <Play size={15} className="fill-current" />
                    <span>Play</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    className="home-hero-ghost"
                    onClick={() => onSelect(item)}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    Details
                  </motion.button>

                  <QuickActionPlusMenu
                    mediaId={item.id}
                    mediaTitle={item.title}
                    mediaType={item.mediaType}
                    coverImage={item.coverImage}
                    onToggleWatchlist={onToggleWatchlist}
                    onMarkWatched={onMarkWatched}
                    buttonClassName="home-hero-icon"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Hero Pager Floating Controls */}
      {items.length > 1 && (
        <div className="home-hero-pager-overlay">
          <motion.button
            type="button"
            className="home-hero-nav"
            onClick={() => setCurrentIndex((p) => (p - 1 + items.length) % items.length)}
            aria-label="Previous slide"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft size={16} />
          </motion.button>
          <div className="home-hero-dots">
            {items.slice(0, 7).map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`home-hero-dot ${idx === currentIndex ? "is-active" : ""}`}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
          <motion.button
            type="button"
            className="home-hero-nav"
            onClick={() => setCurrentIndex((p) => (p + 1) % items.length)}
            aria-label="Next slide"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronRight size={16} />
          </motion.button>
        </div>
      )}
    </section>
  );
}
