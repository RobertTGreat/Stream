import React, { useState, useRef } from "react";

interface TooltipProps {
  label: string;
  hint?: string;
  side?: "bottom" | "top" | "left" | "right";
  children: React.ReactElement;
  className?: string;
}

export function Tooltip({ label, hint, side = "bottom", children, className = "" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <div
      className={`tooltip-wrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div className={`ui-tooltip side-${side}`} role="tooltip">
          <div className="tooltip-content">
            <span className="tooltip-label">{label}</span>
            {hint && <span className="tooltip-hint">{hint}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

