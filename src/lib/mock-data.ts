import type { Attachment, Email } from "./types";

/**
 * Sample inbox from the WayBoxAI design canvas. Shown for a Google login while
 * BACKEND_API_URL is unset (see lib/emails.ts). Attachments point at the sample
 * files in public/mock so previews work.
 */

const PDF = (id: string, filename: string): Attachment => ({
  id,
  filename,
  mime_type: "application/pdf",
  size: 1554,
  url: "/mock/invoice.pdf",
});

const PHOTO = (id: string, filename: string): Attachment => ({
  id,
  filename,
  mime_type: "image/svg+xml",
  size: 1425,
  url: "/mock/container-photo.svg",
});

const you = [{ email: "you@example.com" }];

export const MOCK_EMAILS: Email[] = [
  {
    email_id: "e1",
    from: { name: "FedEx Ship Manager", email: "shipmentupdates@fedex.com" },
    to: you,
    subject: "Your package has shipped — Tracking 784512396482",
    body_type: "text",
    received_at: "2026-09-19T01:14:00Z",
    unread: true,
    category: "general",
    body: `Your package with tracking number 784512396482 has left the origin facility and is now in transit.

Estimated delivery: Monday, 22 September 2026, by end of day.

Ship to: Benjamin — 14 Jalan Ampang, Kuala Lumpur, Malaysia.

You can track this shipment in real time using the tracking number above on fedex.com.`,
    attachments: [],
    summary: {
      headline: "Package in transit",
      summary: "Package 784512396482 is in transit via FedEx, arriving 22 Sep.",
      confidence: 0.94,
      fields: [
        { label: "Carrier", value: "FedEx" },
        { label: "Reference", value: "784512396482" },
        { label: "Status", value: "In Transit" },
        { label: "ETA", value: "22 Sep 2026" },
      ],
      actions: ["No action needed — track for updates."],
      sentiment: "Informational",
    },
  },
  {
    email_id: "e2",
    from: { name: "DHL Express", email: "noreply@dhl.com" },
    to: you,
    subject: "Customs clearance completed — Booking DHL9273841",
    body_type: "text",
    received_at: "2026-09-18T01:42:00Z",
    category: "general",
    body: `Your shipment (Booking Ref: DHL9273841) has cleared customs at Kuala Lumpur International Airport as of 14 September 2026, 09:42 MYT.

No further duties are owed. The shipment has been handed to our last-mile courier partner and is expected to arrive within 1–2 business days.

Attached is the customs clearance certificate and a photo confirmation of the inspected package. Please keep this email for your records.

If you have any questions about this shipment, reply to this email or contact support quoting the booking reference above.`,
    attachments: [
      PDF("e2_a1", "customs_clearance_certificate.pdf"),
      PHOTO("e2_a2", "package_inspection_photo.svg"),
    ],
    summary: {
      headline: "Cleared customs",
      summary:
        "Shipment DHL9273841 cleared KL customs; no duties owed; arriving via last-mile courier within 1–2 days.",
      confidence: 0.96,
      fields: [
        { label: "Carrier", value: "DHL Express" },
        { label: "Reference", value: "DHL9273841" },
        { label: "Status", value: "Customs Cleared" },
        { label: "ETA", value: "1–2 business days" },
      ],
      actions: ["No action needed — informational."],
      sentiment: "Neutral",
    },
  },
  {
    email_id: "e12",
    from: { name: "Chan Wei Ling", email: "weiling.chan@pacificrimtrading.com" },
    to: you,
    subject: "SI required for booking 5ABC-88123",
    body_type: "text",
    received_at: "2026-09-16T08:40:00Z",
    category: "si_request",
    body: `Hi team,

Kindly raise the shipping instruction for booking 5ABC-88123. Details below:

POL: Port Klang, Malaysia POD: Jebel Ali, UAE
Shipper: Pacific Rim Trading Sdn Bhd
Consignee: Gulf Paper Supplies LLC
Description of Goods: Uncoated woodfree paper, 18 pallets
H.S. CODE: 4802.55

Cut-off is Thursday, so please submit to the carrier before then.

Thanks,
Wei Ling`,
    attachments: [],
    summary: {
      headline: "Shipping instruction requested",
      summary:
        "Customer asks for the SI for booking 5ABC-88123 to be raised and submitted before Thursday's cut-off. SI details are given in the body.",
      reason: "Asks for a shipping instruction to be prepared, issued or submitted.",
      confidence: 0.94,
      fields: [
        { label: "Booking", value: "5ABC-88123" },
        { label: "POL", value: "Port Klang, Malaysia" },
        { label: "POD", value: "Jebel Ali, UAE" },
        { label: "H.S. Code", value: "4802.55" },
      ],
      actions: ["Raise the SI and submit to the carrier before Thursday's cut-off."],
      sentiment: "Urgent",
    },
  },
  {
    email_id: "e3",
    from: { name: "Maersk Line", email: "notifications@maersk.com" },
    to: you,
    subject: "Bill of Lading attached — Booking MSKU7734521",
    body_type: "text",
    received_at: "2026-09-16T03:05:00Z",
    category: "bl_comparison",
    body: `Please find attached the final Bill of Lading for booking MSKU7734521.

Vessel: MV Maersk Selayang, Voyage 214W. Port of Loading: Port Klang. Port of Discharge: Rotterdam.

Please review the document and contact your account manager if any details need correction before the vessel departs on 20 September 2026.`,
    attachments: [PDF("e3_a1", "bill_of_lading_MSKU7734521.pdf")],
    shipment_documents: [
      {
        kind: "BL",
        filename: "bill_of_lading_MSKU7734521.pdf",
        readable: true,
        fields: {
          vessel: "MV Maersk Selayang",
          voyage: "214W",
          port_of_loading: "Port Klang",
          port_of_discharge: "Rotterdam",
          booking_ref: "MSKU7734521",
        },
      },
    ],
    summary: {
      headline: "Final Bill of Lading issued",
      summary: "Final Bill of Lading issued for booking MSKU7734521, departing Port Klang 20 Sep.",
      confidence: 0.91,
      fields: [
        { label: "Carrier", value: "Maersk Line" },
        { label: "Reference", value: "MSKU7734521" },
        { label: "Status", value: "Awaiting Departure" },
        { label: "ETA", value: "Departs 20 Sep 2026" },
      ],
      actions: ["Review the attached B/L for accuracy."],
      sentiment: "Neutral",
    },
  },
  {
    email_id: "e4",
    from: { name: "Evergreen Marine", email: "tracking@evergreen-line.com" },
    to: you,
    subject: "Vessel ETA update — arriving Port Klang 24 Sep",
    body_type: "text",
    received_at: "2026-09-14T06:20:00Z",
    category: "general",
    body: `This is an updated ETA for your container CBHU4471290, carried aboard MV Ever Given II.

New estimated arrival at Port Klang: 24 September 2026 (previously 22 September).

The delay is due to a routing change at the transshipment port. We apologize for any inconvenience.`,
    attachments: [],
    summary: {
      headline: "ETA pushed back two days",
      summary: "Container CBHU4471290 now arriving 24 Sep, a 2-day delay from rerouting.",
      confidence: 0.89,
      fields: [
        { label: "Carrier", value: "Evergreen Marine" },
        { label: "Reference", value: "CBHU4471290" },
        { label: "Status", value: "ETA Updated" },
        { label: "ETA", value: "24 Sep 2026 (delayed 2 days)" },
      ],
      actions: ["No action needed — informational."],
      sentiment: "Neutral",
    },
  },
  {
    email_id: "e5",
    from: { name: "UPS Freight", email: "exceptions@ups.com" },
    to: you,
    subject: "Action required: delivery exception on shipment 1Z9F821",
    body_type: "text",
    received_at: "2026-09-19T00:02:00Z",
    unread: true,
    category: "general",
    body: `We attempted delivery of shipment 1Z9F821 today but were unable to complete it — the address on file could not be verified.

To avoid the shipment being returned to sender, please confirm or correct the delivery address within 48 hours.

You can respond directly to this email with the corrected address, or update it through the UPS tracking portal.`,
    attachments: [],
    summary: {
      headline: "Delivery address needs confirming",
      summary: "UPS could not deliver 1Z9F821 — address needs confirmation within 48 hours.",
      confidence: 0.81,
      fields: [
        { label: "Carrier", value: "UPS Freight" },
        { label: "Reference", value: "1Z9F821" },
        { label: "Status", value: "Delivery Exception" },
        { label: "ETA", value: "Pending address confirmation" },
      ],
      actions: ["Reply with a corrected delivery address."],
      sentiment: "Urgent",
    },
  },
  {
    email_id: "e6",
    from: { name: "Global Trade Partners", email: "docs@gtpartners.com" },
    to: you,
    subject: "Signature required: import duty documents",
    body_type: "text",
    received_at: "2026-09-15T04:30:00Z",
    unread: true,
    category: "invoice_query",
    body: `Your shipment cannot proceed through customs until the attached import declaration is signed.

Please print, sign and return the attached form within 2 business days to avoid storage fees at the port.

If you'd prefer, reply to this email and we can arrange an e-signature link instead.`,
    attachments: [PDF("e6_a1", "import_declaration_form.pdf")],
    summary: {
      headline: "Signature needed on import declaration",
      summary: "Signed import declaration needed within 2 days to avoid storage fees.",
      confidence: 0.88,
      fields: [
        { label: "Carrier", value: "Global Trade Partners" },
        { label: "Reference", value: "GTP-55834" },
        { label: "Status", value: "Awaiting Signature" },
        { label: "ETA", value: "2 business days to respond" },
      ],
      actions: ["Sign and return the attached form, or request e-signature."],
      sentiment: "Urgent",
    },
  },
  {
    email_id: "e7",
    from: { name: "Apex Logistics", email: "ops@apexlogistics.co" },
    to: you,
    subject: "Please confirm pickup time for consignment APX-55210",
    body_type: "text",
    received_at: "2026-09-14T02:10:00Z",
    category: "general",
    body: `We have a pickup window available for consignment APX-55210 on either 22 or 23 September, between 9 AM and 1 PM.

Please reply with your preferred date so we can confirm the driver schedule.

If neither slot works, let us know your availability and we'll find another window.`,
    attachments: [],
    summary: {
      headline: "Pickup date needed",
      summary: "Apex Logistics needs a confirmed pickup date for APX-55210.",
      confidence: 0.79,
      fields: [
        { label: "Carrier", value: "Apex Logistics" },
        { label: "Reference", value: "APX-55210" },
        { label: "Status", value: "Awaiting Confirmation" },
        { label: "ETA", value: "Pickup: 22–23 Sep 2026" },
      ],
      actions: ["Reply with your preferred pickup date."],
      sentiment: "Neutral",
    },
  },
  {
    email_id: "e8",
    from: { name: "Cargo-Deals-Now", email: "promo@cargo-deals-now.biz" },
    to: you,
    subject: "WIN a FREE container shipment today!!!",
    body_type: "text",
    received_at: "2026-09-18T19:41:00Z",
    unread: true,
    category: "spam",
    body: `CONGRATULATIONS! You have been randomly selected to WIN a FREE 40ft container shipment anywhere in the world!

Click the link below within 24 hours to claim your prize before it expires. Limited spots available!

This offer is exclusive to selected winners only. Act now!`,
    attachments: [],
    summary: {
      headline: "Prize scam",
      summary: "Unsolicited prize-scam email, unrelated to any real shipment.",
      confidence: 0.99,
      actions: ["Moved to Spam — no action needed."],
    },
  },
  {
    email_id: "e9",
    from: { name: "refunds-dept29473", email: "noreply@refund-claim-hub.net" },
    to: you,
    subject: "You have won a shipment refund, claim now",
    body_type: "text",
    received_at: "2026-09-13T08:00:00Z",
    category: "spam",
    body: `Our records show you are owed a refund of $482.00 on a recent shipment.

To process your refund, please confirm your bank details by clicking the secure link below.

This request will expire in 24 hours.`,
    attachments: [],
    summary: {
      headline: "Phishing attempt",
      summary: "Phishing attempt requesting bank details under a fake refund claim.",
      confidence: 0.98,
      actions: ["Moved to Spam — do not click any links."],
    },
  },
  {
    email_id: "e10",
    from: { name: "Netflix", email: "info@netflix.com" },
    to: you,
    subject: "Your September statement is ready",
    body_type: "text",
    received_at: "2026-09-12T10:00:00Z",
    category: "invoice_query",
    body: `Your September billing statement is now available in your account.

Amount charged: as per your current plan. No action is needed unless you'd like to update your payment method.`,
    attachments: [],
    summary: {
      headline: "Subscription billing notice",
      summary: "Routine subscription billing notice, not related to any shipment.",
      confidence: 0.93,
      actions: ["No action needed."],
      sentiment: "Neutral",
    },
  },
  {
    email_id: "e11",
    from: { name: "Team Standup Bot", email: "standup@internal-tools.com" },
    to: you,
    subject: "Notes from today's sync",
    body_type: "text",
    received_at: "2026-09-11T09:00:00Z",
    category: "general",
    body: `Here is a summary of what was discussed in today's team sync.

Action items were assigned in the shared doc. Next sync is Thursday at the usual time.`,
    attachments: [],
    summary: {
      headline: "Internal meeting notes",
      summary: "Internal meeting notes, unrelated to shipment tracking.",
      confidence: 0.9,
      actions: ["No action needed."],
      sentiment: "Neutral",
    },
  },
];
