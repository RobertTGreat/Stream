import { useEffect, useRef } from "react";

interface GamepadNavOptions {
  onBack?: () => void;
  onOpenSearch?: () => void;
  onPrevTab?: () => void;
  onNextTab?: () => void;
  enabled?: boolean;
}

export function useGamepadNav({
  onBack,
  onOpenSearch,
  onPrevTab,
  onNextTab,
  enabled = true,
}: GamepadNavOptions) {
  const lastButtonTimeRef = useRef<Record<number, number>>({});
  const lastAxisTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let animId: number;

    const getFocusables = (): HTMLElement[] => {
      const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), article.rail-card, article.eps-row, article.detail-rec-card, .calendar-day-cell';
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
        return el.offsetParent !== null && !el.hasAttribute("disabled") && el.style.display !== "none" && el.style.visibility !== "hidden";
      });
    };

    const moveFocus = (direction: "up" | "down" | "left" | "right") => {
      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const current = (document.activeElement as HTMLElement) || document.body;
      const currentRect = current.getBoundingClientRect();

      let bestElement: HTMLElement | null = null;
      let minDistance = Infinity;

      for (const el of focusables) {
        if (el === current) continue;
        const rect = el.getBoundingClientRect();

        let isValid = false;
        let dist = 0;

        if (direction === "right" && rect.left >= currentRect.left + 5) {
          isValid = true;
          const dx = rect.left - currentRect.right;
          const dy = Math.abs(rect.top - currentRect.top);
          dist = dx + dy * 2;
        } else if (direction === "left" && rect.right <= currentRect.right - 5) {
          isValid = true;
          const dx = currentRect.left - rect.right;
          const dy = Math.abs(rect.top - currentRect.top);
          dist = dx + dy * 2;
        } else if (direction === "down" && rect.top >= currentRect.top + 5) {
          isValid = true;
          const dy = rect.top - currentRect.bottom;
          const dx = Math.abs(rect.left - currentRect.left);
          dist = dy + dx * 1.5;
        } else if (direction === "up" && rect.bottom <= currentRect.bottom - 5) {
          isValid = true;
          const dy = currentRect.top - rect.bottom;
          const dx = Math.abs(rect.left - currentRect.left);
          dist = dy + dx * 1.5;
        }

        if (isValid && dist < minDistance) {
          minDistance = dist;
          bestElement = el;
        }
      }

      if (bestElement) {
        bestElement.focus();
        bestElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } else if (!document.activeElement || document.activeElement === document.body) {
        focusables[0]?.focus();
      }
    };

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gamepads).find((g) => g && g.connected);

      if (gp) {
        const now = Date.now();

        // Directional stick & d-pad
        const axisX = gp.axes[0] || 0;
        const axisY = gp.axes[1] || 0;
        const dpadUp = gp.buttons[12]?.pressed;
        const dpadDown = gp.buttons[13]?.pressed;
        const dpadLeft = gp.buttons[14]?.pressed;
        const dpadRight = gp.buttons[15]?.pressed;

        if (now - lastAxisTimeRef.current > 190) {
          if (axisX > 0.55 || dpadRight) {
            moveFocus("right");
            lastAxisTimeRef.current = now;
          } else if (axisX < -0.55 || dpadLeft) {
            moveFocus("left");
            lastAxisTimeRef.current = now;
          } else if (axisY > 0.55 || dpadDown) {
            moveFocus("down");
            lastAxisTimeRef.current = now;
          } else if (axisY < -0.55 || dpadUp) {
            moveFocus("up");
            lastAxisTimeRef.current = now;
          }
        }

        // Button A (0): Select / Click
        if (gp.buttons[0]?.pressed && now - (lastButtonTimeRef.current[0] || 0) > 280) {
          lastButtonTimeRef.current[0] = now;
          const active = document.activeElement as HTMLElement;
          if (active && typeof active.click === "function") {
            active.click();
          }
        }

        // Button B (1): Back / Escape
        if (gp.buttons[1]?.pressed && now - (lastButtonTimeRef.current[1] || 0) > 280) {
          lastButtonTimeRef.current[1] = now;
          onBack?.();
        }

        // Button Y (3): Global Search
        if (gp.buttons[3]?.pressed && now - (lastButtonTimeRef.current[3] || 0) > 350) {
          lastButtonTimeRef.current[3] = now;
          onOpenSearch?.();
        }

        // Left Bumper (4): Previous Tab
        if (gp.buttons[4]?.pressed && now - (lastButtonTimeRef.current[4] || 0) > 280) {
          lastButtonTimeRef.current[4] = now;
          onPrevTab?.();
        }

        // Right Bumper (5): Next Tab
        if (gp.buttons[5]?.pressed && now - (lastButtonTimeRef.current[5] || 0) > 280) {
          lastButtonTimeRef.current[5] = now;
          onNextTab?.();
        }
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [enabled, onBack, onOpenSearch, onPrevTab, onNextTab]);
}
