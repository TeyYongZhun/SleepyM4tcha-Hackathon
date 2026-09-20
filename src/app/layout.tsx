import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WayBoxAI",
  description: "AI email triage for logistics: your shipment inbox, sorted automatically.",
};

/**
 * Runs before first paint so a dark-mode visitor never sees a light flash.
 * Saved choice wins; otherwise follow the OS setting.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script above sets data-theme before React hydrates
    <html
      lang="en"
      className={`${plex.variable} ${grotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* dangerouslySetInnerHTML, not a child string or next/script: React renders
            this straight into the server HTML, so it runs before first paint and is
            never treated as a client-rendered script (which would never execute). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
