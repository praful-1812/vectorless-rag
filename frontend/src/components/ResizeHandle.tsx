'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  side: 'left' | 'right'; // which side the panel is on
  onResize: (delta: number) => void;
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      // For right-side panels, dragging left = increase width (negative delta = positive resize)
      // For left-side panels, dragging right = increase width (positive delta = positive resize)
      onResize(side === 'right' ? -delta : delta);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize, side]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/50 cursor-col-resize transition-all duration-150 flex-shrink-0 group relative`}
      title="Drag to resize"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
