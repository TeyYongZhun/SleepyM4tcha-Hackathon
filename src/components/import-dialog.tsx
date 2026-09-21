"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FileArchive, Loader2, Upload, X } from "lucide-react";

/**
 * "Import data" for the demo account: two zips, one of inbox JSON files and one of the
 * attachments they name, unpacked server-side into public/import. Once something is imported
 * it replaces the bundled sample entirely, and Reset puts the sample back.
 */

interface Status {
  imported: boolean;
  emails: number;
}

/** One drop target. Dropping and the file picker set the same piece of state. */
function DropZone({
  label,
  hint,
  file,
  onFile,
  disabled,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  disabled: boolean;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const f = list?.[0];
    if (f) onFile(f);
  };

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink">{label}</p>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) take(e.dataTransfer.files);
        }}
        className={`flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition ${
          over ? "border-copper bg-paper-2" : "border-line hover:border-copper hover:bg-paper-2"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {file ? (
          <>
            <FileArchive size={20} className="text-copper" aria-hidden />
            <span className="max-w-full truncate text-[13px] font-medium text-ink">
              {file.name}
            </span>
            <span className="text-[11.5px] text-ink-soft">
              {(file.size / 1024 / 1024).toFixed(1)} MB &middot; click to replace
            </span>
          </>
        ) : (
          <>
            <Upload size={20} className="text-ink-soft" aria-hidden />
            <span className="text-[13px] text-ink">Drop a .zip here, or click to choose</span>
            <span className="text-[11.5px] text-ink-soft">{hint}</span>
          </>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => take(e.target.files)}
      />
    </div>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [inbox, setInbox] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // What is on disk now, so the panel can offer Reset only when there is an import to remove
  useEffect(() => {
    let alive = true;
    fetch("/api/import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => alive && s && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function send() {
    if (!inbox || !attachments) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("inbox", inbox);
    body.append("attachments", attachments);
    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Import failed");
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the imported data");
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-line bg-overlay p-5 shadow-2xl outline-none"
      >
        <div className="mb-1 flex items-start gap-3">
          <h2 id="import-title" className="flex-1 text-[15px] font-semibold text-ink">
            Import sample data
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mt-1 -mr-1 cursor-pointer rounded-md p-1.5 text-ink-soft hover:bg-paper-2 hover:text-ink disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-soft">
          Two zip files: the inbox JSON records, and the attachments they refer to. This
          replaces the bundled sample inbox &mdash; only the imported emails are shown.
        </p>

        <div className="space-y-3.5">
          <DropZone
            label="Inbox"
            hint="the .json email records"
            file={inbox}
            onFile={setInbox}
            disabled={busy}
          />
          <DropZone
            label="Attachments"
            hint=".txt, .pdf, .docx, .xlsx"
            file={attachments}
            onFile={setAttachments}
            disabled={busy}
          />
        </div>

        {error && (
          <p className="mt-3.5 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
          {status?.imported && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-paper-2 hover:text-ink disabled:opacity-50"
            >
              Reset to sample data
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-paper-2 hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy || !inbox || !attachments}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-btn px-4 py-2 text-[13px] font-semibold text-on-btn btn-lift hover:bg-btn-hover disabled:pointer-events-none disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The row in the account menu. The panel is only ever mounted by a click, which happens after
 * hydration, so its portal never runs during a server render.
 */
export function ImportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper-2"
      >
        <Upload size={14} className="text-ink-soft" aria-hidden />
        Import data
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}
