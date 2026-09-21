import { AlertCircle, CheckCheck, CheckCircle2, MailCheck, MailX, Undo2 } from "lucide-react";
import type { NotificationKind } from "@/lib/notifications";

/**
 * How each recorded event is worded and coloured. Shared by the reply toast and the
 * notifications dropdown, so the same event never reads two different ways.
 *
 * sent: the reply left the user's account (found in their Sent mail), but nothing is known
 *   yet about whether it arrived.
 * delivered: the window for a delivery failure passed without one, so the receiving server
 *   took it. That is as far as mail can be followed from outside -- it says nobody rejected
 *   it, not that the person has read it.
 * not-sent: the compose window closed and nothing new turned up in Sent.
 * bounced: it came straight back; the address doesn't exist.
 * resolved / reopened: a mismatch or needs-review flag cleared by hand, or put back.
 */
export const NOTIFICATION: Record<
  NotificationKind,
  {
    icon: typeof CheckCircle2;
    /** Chip behind the icon. */
    tone: string;
    /** The countdown bar on the toast. Written out in full: a class pieced together at
     *  runtime is invisible to Tailwind when it scans the source, so it never ships. */
    bar: string;
    title: string;
    text: (subject: string) => string;
  }
> = {
  sent: {
    icon: CheckCircle2,
    tone: "bg-info-bg text-info",
    bar: "bg-info",
    title: "Reply sent",
    text: (to) => `Your reply to ${to} left your account.`,
  },
  delivered: {
    icon: MailCheck,
    tone: "bg-good-bg text-good",
    bar: "bg-good",
    title: "Reply delivered",
    text: (to) => `${to} received it — nothing came back undelivered.`,
  },
  "not-sent": {
    icon: AlertCircle,
    tone: "bg-warn-bg text-warn",
    bar: "bg-warn",
    title: "No reply sent",
    text: () => "Nothing new turned up in your sent mail.",
  },
  bounced: {
    icon: MailX,
    tone: "bg-bad-bg text-bad",
    bar: "bg-bad",
    title: "Address doesn't exist",
    text: (to) => `${to} doesn't exist — Gmail returned your reply undelivered.`,
  },
  resolved: {
    icon: CheckCheck,
    tone: "bg-mute-bg text-mute",
    bar: "bg-mute",
    title: "Marked resolved",
    text: (subject) => `“${subject}” no longer needs review.`,
  },
  reopened: {
    icon: Undo2,
    tone: "bg-warn-bg text-warn",
    bar: "bg-warn",
    title: "Reopened",
    text: (subject) => `“${subject}” is flagged for review again.`,
  },
};
