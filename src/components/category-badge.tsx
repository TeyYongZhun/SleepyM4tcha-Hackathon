import { getCategoryByEmailCategory } from "@/lib/categories";
import type { EmailCategory } from "@/lib/types";

export function CategoryBadge({ category }: { category: EmailCategory }) {
  const meta = getCategoryByEmailCategory(category);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
}
