import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileText,
  Receipt,
  ShieldAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { getCategoryByEmailCategory } from "@/lib/categories";
import type { ComparisonStatus, Email, EmailCategory, ReviewReason } from "@/lib/types";
import { ShipmentChecklist } from "./shipment-checklist";

const CATEGORY_ICON: Record<EmailCategory, LucideIcon> = {
  bl_comparison: FileText,
  si_request: Bell,
  invoice_query: Receipt,
  general: Bell,
  spam: ShieldAlert,
};

/** SI-vs-BL verdict. A separate axis from the category, so it gets its own badge. */
const STATUS_META: Record<ComparisonStatus, { label: string; badge: string; icon: LucideIcon }> = {
  OK: { label: "SI and BL match", badge: "bg-good-bg text-good", icon: CheckCircle2 },
  MISMATCH: { label: "Mismatch found", badge: "bg-bad-bg text-bad", icon: AlertTriangle },
  NEEDS_REVIEW: { label: "Needs human review", badge: "bg-warn-bg text-warn", icon: UserCheck },
};

const REVIEW_REASON_TEXT: Record<ReviewReason, string> = {
  missing_attachment: "only one of the SI / BL was received",
  unreadable: "a document could not be read (empty, corrupt, or a scan with no text)",
  wrong_doc_type: "an attachment is not an SI or BL",
  missing_value: "a compared field is blank on one side",
};

const LABEL = "text-[10.5px] font-semibold tracking-wide text-ink-soft uppercase";

/**
 * Right pane. The shipment-document checks come first, then the AI summary
 * (classification, key details, TL;DR, suggested action, sentiment).
 */
export function SummaryPanel({ email }: { email: Email }) {
  const s = email.summary;
  const meta = getCategoryByEmailCategory(email.category);
  const Icon = CATEGORY_ICON[email.category];
  const status = email.status ? STATUS_META[email.status] : undefined;
  const confidence = s?.confidence !== undefined ? Math.round(s.confidence * 100) : undefined;

  return (
    <aside className="space-y-6 px-[22px] py-[26px]">
      <ShipmentChecklist email={email} />

      <div className="border-t border-line pt-6">
        <h2 className="mb-4 font-sans text-[11.5px] font-semibold tracking-wide text-ink-soft uppercase">
          AI summary
        </h2>

        <div className="mb-4 flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${meta.badge}`}
          >
            <Icon size={16} aria-hidden />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold">{meta.label}</p>
            {confidence !== undefined && (
              <p className="text-[11.5px] text-ink-soft">{confidence}% confidence</p>
            )}
          </div>
        </div>

        {status && (
          <div className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5 ${status.badge}`}>
            <status.icon size={15} className="mt-px shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold">{status.label}</p>
              {email.review_reason && (
                <p className="mt-0.5 text-[11.5px] opacity-90">
                  {REVIEW_REASON_TEXT[email.review_reason]}
                </p>
              )}
              {!!email.defect_fields?.length && (
                <p className="mt-0.5 text-[11.5px] opacity-90">
                  Differs on: {email.defect_fields.join(", ").replace(/_/g, " ")}
                </p>
              )}
            </div>
          </div>
        )}

        {confidence !== undefined && (
          <div
            role="progressbar"
            aria-label="Classification confidence"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mb-[22px] h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div className={`h-full ${meta.bar}`} style={{ width: `${confidence}%` }} />
          </div>
        )}

        {!s ? (
          <p className="text-[13px] text-ink-soft">No summary available for this email yet.</p>
        ) : (
          <div className="space-y-5">
            {s.fields && s.fields.length > 0 && (
              <dl className="space-y-[9px]">
                {s.fields.map((f) => (
                  <div key={f.label} className="flex justify-between gap-3 text-[12.5px]">
                    <dt className="text-ink-soft">{f.label}</dt>
                    <dd className="text-right font-semibold break-words">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="rounded-[10px] border border-line bg-surface px-3.5 py-[13px]">
              <p className={`${LABEL} mb-[7px]`}>TL;DR</p>
              <p className="text-[13px] font-semibold">{s.headline}</p>
              <p className="mt-1 text-[13px] leading-relaxed">{s.summary}</p>
              {s.reason && <p className="mt-2 text-xs text-ink-soft">{s.reason}</p>}
            </div>

            {s.actions && s.actions.length > 0 && (
              <div>
                <p className={`${LABEL} mb-2`}>Suggested action</p>
                <ul className="space-y-1.5">
                  {s.actions.map((a) => (
                    <li
                      key={a}
                      className="rounded-[10px] border border-line bg-surface px-[13px] py-[11px] text-[13px] leading-normal"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {s.sentiment && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-soft">Sentiment</span>
                <span className="rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11.5px] font-semibold">
                  {s.sentiment}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
