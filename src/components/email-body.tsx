"use client";

import { useRef, useState } from "react";

/**
 * Renders an email body. HTML is untrusted, so it goes in a sandboxed iframe
 * with scripts disabled (`allow-same-origin` only lets us measure its height).
 */
export function EmailBody({
  body,
  type,
}: {
  body: string;
  type: "html" | "text";
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  if (type === "text") {
    return (
      <pre className="font-sans text-[14.5px] leading-[1.75] whitespace-pre-wrap break-words text-ink">
        {body}
      </pre>
    );
  }

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>body{margin:0;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>
</head><body>${body}</body></html>`;

  return (
    <iframe
      ref={ref}
      title="Email body"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ height }}
      className="w-full rounded-lg border border-line bg-white"
      onLoad={() => {
        const doc = ref.current?.contentDocument;
        if (doc) setHeight(doc.documentElement.scrollHeight + 8);
      }}
    />
  );
}
