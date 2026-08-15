export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function viewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 1280,
    height: window.innerHeight || document.documentElement.clientHeight || 800,
  };
}

function hasCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Phone-sized layout. Uses the short side so landscape phones stay phones. */
export function isPhoneUi(): boolean {
  const { width, height } = viewportSize();
  return Math.min(width, height) <= 600;
}

/** Android / touch devices wider than a phone. */
export function isTabletUi(): boolean {
  if (isPhoneUi()) return false;
  const { width } = viewportSize();
  return isAndroid() || (hasCoarsePointer() && width < 1400);
}

/** Phone chrome (bottom nav). Kept for existing call sites. */
export function isMobileUi(): boolean {
  return isPhoneUi();
}

export function applyPlatformClass(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const phone = isPhoneUi();
  const tablet = isTabletUi();
  root.classList.toggle("is-android", isAndroid());
  root.classList.toggle("is-phone", phone);
  root.classList.toggle("is-tablet", tablet);
  root.classList.toggle("is-mobile", phone);
}
