import { useState } from "react";
import { ImageOff } from "lucide-react";

interface MediaImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  emptyClassName?: string;
  loading?: "lazy" | "eager";
  emptyLabel?: string;
}

/**
 * Image with a clean empty state — no stock filler photos.
 */
export function MediaImage({
  src,
  alt = "",
  className = "",
  emptyClassName = "",
  loading = "lazy",
  emptyLabel = "No thumbnail",
}: MediaImageProps) {
  const [failed, setFailed] = useState(false);
  const hasSrc = Boolean(src && src.trim() && !failed);

  if (!hasSrc) {
    return (
      <div className={`media-image-empty ${emptyClassName}`.trim()} role="img" aria-label={emptyLabel}>
        <ImageOff size={22} strokeWidth={1.5} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src!}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
