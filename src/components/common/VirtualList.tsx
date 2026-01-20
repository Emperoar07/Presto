'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

interface VirtualListProps<T> {
  items: T[];
  height: number;
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
}

export function VirtualList<T>({ items, height, rowHeight, renderRow, keyExtractor }: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    const start = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    const end = Math.min(items.length, start + visibleCount + 4);
    return { startIndex: start, endIndex: end, offsetTop: start * rowHeight };
  }, [scrollTop, rowHeight, height, items.length]);

  const visibleItems = items.slice(startIndex, endIndex);
  const totalHeight = items.length * rowHeight;

  return (
    <div
      style={{ height, overflowY: 'auto' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={keyExtractor(item, startIndex + index)}>
              {renderRow(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
