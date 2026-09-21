"use client";

import { useState } from "react";
import { Check, Download, Loader2, TriangleAlert } from "lucide-react";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; count: number } | { kind: "failed" };

/**
 * Downloads submission.json: every email's category and SI-vs-BL verdict as the app has it
 * right now, in the shape of ground_truth.json (see /api/export). Sits beside the bell.
 * The file is built on the server, so on a real Gmail inbox it can take a few seconds; the
 * button says so, then how many emails went in.
 */
export function ExportButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";

  async function run() {
    if (busy) return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/export", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.text()) || `Failed (${res.status})`);
      const count = Number(res.headers.get("X-Export-Count")) || 0;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "submission.json";
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState({ kind: "done", count });
      setTimeout(() => setState({ kind: "idle" }), 3500);
    } catch {
      setState({ kind: "failed" });
      setTimeout(() => setState({ kind: "idle" }), 4500);
    }
  }

  const label =
    state.kind === "busy"
      ? "Exporting…"
      : state.kind === "done"
        ? `${state.count.toLocaleString()} exported`
        : state.kind === "failed"
          ? "Export failed"
          : "Export";
  const Icon =
    state.kind === "busy" ? Loader2 : state.kind === "done" ? Check : state.kind === "failed" ? TriangleAlert : Download;

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-live="polite"
      aria-label="Export submission.json"
      title="Export .json"
      className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition hover:bg-paper-2 disabled:cursor-progress ${
        state.kind === "failed" ? "text-bad" : state.kind === "done" ? "text-good" : "text-ink-soft hover:text-ink"
      }`}
    >
      <Icon size={17} aria-hidden className={busy ? "animate-spin" : undefined} />
      <span className={state.kind === "idle" ? "hidden md:inline" : "hidden sm:inline"}>{label}</span>
    </button>
  );
}
