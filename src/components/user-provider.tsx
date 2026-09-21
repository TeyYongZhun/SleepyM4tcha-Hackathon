"use client";

import { createContext, useContext } from "react";
import { setStoreScope } from "@/lib/store-scope";
import type { UserInfo } from "@/lib/types";

const UserContext = createContext<UserInfo | null>(null);

/** Makes `user_info` available to client components via `useUserInfo()`. */
export function UserProvider({
  user_info,
  children,
}: {
  user_info: UserInfo;
  children: React.ReactNode;
}) {
  // Before any child can read one: everything the browser keeps for this person -- their
  // notifications, what they have read and resolved -- is filed under whoever is signed in,
  // so another account's does not show up as theirs.
  setStoreScope(user_info.id);
  return <UserContext value={user_info}>{children}</UserContext>;
}

export function useUserInfo(): UserInfo {
  const user_info = useContext(UserContext);
  if (!user_info) throw new Error("useUserInfo must be used inside <UserProvider>");
  return user_info;
}
