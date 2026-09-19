"use client";

import { useSyncExternalStore } from "react";
import { formatFullDate, formatShortDate, isValidDate } from "@/lib/format";

const subscribe = () => () => {};

/**
 * Renders a timestamp in the viewer's own timezone. The server has no idea
 * what that is (it's UTC on Vercel), so the server snapshot is empty and the
 * browser fills it in after hydration.
 */
export function LocalTime({
  iso,
  format,
  className,
}: {
  iso?: string;
  format: "short" | "full";
  className?: string;
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => (iso && isValidDate(iso) ? (format === "short" ? formatShortDate(iso) : formatFullDate(iso)) : ""),
    () => "",
  );

  if (!iso || !isValidDate(iso)) return null;
  return (
    <time dateTime={iso} className={className} title={iso}>
      {text}
    </time>
  );
}
