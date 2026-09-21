import Link from "next/link";
import { ArrowRight, Boxes, Mail, Menu, UserCheck } from "lucide-react";
import { auth } from "@/auth";
import { DemoSignInButton, SignInButton } from "@/components/auth-buttons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

// One row per category (src/lib/categories.ts), same tones as the real dashboard,
// so this preview is a fair sample of the tabs, not just a mock-up.
const PREVIEW = [
  {
    from: "Vital Solutions",
    time: "8:02 AM",
    subject: "REQUEST BL DRAFT _ PO 26067 _ COATED IVORY BOARD",
    label: "BL Comparison",
    tone: "bg-info-bg text-info",
  },
  {
    from: "Pacific Rim Trading",
    time: "Yesterday",
    subject: "SI NEEDED _ 5ABC-88123 _ Gulf Paper Supplies LLC",
    label: "SI Request",
    tone: "bg-good-bg text-good",
  },
  {
    from: "Fujito Group",
    time: "9:14 AM",
    subject: "RE_ LOCAL CHARGES FOB - KARGOSMAR - 5AKR-61841",
    label: "Invoice Query",
    tone: "bg-warn-bg text-warn",
  },
  {
    from: "DHL Express",
    time: "Fri",
    subject: "Customs clearance completed — Booking DHL9273841",
    label: "General",
    tone: "bg-mute-bg text-mute",
  },
  {
    from: "Cargo-Deals-Now",
    time: "3:41 AM",
    subject: "WIN a free container shipment today",
    label: "Spam",
    tone: "bg-bad-bg text-bad",
  },
];

const STEPS = [
  {
    title: "Connect your inbox",
    body: "Sign in with Google in one click. WayBoxAI reads mail from your shipment-related senders.",
  },
  {
    title: "AI classifies every message",
    body: "Each email is sorted into BL Comparison, SI Request, Invoice Query, General or Spam — and a BL Comparison email also gets a match/mismatch verdict against its SI.",
  },
  {
    title: "Review side by side",
    body: "Open any email to see the full message next to an AI summary, so you can act in seconds.",
  },
];

