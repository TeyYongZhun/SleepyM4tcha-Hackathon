import "server-only";
import { auth } from "@/auth";
import type { UserInfo } from "./types";

/** The signed-in user's info (`user_info`), or null when signed out. */
export async function getUserInfo(): Promise<UserInfo | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}
