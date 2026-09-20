import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth-buttons";
import { Navbar } from "@/components/navbar";
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

  // Gmail is paged, so totals per category aren't known: show no counts there
  const counts = (await usesGmail()) ? undefined : countByCategory(await getEmails());

  return (
    <UserProvider user_info={user_info}>
      {/* The shell is exactly one screen tall; only the panes inside scroll, never the page */}
      <div className="flex h-dvh flex-col overflow-hidden bg-paper">
        <Navbar counts={counts} signOutSlot={<SignOutButton />} />
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </UserProvider>
  );
}
