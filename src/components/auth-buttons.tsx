import { DEMO_ENABLED, signIn, signOut } from "@/auth";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
  </svg>
);

const SIZE = {
  md: "px-[22px] py-[13px] text-[15px]",
  lg: "px-[22px] py-[13px] text-[15px]",
};

export function SignInButton({
  size = "md",
  fullWidth = false,
  redirectTo = "/dashboard",
}: {
  size?: keyof typeof SIZE;
  fullWidth?: boolean;
  redirectTo?: string;
}) {
  return (
    <form
      className={fullWidth ? "w-full" : undefined}
      action={async () => {
        "use server";
        await signIn("google", { redirectTo });
      }}
    >
      <button
        type="submit"
        className={`inline-flex items-center justify-center gap-2.5 rounded-lg border border-[#dadce0] bg-white font-semibold text-[#3c4043] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-neutral-50 ${SIZE[size]} ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <GoogleIcon />
        Continue with Google
      </button>
    </form>
  );
}

/** Logs in as the demo user, which browses the dummy inbox in public/dummy. */
export function DemoSignInButton({
  size = "md",
  fullWidth = false,
}: {
  size?: keyof typeof SIZE;
  fullWidth?: boolean;
}) {
  if (!DEMO_ENABLED) return null;
  return (
    <form
      className={fullWidth ? "w-full" : undefined}
      action={async () => {
        "use server";
        await signIn("demo", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className={`inline-flex items-center justify-center rounded-lg bg-btn font-semibold text-on-btn transition hover:bg-btn-hover ${SIZE[size]} ${
          fullWidth ? "w-full" : ""
        }`}
      >
        Try the demo
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-paper-2"
      >
        Sign out
      </button>
    </form>
  );
}
