"use client";

import { AlertTriangle, CheckCheck, CheckCircle2, UserCheck, type LucideIcon } from "lucide-react";
import { addNotification } from "@/lib/notifications";
import { setResolved, useResolvedIds } from "@/lib/resolved";
import type { ComparisonStatus } from "@/lib/types";

/** SI-vs-BL verdict. A separate axis from the category, so it gets its own badge. */
const STATUS_META: Record<ComparisonStatus, { label: string; badge: string; icon: LucideIcon }> = {
  OK: { label: "SI and BL match", badge: "bg-good-bg text-good", icon: CheckCircle2 },
  MISMATCH: { label: "Mismatch found", badge: "bg-bad-bg text-bad", icon: AlertTriangle },
  NEEDS_REVIEW: { label: "Needs human review", badge: "bg-warn-bg text-warn", icon: UserCheck },
};

/** Only these two are something a person can clear. */
export const canResolve = (status?: ComparisonStatus) =>
  status === "MISMATCH" || status === "NEEDS_REVIEW";

/** Sits beside the category in the summary header; gone once resolved. */
export function ResolveButton({
  emailId,
  subject,
  status,
}: {
  emailId: string;
  /** Named in the notification, so the list says which email was cleared. */
  subject: string;
  status?: ComparisonStatus;
}) {
  const resolved = useResolvedIds().has(emailId);
  if (!canResolve(status) || resolved) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setResolved(emailId, true);
        addNotification("resolved", subject);
      }}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-btn px-3 py-1.5 text-[12px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
    >
      <CheckCheck size={14} aria-hidden />
      Resolve
    </button>
  );
}

/** The verdict box. Once a mismatch / needs-review is resolved it turns into a gray "Resolved" note. */
export function StatusBox({
  emailId,
  subject,
  status,
  reasonText,
  defectText,
}: {
  emailId: string;
  /** Named in the notification when the flag is put back. */
  subject: string;
  status: ComparisonStatus;
  reasonText?: string;
  defectText?: string;
}) {
  const resolved = useResolvedIds().has(emailId);
  const meta = STATUS_META[status];

  if (canResolve(status) && resolved) {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-mute-bg px-3 py-2.5 text-mute">
        <CheckCheck size={15} className="mt-px shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">Resolved</p>
          <p className="mt-0.5 text-[11.5px] opacity-90">Was flagged: {meta.label.toLowerCase()}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setResolved(emailId, false);
            addNotification("reopened", subject);
          }}
          className="shrink-0 text-[11.5px] font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Reopen
        </button>
      </div>
    );
  }

  return (
    <div className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 ${meta.badge}`}>
      <meta.icon size={15} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold">{meta.label}</p>
        {reasonText && <p className="mt-0.5 text-[11.5px] opacity-90">{reasonText}</p>}
        {defectText && <p className="mt-0.5 text-[11.5px] opacity-90">{defectText}</p>}
      </div>
    </div>
  );
}