const FEATURES = [
  {
    icon: Menu,
    title: "Smart classification",
    body: "Every message is triaged automatically, so tracking updates never get lost in the noise.",
  },
  {
    icon: UserCheck,
    title: "Human-in-the-loop",
    body: "A mismatch or an unreadable attachment is flagged — “Mismatch · Consignee, Notify Party”, “Needs review · Missing attachment” — with the reason beside it, instead of guessed at.",
  },
  {
    icon: Mail,
    title: "Full context, side by side",
    body: "See the original email and an AI summary together, with no tab-switching.",
  },
  {
    icon: Boxes,
    title: "Any carrier, any broker",
    body: "Works with mail from express couriers, ocean and air carriers, freight forwarders and customs brokers alike.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="snap-page flex flex-1 flex-col bg-paper text-ink">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-5 backdrop-blur sm:px-8 lg:px-16">
        <Link href="/" aria-label="WayBoxAI home">
          <Logo size="lg" />
        </Link>
        <nav className="hidden items-center gap-9 md:flex">
          <a href="#how-it-works" className="text-[15px] text-ink-soft hover:text-ink">
            How it works
          </a>
          <a href="#features" className="text-[15px] text-ink-soft hover:text-ink">
            Features
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="rounded-lg bg-btn px-5 py-2.5 text-[14.5px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
          >
            {signedIn ? "Go to dashboard" : "Sign in"}
          </Link>
        </div>
      </header>

      <main>
        <div className="flex min-h-[calc(65svh-6rem)] snap-start flex-col justify-center">
          <section className="mx-auto flex max-w-[1200px] flex-col items-center gap-14 px-5 pt-16 pb-14 sm:px-8 lg:flex-row lg:gap-16 lg:px-16 lg:pt-24 lg:pb-[72px]">
            <div className="flex-1">
              <span className="mb-[18px] inline-block text-[12.5px] font-semibold tracking-[0.06em] text-copper uppercase">
                AI email triage for logistics
              </span>
              <h1 className="text-[40px] leading-[1.08] font-semibold tracking-[-0.01em] sm:text-[54px]">
                Your shipment inbox, sorted automatically.
              </h1>
              <p className="mt-6 max-w-[480px] text-lg leading-relaxed text-ink-soft">
                WayBoxAI reads the mail coming in from carriers, freight forwarders and customs
                brokers, then sorts every message so tracking updates never get buried under spam
                and newsletters.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                {signedIn ? (
                  <Link
                    href="/dashboard"
                    className="rounded-lg bg-btn px-[22px] py-[13px] text-[15px] font-semibold text-on-btn btn-lift hover:bg-btn-hover"
                  >
                    Go to dashboard
                  </Link>
                ) : (
                  <>
                    <SignInButton size="lg" />
                    <DemoSignInButton size="lg" />
                  </>
                )}
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 text-[15px] font-semibold"
                >
                  See how it works
                  <ArrowRight size={16} aria-hidden />
                </a>
              </div>
            </div>

            <div aria-hidden className="flex flex-1 justify-center">
              <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_50px_-20px_rgba(18,23,43,0.25)]">
                <p className="mb-3.5 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                  Inbox
                </p>
                {PREVIEW.map((m) => (
                  <div key={m.from} className="mb-1.5 rounded-[10px] px-2 py-2.5 last:mb-0">
                    <div className="flex justify-between">
                      <span className="text-[13.5px] font-semibold">{m.from}</span>
                      <span className="text-[11.5px] text-ink-soft">{m.time}</span>
                    </div>
                    <p className="truncate text-[12.5px] text-ink-soft">{m.subject}</p>
                    <span
                      className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.tone}`}
                    >
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <p className="mx-auto max-w-[640px] px-5 pb-[72px] text-center text-sm text-ink-soft">
            Works with mail from couriers, shipping lines, customs brokers and freight forwarders,
            with no special integration required.
          </p>
        </div>

        <section
          id="how-it-works"
          className="flex min-h-[calc(65svh-6rem)] snap-start scroll-mt-4 flex-col justify-center bg-navy px-5 py-16 sm:px-8 lg:px-16"
        >
          <div className="mx-auto max-w-[1200px]">
            <h2 className="text-[32px] font-semibold text-white">How it works</h2>
            <ol className="mt-11 grid gap-7 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="card-lift group rounded-[14px] border border-transparent bg-navy-2 p-7"
                >
                  <span className="mb-[18px] inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-copper text-[13px] font-bold text-white transition-transform duration-200 group-hover:scale-110">
                    {i + 1}
                  </span>
                  <h3 className="mb-2.5 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-[#b8bcc9]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="features"
          className="flex min-h-[calc(65svh-6rem)] snap-start scroll-mt-4 flex-col justify-center"
        >
          <div className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 lg:px-16">
            <h2 className="text-[32px] font-semibold">Built for shipment inboxes</h2>
            <div className="mt-10 grid gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="card-lift group rounded-[14px] border border-line p-6">
                  <span className="mb-4 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-paper-2 text-copper transition-colors duration-200 group-hover:bg-copper group-hover:text-white">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h3 className="mb-2 text-[16.5px] font-semibold">{title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex min-h-[calc(65svh-6rem)] snap-start flex-col">
          <section className="flex flex-1 flex-col items-center justify-center bg-copper px-5 py-16 text-center sm:px-8">
            <h2 className="mx-auto mb-7 max-w-[640px] text-[28px] font-semibold text-white">
              Stop digging through your inbox for tracking numbers.
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {signedIn ? (
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-white px-6 py-[13px] text-[15px] font-semibold text-[#12172b]"
                >
                  Go to dashboard
                </Link>
              ) : (
                <SignInButton size="lg" />
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="flex snap-end items-center justify-between border-t border-line px-5 py-8 sm:px-8 lg:px-16">
        <Logo size="sm" />
        <span className="text-[13px] text-ink-soft">© {new Date().getFullYear()} WayBoxAI</span>
      </footer>
    </div>
  );
}
