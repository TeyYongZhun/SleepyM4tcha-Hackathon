import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";

/**
 * Google sign-in. We request Gmail access + offline access so the backend can read the
 * inbox on the user's behalf using the access token. It is gmail.modify rather than
 * gmail.readonly only so an opened email can be marked read in Gmail itself (removing the
 * UNREAD label): that call is refused under read-only. The app changes nothing else.
 */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      // Google only returns a new refresh token sometimes
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

/** Demo login (no Google needed): browses the bundled dummy inbox. Disable with ENABLE_DEMO=false. */
export const DEMO_ENABLED = process.env.ENABLE_DEMO !== "false";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    ...(DEMO_ENABLED
      ? [
          Credentials({
            id: "demo",
            name: "Demo account",
            credentials: {},
            authorize: () => ({
              id: "demo",
              name: "Demo User",
              email: "demo@wayboxai.app",
              image: null,
            }),
          }),
        ]
      : []),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      // Demo sessions never touch Google or the backend
      if (account?.provider === "demo") return { ...token, demo: true };
      if (token.demo) return token;
      // First sign-in: persist Google's tokens
      if (account) {
        return {
          ...token,
          // Auth.js gives every sign-in a fresh random user id (there is no database to
          // remember one), so on its own it can't say "the same person as last time" -- and
          // everything filed per account (read dots, resolved flags, notifications) would start
          // over at each sign-in. Google's own id for the account stays the same.
          sub: account.providerAccountId,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      // Still valid (with a 60s buffer)
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 60) {
        return token;
      }
      if (!token.refreshToken) return { ...token, error: "RefreshTokenError" };
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.demo = token.demo;
      return session;
    },
  },
});
