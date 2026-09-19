import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { SHIPMENT_FIELDS, summarizeShipment, type DocCheck } from "@/lib/shipment";
import type { Email, ShipmentFields } from "@/lib/types";

type Tone = "ok" | "bad" | "warn";

const TONE: Record<Tone, string> = {
  ok: "text-good",
  bad: "text-bad",
  warn: "text-warn",
};

function StatusRow({
  tone,
  title,
  detail,
}: {
  tone: Tone;
  title: string;
  detail: React.ReactNode;
}) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : AlertTriangle;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Icon size={18} className={`mt-0.5 shrink-0 ${TONE[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-xs break-words text-ink-soft">{detail}</p>
      </div>
    </li>
  );
}

function docStatus(check: DocCheck, name: string): { tone: Tone; detail: React.ReactNode } {
  if (check.presence === "present") {
    return { tone: "ok", detail: `Yes · ${check.document!.filename}` };
  }
  if (check.presence === "unreadable") {
    return {
      tone: "warn",
      detail: `Attached (${check.document!.filename}) but couldn't be read: corrupt, scanned or unsupported`,
    };
  }
  return { tone: "bad", detail: `No ${name} attached` };
}

/** A required-but-empty value is loud; an optional or not-applicable one is quiet. */
function Value({
  value,
  required,
  docPresent,
}: {
  value?: string;
  required: boolean;
  docPresent: boolean;
}) {
  if (value) {
    const parts = value.split("; ");
    return (
      <div className="min-w-0 text-[13px] break-words">
        {parts.map((p, i) => (
          <p key={i} className={i > 0 ? "text-xs text-ink-soft" : "font-medium"}>
            {p}
          </p>
        ))}
      </div>
    );
  }
  if (!docPresent) return <span className="text-[13px] text-ink-soft/60">–</span>;
  return required ? (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-bad">
      <XCircle size={13} aria-hidden /> Missing
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] text-ink-soft">
      <MinusCircle size={13} aria-hidden /> Not on document
    </span>
  );
}

interface Source {
  label: string;
  /** null = this source doesn't exist for the email */
  fields: ShipmentFields | null;
  requiredKey: "siRequired" | "blRequired";
}

// Full class names so Tailwind can see them
const GRID: Record<number, string> = {
  1: "grid-cols-[6.5rem_1fr]",
  2: "grid-cols-[6.5rem_1fr_1fr]",
  3: "grid-cols-[5.5rem_1fr_1fr_1fr]",
};

/** Shown on every email, above the AI summary. */
export function ShipmentChecklist({ email }: { email: Email }) {
  const s = summarizeShipment(email);
  const si = docStatus(s.si, "Shipping Instruction");
  const bl = docStatus(s.bl, "Bill of Lading");

  const st = s.structure;
  const where = st.source === "SI" ? "in the SI" : "in the email text (no SI attached)";
  const structure: { tone: Tone; detail: React.ReactNode } =
    st.source === "none"
      ? { tone: "bad", detail: "Can't check: no SI and no shipment details in the email" }
      : st.complete
        ? { tone: "ok", detail: "All " + st.required + " required fields present " + where }
        : {
            tone: "warn",
            detail: (
              <>
                {st.filled}/{st.required} fields present {where}. Missing: {st.missing.join(", ")}
              </>
            ),
          };

  // One column per source that actually has data (SI file, BL file, the email text).
  // With none, keep SI and BL so every field is still listed, all marked as absent.
  const sources: Source[] = [
    ...(s.si.presence === "present"
      ? [{ label: "SI", fields: s.si.document!.fields, requiredKey: "siRequired" as const }]
      : []),
    ...(s.bl.presence === "present"
      ? [{ label: "BL", fields: s.bl.document!.fields, requiredKey: "blRequired" as const }]
      : []),
    ...(s.email.hasInfo
      ? [{ label: "Email", fields: s.email.fields, requiredKey: "siRequired" as const }]
      : []),
  ];
  const columns: Source[] = sources.length
    ? sources
    : [
        { label: "SI", fields: null, requiredKey: "siRequired" },
        { label: "BL", fields: null, requiredKey: "blRequired" },
      ];
  const cols = GRID[columns.length];

  return (
    <section aria-label="Shipment documents" className="space-y-3">
      <h2 className="font-sans text-[11.5px] font-semibold tracking-wide text-ink-soft uppercase">
        Shipment documents
      </h2>

      <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface">
        <StatusRow tone={si.tone} title="Shipping Instruction (SI)" detail={si.detail} />
        <StatusRow tone={bl.tone} title="Bill of Lading (BL)" detail={bl.detail} />
        <StatusRow tone={structure.tone} title="SI information structure" detail={structure.detail} />
      </ul>

      {s.mentionedButMissing.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          The email mentions {s.mentionedButMissing.join(" and ")} but{" "}
          {s.mentionedButMissing.length > 1 ? "neither is" : "it isn't"} attached.
        </p>
      )}
      {s.otherDocuments.length > 0 && (
        <p className="text-xs text-ink-soft">
          Other documents attached: {s.otherDocuments.map((d) => d.filename).join(", ")}
        </p>
      )}

      {/* Field-by-field values, always listed so gaps are obvious */}
      <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
        <div
          className={
            "grid gap-x-3 border-b border-line bg-paper px-3 py-2 text-xs font-semibold text-ink-soft " +
            cols
          }
        >
          <span>Field</span>
          {columns.map((c) => (
            <span key={c.label}>{c.label}</span>
          ))}
        </div>
        <dl className="divide-y divide-line/60">
          {SHIPMENT_FIELDS.map((f) => (
            <div key={f.key} className={"grid gap-x-3 px-3 py-2 " + cols}>
              <dt className="text-xs text-ink-soft">{f.label}</dt>
              {columns.map((c) => (
                <dd key={c.label}>
                  <Value
                    value={c.fields?.[f.key]}
                    required={f[c.requiredKey]}
                    docPresent={c.fields !== null}
                  />
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
