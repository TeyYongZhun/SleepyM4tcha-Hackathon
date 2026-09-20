import type { EmailCategory } from "./types";

export type CategorySlug =
  | "all"
  | "bl-comparison"
  | "si-request"
  | "invoice-query"
  | "general"
  | "spam";

export interface CategoryMeta {
  slug: CategorySlug;
  label: string;
  /** Email category this tab filters on; null = everything */
  category: EmailCategory | null;
  /** Tailwind classes for the pill / icon tile */
  badge: string;
  /** Tailwind class for the confidence bar fill */
  bar: string;
}

/**
 * The five classifier categories, in the order they appear as dashboard tabs.
 *
 * Three different string spaces are in play, so keep them straight:
 *   slug      "bl-comparison"   hyphenated, appears in the URL
 *   category  "bl_comparison"   underscored, the value on the wire and in JSON
 *   label     "BL Comparison"   what a person reads
 *
 * Colours distinguish rather than judge: these are document types, not quality
 * verdicts. The SI-vs-BL pass/fail lives on `Email.status`, a separate axis.
 */
export const CATEGORIES: CategoryMeta[] = [
  { slug: "all", label: "All", category: null, badge: "", bar: "" },
  {
    slug: "bl-comparison",
    label: "BL Comparison",
    category: "bl_comparison",
    badge: "bg-info-bg text-info",
    bar: "bg-info",
  },
  {
    slug: "si-request",
    label: "SI Request",
    category: "si_request",
    badge: "bg-good-bg text-good",
    bar: "bg-good",
  },
  {
    slug: "invoice-query",
    label: "Invoice Query",
    category: "invoice_query",
    badge: "bg-warn-bg text-warn",
    bar: "bg-warn",
  },
  {
    slug: "general",
    label: "General",
    category: "general",
    badge: "bg-mute-bg text-mute",
    bar: "bg-mute",
  },
  {
    slug: "spam",
    label: "Spam",
    category: "spam",
    badge: "bg-bad-bg text-bad",
    bar: "bg-bad",
  },
];

/** The tab used when a category is missing or unrecognised. */
export const FALLBACK_CATEGORY: CategoryMeta = CATEGORIES.find(
  (c) => c.category === "general",
)!;

export function getCategoryBySlug(slug: string): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

/**
 * Never throws: an unknown category falls back to General rather than crashing
 * the summary panel, which is what the old non-null assertion did.
 */
export function getCategoryByEmailCategory(c: EmailCategory): CategoryMeta {
  return CATEGORIES.find((m) => m.category === c) ?? FALLBACK_CATEGORY;
}
