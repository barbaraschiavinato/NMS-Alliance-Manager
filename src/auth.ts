import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { ensureLocalMember } from "@/lib/members/access-store";
import { findLocalAccount, isLocalAuthEnabled } from "@/lib/auth/local-auth";

const localAuth = isLocalAuthEnabled();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(localAuth ? { secret: process.env.AUTH_SECRET || "local-auth-development-secret", trustHost: true } : {}),
  providers: [
    {
      id: "google",
      name: "Google",
      type: "oauth",
      issuer: "https://accounts.google.com",
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: { scope: "openid email profile", prompt: "select_account" },
      },
      token: "https://oauth2.googleapis.com/token",
      userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    },
    ...(localAuth
      ? [
          Credentials({
            id: "local",
            name: "Local",
            credentials: { email: {} },
            async authorize(credentials) {
              const account = isLocalAuthEnabled() ? findLocalAccount(credentials?.email) : undefined;
              if (!account) return null;
              await ensureLocalMember(account);
              return { id: account.email, name: account.name, email: account.email, image: "" };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "local") return isLocalAuthEnabled();
      return Boolean(profile?.email && profile.email_verified === true);
    },
  },
});
