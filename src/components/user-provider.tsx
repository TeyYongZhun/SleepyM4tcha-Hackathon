"use client";

import { createContext, useContext } from "react";
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
  return <UserContext value={user_info}>{children}</UserContext>;
}

export function useUserInfo(): UserInfo {
  const user_info = useContext(UserContext);
  if (!user_info) throw new Error("useUserInfo must be used inside <UserProvider>");
  return user_info;
}
