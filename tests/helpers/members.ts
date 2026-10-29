import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AllianceMember, AllianceSettings } from "@/lib/members/member-types";

const friendCodes = new Set<string>();

function uniqueFriendCode() {
  let code: string;
  do code = randomUUID().replace(/-/g, "").toUpperCase().slice(0, 13);
  while (friendCodes.has(code));
  friendCodes.add(code);
  return code;
}

// Membro approvato con profilo completo; i campi passati sovrascrivono i default.
export function makeMember(overrides: Partial<AllianceMember> = {}): AllianceMember {
  const publicId = overrides.publicId ?? randomUUID();
  const short = publicId.slice(0, 8);
  const role = overrides.role ?? "user";
  return {
    publicId,
    email: `member-${short}@example.com`,
    name: `Member ${short}`,
    image: "",
    nmsName: `Traveller${short}`,
    nmsCode: uniqueFriendCode(),
    platforms: ["PC"],
    specialty: "explorer",
    role,
    membershipStatus: "approved",
    approvedBy: "admin@example.com",
    approvedAt: "2026-01-01T00:00:00.000Z",
    // Recente, così registerMember non riscrive il membro a ogni richiesta.
    lastLogin: new Date().toISOString(),
    simpleView: role === "user",
    ...overrides,
  };
}

export const defaultAlliance: AllianceSettings = {
  name: "Test Alliance",
  logoUrl: "",
  bannerUrl: "",
  discordUrl: "",
  telegramUrl: "",
  heroGradientMode: "full",
  faviconUrl: "",
  appleIconUrl: "",
  appIcon192Url: "",
  appIcon512Url: "",
  portalCode: "",
  galaxy: 0,
};

// Scrive un documento JSON in data/ della directory di lavoro del test.
export function writeDataFile(name: string, value: unknown) {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

export function seedMembers(members: AllianceMember[], alliance: AllianceSettings = defaultAlliance) {
  writeDataFile("access.json", { members, alliance });
}
