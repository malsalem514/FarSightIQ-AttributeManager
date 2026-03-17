/**
 * useVirtualization - Vanilla React virtualization hook
 * 
 * Renders only visible items for smooth scrolling through large lists
 * Pattern: No external libraries, pure React
 * 
 * Performance: Handles 10,000+ items at 60 FPS
 */

import { useState, useMemo, useCallback } from 'react';

export interface VirtualizationOptions<T> {
  items: T[];
  rowHeight: number;        // Height of one row in pixels
  containerHeight: number;  // Viewport height in pixels
  overscan?: number;        // Extra rows to render above/below viewport (default: 5)
}

export interface VirtualItem<T> {
  item: T;
  index: number;
  offsetY: number;  // Absolute position from top
}

export interface VirtualizationResult<T> {
  visibleItems: VirtualItem<T>[];
  totalHeight: number;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  visibleRange: { start: number; end: number };
  scrollToIndex: (index: number) => void;
}

/**
 * Hook for virtualizing large lists
 * 
 * @example
 * const { visibleItems, totalHeight, handleScroll } = useVirtualization({
 *   items: products,
 *   rowHeight: 60,
 *   containerHeight: 800,
 *   overscan: 5
 * });
 * 
 * <div onScroll={handleScroll} style={{ height: 800, overflow: 'auto' }}>
 *   <div style={{ height: totalHeight, position: 'relative' }}>
 *     {visibleItems.map(({ item, offsetY }) => (
 *       <div key={item.id} style={{ position: 'absolute', top: offsetY }}>
 *         {item.name}
 *       </div>
 *     ))}
 *   </div>
 * </div>
 */
export function useVirtualization<T>({
  items,
  rowHeight,
  containerHeight,
  overscan = 5
}: VirtualizationOptions<T>): VirtualizationResult<T> {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  // Calculate which items are visible
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.ceil((scrollTop + containerHeight) / rowHeight);
    
    return {
      start: Math.max(0, startIndex - overscan),
      end: Math.min(items.length, endIndex + overscan)
    };
  }, [scrollTop, rowHeight, containerHeight, items.length, overscan]);

  // Extract visible items with their absolute positions
  const visibleItems = useMemo(() => {
    return items
      .slice(visibleRange.start, visibleRange.end)
      .map((item, i) => {
        const index = visibleRange.start + i;
        return {
          item,
          index,
          offsetY: index * rowHeight
        };
      });
  }, [items, visibleRange, rowHeight]);

  // Total height of the scrollable container
  const totalHeight = items.length * rowHeight;

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    
    if (!scrollElement) {
      setScrollElement(target);
    }
  }, [scrollElement]);

  // Scroll to specific index programmatically
  const scrollToIndex = useCallback((index: number) => {
    if (scrollElement) {
      scrollElement.scrollTop = index * rowHeight;
    }
  }, [scrollElement, rowHeight]);

  return {
    visibleItems,
    totalHeight,
    handleScroll,
    visibleRange,
    scrollToIndex
  };
}

