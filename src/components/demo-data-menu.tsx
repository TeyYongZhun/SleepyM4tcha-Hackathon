"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, Trash2, type LucideIcon } from "lucide-react";

/**
 * The two rows under "Import data" in the demo account's menu:
 *
 *   Clear data       empties the inbox -- no emails at all (PUT /api/import)
 *   Try demo data    puts the bundled 520-email sample back (DELETE /api/import), which also
 *                    undoes an import
 *
 * Both go through the same store as an import (public/import on a machine you run yourself,
 * Vercel Blob on a serverless host), so they work wherever Import data does.
 */

function DataAction({
  icon: Icon,
  label,
  busyLabel,
  method,
  confirm,
}: {
  icon: LucideIcon;
  label: string;
  busyLabel: string;
  method: "PUT" | "DELETE";
  /** Asked first when the action throws data away */
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.MouseEvent<HTMLButtonElement>) {
    if (busy) return;
    if (confirm && !window.confirm(confirm)) return;
    const menu = e.currentTarget.closest("details");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", { method });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Failed (${res.status})`);
      }
      menu?.removeAttribute("open");
      // Whatever email was open may no longer exist, so start from the inbox
      router.replace("/dashboard/all");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper-2 disabled:cursor-progress disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin text-ink-soft" aria-hidden />
        ) : (
          <Icon size={14} className="text-ink-soft" aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
      {error && (
        <p role="alert" className="px-3 pb-1.5 text-xs leading-snug text-bad">
          {error}
        </p>
      )}
    </>
  );
}

export function ClearDataButton() {
  return (
    <DataAction
      icon={Trash2}
      label="Clear data"
      busyLabel="Clearing…"
      method="PUT"
      confirm="Clear all the data in the inbox? It will be empty until you import data or choose Try demo data."
    />
  );
}

export function DemoDataButton() {
  return <DataAction icon={Database} label="Try demo data" busyLabel="Loading…" method="DELETE" />;
}
