import { Bell, FileText, Receipt, ShieldAlert, type LucideIcon } from "lucide-react";
import { getCategoryByEmailCategory } from "@/lib/categories";
import type { Email, EmailCategory } from "@/lib/types";
import { REVIEW_REASON_TEXT } from "@/lib/shipment";
import { ResolveButton, StatusBox } from "./resolve-status";
import { ShipmentChecklist } from "./shipment-checklist";

const CATEGORY_ICON: Record<EmailCategory, LucideIcon> = {
  bl_comparison: FileText,
  si_request: Bell,
  invoice_query: Receipt,
  general: Bell,
  spam: ShieldAlert,
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
          <ResolveButton emailId={email.email_id} status={email.status} />
        </div>

        {email.category === "bl_comparison" && !email.status && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-info-bg px-3 py-2.5 text-info">
            <FileText size={15} className="mt-px shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold">Draft BL</p>
              <p className="mt-0.5 text-[11.5px] opacity-90">No SI and BL pair to compare yet.</p>
            </div>
          </div>
        )}

        {email.status && (
          <StatusBox
            emailId={email.email_id}
            status={email.status}
            reasonText={email.review_reason ? REVIEW_REASON_TEXT[email.review_reason] : undefined}
            defectText={
              email.defect_fields?.length
                ? `Differs on: ${email.defect_fields.join(", ").replace(/_/g, " ")}`
                : undefined
            }
          />
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
            <div
              className="h-full"
              // Hue 0 (red) at 0% up to 120 (green) at 100%, passing through amber
              style={{
                width: `${confidence}%`,
                backgroundColor: `hsl(${Math.round(confidence * 1.2)} 65% 42%)`,
              }}
            />
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
