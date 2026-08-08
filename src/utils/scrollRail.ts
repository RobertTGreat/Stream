/** easeInOutCubic — continuous glide, no hard stops mid-way */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animate horizontal scroll with custom easing (more reliable than
 * behavior: "smooth" across WebViews / Tauri).
 */
export function animateScrollX(
  el: HTMLElement,
  to: number,
  duration = 560
): Promise<void> {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const target = Math.max(0, Math.min(max, to));
  const from = el.scrollLeft;
  const delta = target - from;
  if (Math.abs(delta) < 0.5) {
    el.scrollLeft = target;
    return Promise.resolve();
  }

  // Cancel previous animation on this element
  const prev = (el as any).__scrollAnim as number | undefined;
  if (prev) cancelAnimationFrame(prev);

  const start = performance.now();

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      el.scrollLeft = from + delta * easeInOutCubic(t);
      if (t < 1) {
        (el as any).__scrollAnim = requestAnimationFrame(tick);
      } else {
        el.scrollLeft = target;
        (el as any).__scrollAnim = 0;
        resolve();
      }
    };
    (el as any).__scrollAnim = requestAnimationFrame(tick);
  });
}

function gapOf(el: HTMLElement): number {
  const g = getComputedStyle(el).gap || getComputedStyle(el).columnGap || "0";
  const n = parseFloat(g);
  return Number.isFinite(n) ? n : 0;
}

/** Measure card stride (width + gap) for Continue / poster rails. */
export function getCardStride(el: HTMLElement, cardSelector: string): number {
  const card = el.querySelector(cardSelector) as HTMLElement | null;
  if (!card) return Math.max(el.clientWidth * 0.7, 280);
  return card.getBoundingClientRect().width + gapOf(el);
}

/**
 * Smooth continuous scroll by ~one viewport of cards (no card-edge snapping).
 */
export function scrollRailByPage(
  el: HTMLElement,
  dir: 1 | -1,
  _cardSelector = ".hm-cw-card"
): Promise<void> {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  // Glide ~85% of visible width so motion feels continuous, not stepped
  const distance = Math.max(el.clientWidth * 0.85, 240);
  const target = Math.max(0, Math.min(max, el.scrollLeft + dir * distance));
  // Duration scales slightly with distance for consistent perceived speed
  const duration = Math.min(720, Math.max(480, Math.abs(target - el.scrollLeft) * 0.55));
  return animateScrollX(el, target, duration);
}

export function getRailScrollState(el: HTMLElement | null) {
  if (!el) return { canLeft: false, canRight: false };
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const x = el.scrollLeft;
  const eps = 4;
  return {
    canLeft: x > eps,
    canRight: x < max - eps,
  };
}
