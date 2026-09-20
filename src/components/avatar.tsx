/* eslint-disable @next/next/no-img-element -- remote Google avatars; not worth an image-loader config */
import { initials } from "@/lib/format";

/**
 * "user": copper disc (the signed-in account). "sender": soft paper disc used
 * for email senders. A photo replaces the initials when there is one.
 */
export function Avatar({
  name,
  src,
  size = 32,
  variant = "user",
}: {
  name: string;
  src?: string | null;
  size?: number;
  variant?: "user" | "sender";
}) {
  const style = { width: size, height: size, fontSize: size * 0.38 };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        variant === "user" ? "bg-copper text-white" : "bg-paper-2 text-ink"
      }`}
    >
      {initials(name)}
    </span>
  );
}
