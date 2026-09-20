"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const KEY = "wayboxai-summary-width";
const DEFAULT_WIDTH = 416;
const MIN_WIDTH = 288;
const MAX_WIDTH = 800;
/** The email pane never gets squeezed below this. */
const MIN_LEFT = 360;

// The chosen width lives in localStorage; this tiny store lets React read it
// without a "set state in an effect" flash and keeps every split in sync.
const listeners = new Set<() => void>();

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= MIN_WIDTH ? Math.min(v, MAX_WIDTH) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function writeWidth(w: number) {
  try {
    localStorage.setItem(KEY, String(Math.round(w)));
  } catch {
    // private mode: the width just won't persist
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Email (left) and summary (right) with a draggable divider between them.
 * Below `lg` the panes simply stack, and the divider is hidden.
 */
export function ResizableSplit({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const width = useSyncExternalStore(subscribe, readWidth, () => DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /** Largest right-pane width that still leaves the email pane its minimum. */
  const maxFor = () => {
    const total = containerRef.current?.getBoundingClientRect().width ?? 0;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, total - MIN_LEFT));
  };
  const clamp = (w: number) => Math.min(Math.max(w, MIN_WIDTH), maxFor());

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const right = containerRef.current.getBoundingClientRect().right;
    writeWidth(clamp(right - e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    // The divider sits on the summary's left edge: moving it left makes the summary wider
    if (e.key === "ArrowLeft") writeWidth(clamp(width + step));
    else if (e.key === "ArrowRight") writeWidth(clamp(width - step));
    else if (e.key === "Home") writeWidth(MIN_WIDTH);
    else if (e.key === "End") writeWidth(clamp(MAX_WIDTH));
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={containerRef}
      style={{ "--summary-w": `${width}px` } as React.CSSProperties}
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden ${
        dragging ? "select-none" : ""
      }`}
    >
      <div className="min-w-0 lg:min-w-[22.5rem] lg:flex-1 lg:overflow-y-auto">{left}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize summary panel"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => writeWidth(DEFAULT_WIDTH)}
        className="group relative hidden w-2 shrink-0 cursor-col-resize touch-none focus-visible:outline-none lg:block"
      >
        <span
          className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-[width,background-color] ${
            dragging
              ? "w-0.5 bg-copper"
              : "w-px bg-line group-hover:w-0.5 group-hover:bg-copper group-focus-visible:w-0.5 group-focus-visible:bg-copper"
          }`}
        />
      </div>

      <div className="border-t border-line bg-paper-2 lg:w-(--summary-w) lg:shrink-0 lg:overflow-y-auto lg:border-t-0">
        {right}
      </div>
    </div>
  );
}
