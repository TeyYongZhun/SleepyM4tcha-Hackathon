import type { ShipmentFieldKey, ShipmentFields } from "../types";

/**
 * Turns the text of a shipping document (SI or B/L) into canonical fields.
 * Input is plain text from any source (.txt, PDF, DOCX paragraphs, XLSX rows
 * joined with " | "), so labels are matched by synonym, not by position.
 */

const PAREN = String.raw`(?:\s*\([^)]*\))?`;

/** Label synonyms per field, matched case-insensitively at the start of a line. */
const LABELS: Record<ShipmentFieldKey, string> = {
  shipper: String.raw`shipper(?:\/exporter)?${PAREN}`,
  // "To the Order of" takes the consignee's place on some documents
  consignee: String.raw`(?:consignee|to\s+the\s+order\s+of)${PAREN}`,
  notify_party: String.raw`notify(?:\s*party)?(?:\/intermediate\s+consignee)?${PAREN}`,
  port_of_loading: String.raw`(?:port\s+of\s+loading|load\s+port|pol)${PAREN}`,
  port_of_discharge: String.raw`(?:port\s+of\s+discharge|discharge\s+port|pod)${PAREN}`,
  containers: String.raw`(?:no\.?\s*of\s+containers(?:\s+or\s+packages)?|container\s+count|total\s+containers)`,
  // PDFs sometimes render the "(KGS)" bracket as "nn(KGS)"
  gross_weight: String.raw`(?:total\s+)?gross\s*(?:weight|wt)(?:nn)?${PAREN}`,
  vessel: String.raw`(?:vessel\s*name|ocean\s+vessel|export\s+carrier${PAREN}|vessel)`,
  voyage: String.raw`(?:voy(?:age)?\.?\s*(?:no\.?)?)(?![a-z])`,
  goods_description: String.raw`(?:kinds\s+of\s+packages;?\s*description\s+of\s+goods|description\s+of\s+goods|commodity|description)`,
  hs_code: String.raw`hs\s*code`,
  booking_ref: String.raw`booking(?:\s*(?:ref(?:erence)?|no\.?))?`,
  oc_no: String.raw`oc\s*(?:no\.?|number)`,
  freight: String.raw`freight`,
  bl_number: String.raw`(?:bill\s+of\s+lading\s+no\.?|b\/?l\s*(?:no\.?|number))${PAREN}`,
};

const SEP = String.raw`\s*[:|]?\s*`;

const MATCHERS = (Object.keys(LABELS) as ShipmentFieldKey[]).map((key) => ({
  key,
  re: new RegExp(`^${LABELS[key]}${SEP}(.*)$`, "i"),
}));

/** Labels that can also appear in the middle of a line, e.g. "B/L NUMBER: X BOOKING NO. Y" */
const MID_LINE = new RegExp(
  String.raw`\s+(?=(?:booking\s*(?:ref|no)|hs\s*code|freight|oc\s*no|b\/?l\s*(?:no|number))\b)`,
  "gi",
);

/** Fields whose value continues onto address lines. */
const MULTILINE: Partial<Record<ShipmentFieldKey, number>> = {
  shipper: 4,
  consignee: 4,
  notify_party: 4,
};

// CJK text ("发货人") in bilingual templates, and the empty brackets it leaves behind
const CJK = /[⺀-鿿＀-￯]+/g;

