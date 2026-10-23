import { rmSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAccessData } from "@/lib/members/access-store";
import { adminEmail } from "@/lib/auth/local-auth";

type Provider = Record<string, unknown> & {
  id: string;
  profile?: (profile: Record<string, unknown>) => unknown;
  authorize?: (credentials: Record<string, unknown> | undefined) => Promise<unknown>;
};
type SignInCallback = (params: { account?: { provider: string } | null; profile?: Record<string, unknown> }) => boolean;
type AuthConfig = Record<string, unknown> & { providers: Provider[]; callbacks: { signIn: SignInCallback } };

const nextAuth = vi.hoisted(() => ({
  handlers: { GET: () => "get", POST: () => "post" },
  configs: [] as unknown[],
}));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    nextAuth.configs.push(config);
    return { handlers: nextAuth.handlers, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: Record<string, unknown>) => ({ type: "credentials", ...options }),
}));

// Importa src/auth.ts da capo con le variabili d'ambiente correnti e restituisce la configurazione passata a NextAuth.
async function loadAuth() {
  vi.resetModules();
  nextAuth.configs.length = 0;
  const auth = await import("@/auth");
  return { auth, config: nextAuth.configs.at(-1) as AuthConfig };
}

const provider = (config: AuthConfig, id: string) => config.providers.find((item) => item.id === id);

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
});

describe("Google login", () => {
  it("configures only Google, without a local secret", async () => {
    const { auth, config } = await loadAuth();
    expect(auth.handlers).toBe(nextAuth.handlers);
    expect(config).not.toHaveProperty("secret");
    expect(config).not.toHaveProperty("trustHost");
    expect(config.providers.map((item) => item.id)).toEqual(["google"]);
    expect(provider(config, "google")).toMatchObject({
      type: "oauth",
      issuer: "https://accounts.google.com",
      checks: ["pkce", "state"],
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
    });
  });

  it("maps the Google profile to the session user", async () => {
    const { config } = await loadAuth();
    expect(
      provider(config, "google")!.profile!({
        sub: "google-1",
        name: "Ada",
        email: "ada@example.com",
        picture: "https://example.com/ada.png",
        locale: "it",
      }),
    ).toEqual({ id: "google-1", name: "Ada", email: "ada@example.com", image: "https://example.com/ada.png" });
  });

  it("accepts only Google profiles with a verified email", async () => {
    const { config } = await loadAuth();
    const { signIn } = config.callbacks;
    const account = { provider: "google" };
    expect(signIn({ account, profile: { email: "ada@example.com", email_verified: true } })).toBe(true);
    expect(signIn({ account, profile: { email: "ada@example.com", email_verified: false } })).toBe(false);
    expect(signIn({ account, profile: { email: "ada@example.com", email_verified: "true" } })).toBe(false);
    expect(signIn({ account, profile: { email: "", email_verified: true } })).toBe(false);
    expect(signIn({ account: null })).toBe(false);
  });

  it("refuses local sign-ins when local login is off", async () => {
    const { config } = await loadAuth();
    expect(config.callbacks.signIn({ account: { provider: "local" }, profile: { email: "a@b.c" } })).toBe(false);
  });

  it("exposes the handlers as the Auth.js route", async () => {
    await loadAuth();
    const route = await import("@/app/api/auth/[...nextauth]/route");
    expect(route.GET).toBe(nextAuth.handlers.GET);
    expect(route.POST).toBe(nextAuth.handlers.POST);
  });
});

describe("local login", () => {
  beforeEach(() => {
    vi.stubEnv("LOCAL_AUTH", "true");
  });

  it("adds the local provider with a development secret and trusted host", async () => {
    const { config } = await loadAuth();
    expect(config).toMatchObject({ secret: "local-auth-development-secret", trustHost: true });
    expect(config.providers.map((item) => item.id)).toEqual(["google", "local"]);
    expect(provider(config, "local")).toMatchObject({ type: "credentials", name: "Local", credentials: { email: {} } });
  });

  it("prefers the configured AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "configured-secret");
    const { config } = await loadAuth();
    expect(config.secret).toBe("configured-secret");
  });

  it("signs in a development account and registers it as approved", async () => {
    const { config } = await loadAuth();
    const user = await provider(config, "local")!.authorize!({ email: ` ${adminEmail.toUpperCase()} ` });
    expect(user).toEqual({ id: adminEmail, name: "Local Admin", email: adminEmail, image: "" });
    const member = (await readAccessData()).members.find((item) => item.email === adminEmail);
    expect(member).toMatchObject({ role: "admin", membershipStatus: "approved", nmsName: "LocalAdmin" });
  });

  it("rejects unknown accounts and missing credentials without registering anyone", async () => {
    const { config } = await loadAuth();
    const authorize = provider(config, "local")!.authorize!;
    expect(await authorize({ email: "stranger@example.com" })).toBeNull();
    expect(await authorize(undefined)).toBeNull();
    expect((await readAccessData()).members).toEqual([]);
  });

  it("rejects local credentials once local login is switched off at runtime", async () => {
    const { config } = await loadAuth();
    vi.stubEnv("VERCEL", "1");
    expect(await provider(config, "local")!.authorize!({ email: adminEmail })).toBeNull();
    expect(config.callbacks.signIn({ account: { provider: "local" } })).toBe(false);
  });

  it("accepts local sign-ins while local login is on", async () => {
    const { config } = await loadAuth();
    expect(config.callbacks.signIn({ account: { provider: "local" } })).toBe(true);
  });
});
