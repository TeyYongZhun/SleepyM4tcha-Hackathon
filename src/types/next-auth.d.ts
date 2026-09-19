import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    /** True for the demo account (dummy data only) */
    demo?: boolean;
    error?: "RefreshTokenError";
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    demo?: boolean;
    expiresAt?: number;
    error?: "RefreshTokenError";
  }
}
