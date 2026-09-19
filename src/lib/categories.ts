import type { EmailCategory } from "./types";

export type CategorySlug =
  | "all"
  | "relevant"
  | "spam"
  | "human-intervention"
  | "unrelated";

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

export const CATEGORIES: CategoryMeta[] = [
  { slug: "all", label: "All", category: null, badge: "", bar: "" },
  {
    slug: "relevant",
    label: "Relevant",
    category: "relevant",
    badge: "bg-good-bg text-good",
    bar: "bg-good",
  },
  {
    slug: "spam",
    label: "Spam",
    category: "spam",
    badge: "bg-bad-bg text-bad",
    bar: "bg-bad",
  },
  {
    slug: "human-intervention",
    label: "Requires Human Intervention",
    category: "human_intervention",
    badge: "bg-warn-bg text-warn",
    bar: "bg-warn",
  },
  {
    slug: "unrelated",
    label: "Unrelated",
    category: "unrelated",
    badge: "bg-mute-bg text-mute",
    bar: "bg-mute",
  },
];

export function getCategoryBySlug(slug: string): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryByEmailCategory(c: EmailCategory): CategoryMeta {
  return CATEGORIES.find((m) => m.category === c)!;
}
