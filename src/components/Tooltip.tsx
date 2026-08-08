import React, { useState, useRef } from "react";

interface TooltipProps {
  label: string;
  hint?: string;
  side?: "right" | "bottom" | "top" | "left";
  children: React.ReactElement;
}

export function Tooltip({ label, hint, side = "right", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 180);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <div
      className="tooltip-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div className={`ui-tooltip side-${side}`} role="tooltip">
          <span className="tooltip-label">{label}</span>
          {hint && <span className="tooltip-hint">{hint}</span>}
        </div>
      )}
    </div>
  );
}
