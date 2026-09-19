export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isValidDate(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Plain-text preview of an email body for list rows. */
export function bodySnippet(body: string, type: "html" | "text"): string {
  const text = type === "html" ? body.replace(/<[^>]*>/g, " ") : body;
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function displayName(a: { name?: string; email: string }): string {
  return a.name || a.email;
}
