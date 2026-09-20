const SIZES = {
  sm: { box: "h-[26px] w-[26px] rounded-[7px]", icon: 14, text: "text-[14.5px]" },
  md: { box: "h-7 w-7 rounded-lg", icon: 16, text: "text-base" },
  lg: { box: "h-[34px] w-[34px] rounded-[9px]", icon: 19, text: "text-[19px]" },
};

/** WayBoxAI mark + wordmark. Wrap in a Link where it should navigate. */
export function Logo({
  size = "md",
  light = false,
}: {
  size?: keyof typeof SIZES;
  /** White wordmark, for dark backgrounds */
  light?: boolean;
}) {
  const s = SIZES[size];
  return (
    <span className="flex items-center gap-2.5">
      <span className={`flex shrink-0 items-center justify-center bg-copper ${s.box}`}>
        <svg
          viewBox="0 0 24 24"
          width={s.icon}
          height={s.icon}
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      </span>
      <span className={`font-semibold ${s.text} ${light ? "text-white" : "text-ink"}`}>
        WayBoxAI
      </span>
    </span>
  );
}
