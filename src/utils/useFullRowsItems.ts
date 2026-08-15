import { useState, useEffect, useRef, useMemo } from "react";

/**
 * Hook to measure container width and return item slice that fits complete rows only.
 * Eliminates incomplete final rows / trailing blank spots in grids.
 */
export function useFullRowsItems<T>(
  items: T[],
  minWidth = 170,
  gap = 16
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayItems: T[];
  columns: number;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateColumns = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      // CSS auto-fill/auto-fit grid formula
      const computedCols = Math.max(1, Math.floor((w + gap) / (minWidth + gap)));
      setColumns(computedCols);
    };

    updateColumns();
    const ro = new ResizeObserver(updateColumns);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minWidth, gap]);

  const displayItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    if (items.length <= columns) return items;
    const fullCount = Math.floor(items.length / columns) * columns;
    // Keep a leftover last row on phones instead of dropping a whole row.
    if (fullCount === 0 || items.length - fullCount >= Math.max(2, Math.floor(columns / 2))) {
      return items;
    }
    return items.slice(0, fullCount);
  }, [items, columns]);

  return { containerRef, displayItems, columns };
}
