import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { DemoSignInButton, SignInButton } from "@/components/auth-buttons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Sign in · WayBoxAI" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="hidden w-2/5 flex-col justify-between bg-navy p-14 lg:flex">
        <Link href="/" aria-label="WayBoxAI home">
          <Logo size="lg" light />
        </Link>
        <div>
          <h2 className="max-w-[380px] text-4xl leading-tight font-semibold text-white">
            Every shipment update, already sorted.
          </h2>
          <p className="mt-[18px] max-w-[360px] text-[15px] leading-relaxed text-[#b8bcc9]">
            Relevant, Spam, Requires Human Intervention, Unrelated. WayBoxAI files every message
            from your carriers and brokers the moment it lands.
          </p>
        </div>
        <p className="text-[13px] text-[#7b8093]">WayBoxAI · Built for logistics teams</p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center bg-paper px-5 py-12">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="flex w-full max-w-[400px] flex-col gap-[22px]">
          <Link href="/" aria-label="WayBoxAI home" className="lg:hidden">
            <Logo size="lg" />
          </Link>
          <span className="text-[12.5px] font-semibold tracking-[0.06em] text-copper uppercase">
            Sign in
          </span>
          <h1 className="text-3xl font-semibold">Sign in to WayBoxAI</h1>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Connect your Google account to start filtering shipment emails automatically.
          </p>

          <SignInButton fullWidth />

          <p className="text-xs leading-relaxed text-ink-soft">
            By continuing, you agree to let WayBoxAI read and classify incoming mail in your Gmail
            inbox. We never send email on your behalf.
          </p>

          {/* Demo login, hidden when ENABLE_DEMO=false */}
          <DemoSignInButton fullWidth />

          <Link
            href="/"
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to homepage
          </Link>
        </div>
      </main>
    </div>
  );
}