function clean(line: string): string {
  return line
    .replace(CJK, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function matchLabel(line: string) {
  for (const { key, re } of MATCHERS) {
    const m = line.match(re);
    if (m) return { key, inline: m[1].trim() };
  }
  return null;
}

/** Blank-looking values that mean "not provided" (N/A, ______ MTS, TBA...). */
function isPlaceholder(value: string): boolean {
  const v = value.replace(/[_\s-]+/g, " ").replace(/\b(mts|kgs?)\b/gi, "").trim();
  return v === "" || /^(n\/?a|nil|none|null|tba|tbc|tbd|not (available|provided|stated))$/i.test(v);
}

/** " | " separates spreadsheet cells; show them as address parts instead. */
const tidy = (v: string) => v.replace(/\s*\|\s*/g, "; ").replace(/\s{2,}/g, " ").trim();

export function parseShipmentText(text: string): ShipmentFields {
  // Break mid-line labels onto their own line, then clean each line
  const lines = text
    .split(/\r?\n/)
    .flatMap((raw) => {
      const isIndented = /^\s+\S/.test(raw);
      const parts = clean(raw).replace(MID_LINE, "\n").split("\n");
      // keep indentation info by re-adding a marker used for continuation checks
      return parts.map((p, i) => ({ text: p, indented: isIndented && i === 0 }));
    })
    .filter((l) => l.text.length > 0);

  const fields: ShipmentFields = {};

  for (let i = 0; i < lines.length; i++) {
    const hit = matchLabel(lines[i].text);
    if (!hit) continue;
    const { key } = hit;
    let value = hit.inline;

    // Gather continuation lines (addresses, or a value on the line below its label)
    const maxExtra = MULTILINE[key] ?? (value ? 0 : 1);
    const extra: string[] = [];
    for (let j = i + 1; j < lines.length && extra.length < maxExtra; j++) {
      if (matchLabel(lines[j].text)) break;
      // Underline rows ("=====") and table headers are not values
      if (/^[=\-_*]{3,}$/.test(lines[j].text)) break;
      if (/^container no\b/i.test(lines[j].text)) break;
      extra.push(lines[j].text);
    }
    if (extra.length) value = [value, ...extra].filter(Boolean).join("; ");

    value = tidy(value);
    // First occurrence wins (e.g. an SI and its table both mention "Description")
    if (value && !isPlaceholder(value) && !fields[key]) fields[key] = value;
  }

  // PDFs list goods in a container table: "PURJ4736471 40'HC UNCOATED WOODFREE PAPER 21,887"
  if (!fields.goods_description) {
    const goods = new Set<string>();
    for (const l of lines) {
      const m = l.text.match(/^[A-Z]{4}\d{6,7}\s+\S+\s+(.+?)\s+[\d,]+$/);
      if (m) goods.add(m[1]);
    }
    if (goods.size) fields.goods_description = [...goods].join("; ");
  }

  // "Export Carrier (vessel, voyage): SHIP V.123" carries both
  if (fields.vessel && !fields.voyage && /^\s*export\s+carrier/im.test(text)) {
    const v = fields.vessel.match(/\bV\.\s*\S+/i);
    if (v) fields.voyage = v[0];
  }

  return fields;
}

const OC_PATTERN = /\b5[A-Z]{3}-\d{5}\b/;

/**
 * Pulls shipment info out of an email's own text. Booking desks often paste the
 * instruction straight into the body:
 *
 *   POL: BUATAN, INDONESIA
 *   Shipper:
 *   APRIL FINE PAPER TRADING
 *   ...
 *   Description of Goods:
 *   1X40'HC
 *   PAPERONE DIGITAL COPIER PAPER
 *   H.S.CODE: 48025600
 *
 * Only the newest message is read (quoted replies below "From:" / a rule are ignored).
 */
export function parseEmailBody(subject: string, body: string): ShipmentFields {
  const current = body.split(/\n\s*[_\-=]{5,}\s*\n|\n\s*From:/i)[0];
  const lines = current.split(/\r?\n/).map((l) => l.trim());
  const fields: ShipmentFields = {};

  const BLOCKS: [RegExp, ShipmentFieldKey][] = [
    [/^shipper\s*:\s*(.*)$/i, "shipper"],
    [/^consignee\s*:\s*(.*)$/i, "consignee"],
    [/^notify(?:\s*party)?\s*:\s*(.*)$/i, "notify_party"],
  ];
  const INLINE: [RegExp, ShipmentFieldKey][] = [
    [/^(?:pol|port of loading)\s*:\s*(.+)$/i, "port_of_loading"],
    [/^(?:pod|port of discharge)\s*:\s*(.+)$/i, "port_of_discharge"],
    [/^h\.?s\.?\s*code\s*:\s*(.+)$/i, "hs_code"],
    [/^gross\s*(?:wt|weight)\s*:\s*(.+)$/i, "gross_weight"],
    [/^booking\s*(?:ref|no)\.?\s*:\s*(.+)$/i, "booking_ref"],
    [/^vessel(?:\s*name)?\s*:\s*(.+)$/i, "vessel"],
    [/^voy(?:age)?\.?(?:\s*no\.?)?\s*:\s*(.+)$/i, "voyage"],
    [/^freight\s*:\s*(.+)$/i, "freight"],
  ];

  /** Lines after a label, up to the next blank line. */
  const blockAfter = (start: number) => {
    const out: string[] = [];
    for (let j = start + 1; j < lines.length && lines[j]; j++) out.push(lines[j]);
    return out;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const block = BLOCKS.find(([re]) => re.test(line));
    if (block) {
      const [re, key] = block;
      const inline = line.match(re)![1].trim();
      const value = [inline, ...(inline ? [] : blockAfter(i))].filter(Boolean).join("; ");
      if (value && !fields[key]) fields[key] = value;
      continue;
    }

    // "Description of Goods:" then "1X40'HC" (containers) then the goods
    if (/^description of goods\s*:/i.test(line)) {
      const inline = line.replace(/^[^:]*:\s*/, "");
      const rest = inline ? [inline] : blockAfter(i);
      // stop before the HS code / weight lines that follow the goods
      const goodsLines = rest.filter((l) => !/^(h\.?s\.?\s*code|gross\s*(wt|weight))\s*:/i.test(l));
      const first = goodsLines[0]?.match(/^(\d+)\s*[xX]\s*(\d+'?\s*[A-Za-z]+)$/);
      if (first) {
        fields.containers = `${first[1]} x ${first[2].replace(/\s+/g, "")}`;
        goodsLines.shift();
      }
      if (goodsLines.length && !fields.goods_description) {
        fields.goods_description = goodsLines.join("; ");
      }
      continue;
    }

    for (const [re, key] of INLINE) {
      const m = line.match(re);
      if (m && !isPlaceholder(m[1]) && !fields[key]) fields[key] = m[1].trim();
    }
  }

  // "Please find Shipping instruction for 5RSG-30068" / "for OC 5RSG-00133" / subject line
  const oc =
    current.match(/instruction for\s+(5[A-Z]{3}-\d{5})/i)?.[1] ??
    current.match(/\bOC(?:\s*No\.?)?\s*:?\s*(5[A-Z]{3}-\d{5})/i)?.[1] ??
    subject.match(OC_PATTERN)?.[0] ??
    current.match(OC_PATTERN)?.[0];
  if (oc) fields.oc_no = oc;

  return fields;
}

export type DocKind = "SI" | "BL" | "OTHER";

/** Classify by the document's title, found in the first few non-empty lines. */
export function detectDocKind(text: string): DocKind {
  const head = text
    .split(/\r?\n/)
    .map((l) => l.replace(CJK, "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
  // "BILL OF LADING INSTRUCTION" / "BL INSTRUCTION" are the shipper's instructions to draft the B/L
  if (/instruction/i.test(head)) return "SI";
  if (/bill of lading|^\s*b\/?l\b/im.test(head)) return "BL";
  return "OTHER";
}
