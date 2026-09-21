import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth-buttons";
import { Navbar } from "@/components/navbar";
import { ToastHost } from "@/components/toast";
import { UserProvider } from "@/components/user-provider";
import { countByCategory, getEmails, usesGmail } from "@/lib/emails";
import { getUserInfo } from "@/lib/user";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const session = await auth();
  const user_info = await getUserInfo();
  // Also bounce if Google refresh failed: the user must sign in again
  if (!user_info || session?.error === "RefreshTokenError") redirect("/login");

  // Gmail is paged, so totals per category aren't known up front: the navbar counts them in
  // the background and fills the numbers in. Every other source is in memory already.
  const gmail = await usesGmail();
  const counts = gmail ? undefined : countByCategory(await getEmails());

  return (
    <UserProvider user_info={user_info}>
      {/* The shell is exactly one screen tall; only the panes inside scroll, never the page */}
      <div className="flex h-dvh flex-col overflow-hidden bg-paper">
        <Navbar counts={counts} liveCounts={gmail} signOutSlot={<SignOutButton />} />
        <main className="min-h-0 flex-1">{children}</main>
        {/* Once for the whole dashboard: it announces whatever lands in the notification
            store, and stays put while you move between emails */}
        <ToastHost />
      </div>
    </UserProvider>
  );
}
