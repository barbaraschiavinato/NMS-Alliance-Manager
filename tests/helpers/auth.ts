import { vi } from "vitest";
import type { AllianceMember } from "@/lib/members/member-types";

// Da usare con: vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);
export const authMock = {
  auth: vi.fn(async () => null as unknown),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
};

// Configura le variabili richieste da getMissingAuthConfiguration e simula la sessione Google del membro.
export function signInAs(member: Pick<AllianceMember, "email" | "name" | "image"> | null) {
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("AUTH_GOOGLE_ID", "test-google-id");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "test-google-secret");
  vi.stubEnv("ALLIANCE_ADMIN_EMAIL", "root-admin@example.com");
  authMock.auth.mockResolvedValue(
    member ? { user: { email: member.email, name: member.name, image: member.image } } : null,
  );
}
