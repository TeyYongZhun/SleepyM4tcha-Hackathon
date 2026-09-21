"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "./theme-toggle";

const noSubscribe = () => () => {};

/**
 * Renders an email body. HTML is untrusted, so it goes in a sandboxed iframe
 * with scripts disabled (`allow-same-origin` only lets us measure its height).
 *
 * HTML mail is written for a white page, so in dark mode the frame is inverted
 * (light <-> dark, hues kept) instead of showing a white slab in a dark app, and
 * the images inside are inverted back so photos and logos look normal. The base
 * colours below are picked so the result lands on the app's own page colour (#eaeaea
 * inverts to #151515) and text colour, i.e. it looks like the plain-text emails do.
 * The page has to be given that colour explicitly: an iframe whose colour scheme differs
 * from its host is otherwise painted opaque white, whatever is behind it.
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
  const dark = useTheme() === "dark";
  // The theme is only known on the client. Building the frame before that would paint it
  // light first and then reload it dark, so hold it back until then.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  if (type === "text") {
    return (
      <pre className="font-sans text-[14.5px] leading-[1.75] whitespace-pre-wrap break-words text-ink">
        {body}
      </pre>
    );
  }

  const INVERT = "invert(1) hue-rotate(180deg)";
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>${dark ? "html{background:#eaeaea}" : ""}body{margin:0;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${dark ? "#0f1013" : "#1f2937"};overflow-wrap:anywhere}img{max-width:100%;height:auto}${dark ? `img,video,picture,canvas,svg{filter:${INVERT}}` : ""}</style>
</head><body>${body}</body></html>`;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {mounted ? (
        <iframe
          ref={ref}
          title="Email body"
          srcDoc={srcDoc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{
            height,
            background: dark ? "#eaeaea" : "#fff",
            filter: dark ? INVERT : undefined,
          }}
          className="block w-full"
          onLoad={() => {
            const doc = ref.current?.contentDocument;
            if (doc) setHeight(doc.documentElement.scrollHeight + 8);
          }}
        />
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
