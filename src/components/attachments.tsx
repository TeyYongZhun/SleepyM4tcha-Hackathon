"use client";

/* eslint-disable @next/next/no-img-element -- attachment URLs are arbitrary/backend-provided */
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import type { Attachment } from "@/lib/types";

const isImage = (a: Attachment) => a.mime_type.startsWith("image/");
const isPdf = (a: Attachment) => a.mime_type === "application/pdf";
const isText = (a: Attachment) => a.mime_type === "text/plain";
const isSheet = (a: Attachment) => a.mime_type.includes("spreadsheet");
const hasPreview = (a: Attachment) => isImage(a) || isPdf(a) || isText(a);

/** PDFs get the design's red tile; everything else a neutral one. */
function FileTile({ attachment: a }: { attachment: Attachment }) {
  const tone = isPdf(a) ? "bg-bad-bg text-bad" : "bg-paper-2 text-ink-soft";
  const props = { size: 17, "aria-hidden": true } as const;
  return (
    <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg ${tone}`}>
      {isImage(a) ? (
        <ImageIcon {...props} />
      ) : isSheet(a) ? (
        <FileSpreadsheet {...props} />
      ) : isPdf(a) || isText(a) || a.mime_type.includes("word") ? (
        <FileText {...props} />
      ) : (
        <File {...props} />
      )}
    </span>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <pre className="max-h-96 overflow-auto border-t border-line bg-paper p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink">
      {failed ? "Could not load preview." : (text ?? "Loading…")}
    </pre>
  );
}

const ICON_LINK =
  "rounded-md p-1.5 text-ink-soft transition hover:bg-paper-2 hover:text-ink";

function AttachmentCard({
  attachment: a,
  open,
  onToggle,
}: {
  attachment: Attachment;
  open: boolean;
  onToggle: () => void;
}) {
  const previewable = hasPreview(a);

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={!previewable}
          aria-expanded={previewable ? open : undefined}
          aria-label={`${open ? "Minimize" : "Expand"} ${a.filename}`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left enabled:hover:bg-paper"
        >
          {previewable ? (
            open ? (
              <ChevronDown size={16} className="shrink-0 text-ink-soft" aria-hidden />
            ) : (
              <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <FileTile attachment={a} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{a.filename}</span>
            <span className="block text-[10.5px] text-ink-soft">
              {formatBytes(a.size)} · {a.mime_type.split("/").pop()}
              {!previewable && " · no preview"}
            </span>
          </span>
        </button>
        {!a.url.startsWith("data:") && (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${a.filename} in new tab`}
            className={ICON_LINK}
          >
            <ExternalLink size={16} />
          </a>
        )}
        <a href={a.url} download={a.filename} aria-label={`Download ${a.filename}`} className={ICON_LINK}>
          <Download size={16} />
        </a>
      </div>

      {open && isImage(a) && (
        <a href={a.url} target="_blank" rel="noreferrer" className="block border-t border-line bg-paper-2">
          <img src={a.url} alt={a.filename} className="mx-auto max-h-[28rem] w-auto max-w-full" />
        </a>
      )}
      {open && isPdf(a) && (
        <iframe src={a.url} title={a.filename} className="h-[32rem] w-full border-t border-line" />
      )}
      {open && isText(a) && <TextPreview url={a.url} />}
    </div>
  );
}

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  // Track which ones are minimized; everything starts expanded
  const [minimized, setMinimized] = useState<Set<string>>(new Set());

  if (attachments.length === 0) return null;

  const previewable = attachments.filter(hasPreview);
  const allMinimized = previewable.every((a) => minimized.has(a.id));

  const toggle = (id: string) =>
    setMinimized((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section aria-label="Attachments" className="mt-8">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="font-sans text-[11.5px] font-semibold tracking-wide text-ink-soft uppercase">
          Attachments ({attachments.length})
        </h2>
        {previewable.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setMinimized(allMinimized ? new Set() : new Set(previewable.map((a) => a.id)))
            }
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-ink-soft transition hover:bg-paper-2 hover:text-ink"
          >
            {allMinimized ? (
              <ChevronsUpDown size={14} aria-hidden />
            ) : (
              <ChevronsDownUp size={14} aria-hidden />
            )}
            {allMinimized ? "Expand all" : "Minimize all"}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {attachments.map((a) => (
          <AttachmentCard
            key={a.id}
            attachment={a}
            open={!minimized.has(a.id)}
            onToggle={() => toggle(a.id)}
          />
        ))}
      </div>
    </section>
  );
}
