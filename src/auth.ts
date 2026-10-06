import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [{
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
  }],
  callbacks: {
    signIn({ profile }) {
      return Boolean(profile?.email && profile.email_verified === true);
    },
  },
});