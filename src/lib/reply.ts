import type { Email } from "./types";

/**
 * Gmail compose window addressed to the sender, subject "Re: ...". Gmail can't be told to
 * thread a compose link (that would need the compose scope and the API), so it opens as a
 * fresh message. `authUser` picks the Gmail account when several are signed in.
 */
export function gmailReplyUrl(email: Email, authUser?: string | null): string {
  const subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email.from.email,
    su: subject,
  });
  if (authUser) params.set("authuser", authUser);
  return `https://mail.google.com/mail/?${params}`;
}
