import { get, put } from "@vercel/blob";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getBlobAuthOptions } from "@/lib/blob-config";
import { isValidNmsFriendCode, memberRoles, memberSpecialties, membershipStatuses, normalizeNmsFriendCode, nmsPlatforms } from "@/lib/member-types";
import type { AllianceMember, AllianceSettings, MemberRole, MemberSpecialty, MembershipStatus, NmsPlatform } from "@/lib/member-types";

export { memberRoles, memberSpecialties, membershipStatuses, nmsPlatforms } from "@/lib/member-types";
export type { AllianceMember, AllianceSettings, MemberRole, MemberSpecialty, MembershipStatus, NmsPlatform } from "@/lib/member-types";

export type AccessData = {
  members: AllianceMember[];
  alliance: AllianceSettings;
};

const blobPath = "alliance-manager/access.json";
const localPath = path.join(process.cwd(), "data", "access.json");
const publicIdPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const defaultData: AccessData = {
  members: [],
  alliance: { name: "", logoUrl: "", bannerUrl: "", discordUrl: "", telegramUrl: "", heroGradientMode: "full", defaultTableView: "list" },
};

function normalizeAccessData(value: unknown): AccessData {
  if (!value || typeof value !== "object") return defaultData;
  const data = value as Partial<AccessData>;
  const storedAlliance = data.alliance as (Partial<AllianceSettings> & { heroGradientEnabled?: unknown }) | undefined;
  const storedAllianceName = typeof storedAlliance?.name === "string" ? storedAlliance.name : "";
  return {
    members: Array.isArray(data.members)
      ? data.members.map((member) => normalizeMember(member)).filter((member) => member !== null)
      : [],
    alliance: {
      name: storedAllianceName.trim().toLowerCase() === "nomad syndicate" ? "" : storedAllianceName,
      logoUrl: typeof storedAlliance?.logoUrl === "string" ? storedAlliance.logoUrl : "",
      bannerUrl: typeof storedAlliance?.bannerUrl === "string" ? storedAlliance.bannerUrl : "",
      discordUrl: typeof storedAlliance?.discordUrl === "string" ? storedAlliance.discordUrl : "",
      telegramUrl: typeof storedAlliance?.telegramUrl === "string" ? storedAlliance.telegramUrl : "",
      heroGradientMode: storedAlliance?.heroGradientMode === "none" || storedAlliance?.heroGradientMode === "left" || storedAlliance?.heroGradientMode === "full"
        ? storedAlliance.heroGradientMode
        : storedAlliance?.heroGradientEnabled === false ? "none" : "full",
      defaultTableView: storedAlliance?.defaultTableView === "cards" ? "cards" : "list",
    },
  };
}

function normalizeMember(value: unknown): AllianceMember | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Partial<AllianceMember>;
  if (typeof member.email !== "string" || typeof member.name !== "string" || typeof member.image !== "string") return null;
  const platforms = Array.isArray(member.platforms)
    ? member.platforms.filter((platform): platform is NmsPlatform => nmsPlatforms.includes(platform as NmsPlatform))
    : [];
  const role = memberRoles.includes(member.role as MemberRole) ? member.role as MemberRole : "user";
  return {
    publicId: typeof member.publicId === "string" && publicIdPattern.test(member.publicId) ? member.publicId : randomUUID(),
    email: member.email,
    name: member.name,
    image: member.image,
    nmsName: typeof member.nmsName === "string" ? member.nmsName : "",
    nmsCode: typeof member.nmsCode === "string" ? member.nmsCode : "",
    platforms,
    specialty: memberSpecialties.includes(member.specialty as MemberSpecialty) ? member.specialty as MemberSpecialty : "",
    role,
    membershipStatus: membershipStatuses.includes(member.membershipStatus as MembershipStatus)
      ? member.membershipStatus as MembershipStatus
      : "pending",
    approvedBy: typeof member.approvedBy === "string" ? member.approvedBy : "",
    approvedAt: typeof member.approvedAt === "string" ? member.approvedAt : "",
    lastLogin: typeof member.lastLogin === "string" ? member.lastLogin : "",
    ...(member.offline === true ? { offline: true } : {}),
    simpleView: typeof member.simpleView === "boolean" ? member.simpleView : role === "user",
  };
}

function needsPublicIdMigration(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("members" in value) || !Array.isArray(value.members)) return false;
  return value.members.some((member) =>
    !member || typeof member !== "object" || !("publicId" in member) ||
    typeof member.publicId !== "string" || !publicIdPattern.test(member.publicId),
  );
}

export async function readAccessData(): Promise<AccessData> {
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    const blob = await get(blobPath, { access: "private", useCache: false, ...blobAuthOptions });
    if (!blob || blob.statusCode === 304) return defaultData;
    const raw = JSON.parse(await new Response(blob.stream).text());
    const data = normalizeAccessData(raw);
    if (needsPublicIdMigration(raw)) await writeAccessData(data);
    return data;
  }

  try {
    const raw = JSON.parse(await readFile(localPath, "utf8"));
    const data = normalizeAccessData(raw);
    if (needsPublicIdMigration(raw)) await writeAccessData(data);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultData;
    throw error;
  }
}

export async function writeAccessData(data: AccessData): Promise<void> {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const blobAuthOptions = getBlobAuthOptions();
  if (blobAuthOptions) {
    await put(blobPath, json, {
      access: "private",
      ...blobAuthOptions,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  await mkdir(path.dirname(localPath), { recursive: true });
  const temporaryPath = `${localPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, json, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, localPath);
}

export async function registerMember(identity: Pick<AllianceMember, "email" | "name" | "image">) {
  const email = identity.email.trim().toLowerCase();
  const data = await readAccessData();
  const index = data.members.findIndex((member) => member.email === email);
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  const role: MemberRole = email === adminEmail ? "admin" : data.members[index]?.role ?? "user";
  const existingMember = data.members[index];
  const membershipStatus = email === adminEmail ? "approved" : existingMember?.membershipStatus ?? "pending";
  const approvedBy = email === adminEmail ? email : existingMember?.approvedBy ?? "";
  const approvedAt = membershipStatus === "approved" ? existingMember?.approvedAt || new Date().toISOString() : "";
  const recentlySeen = existingMember && Date.now() - Date.parse(existingMember.lastLogin) < 15 * 60 * 1000;
  if (recentlySeen && existingMember.name === (identity.name || email) && existingMember.image === identity.image && existingMember.role === role && existingMember.membershipStatus === membershipStatus) {
    return { member: existingMember, alliance: data.alliance };
  }
  const member: AllianceMember = {
    publicId: existingMember?.publicId ?? randomUUID(),
    email,
    name: identity.name || email,
    image: identity.image,
    nmsName: existingMember?.nmsName ?? "",
    nmsCode: existingMember?.nmsCode ?? "",
    platforms: existingMember?.platforms ?? [],
    specialty: existingMember?.specialty ?? "",
    role,
    membershipStatus,
    simpleView: existingMember?.simpleView ?? role === "user",
    approvedBy,
    approvedAt,
    lastLogin: new Date().toISOString(),
  };
  if (index === -1) data.members.push(member);
  else data.members[index] = member;
  await writeAccessData(data);
  return { member, alliance: data.alliance };
}

export type ProfileConflict = "name" | "code";

function findProfileConflict(members: AllianceMember[], profile: MemberProfileInput, excludeEmail = ""): ProfileConflict | null {
  const name = profile.nmsName.trim().toLowerCase();
  const code = normalizeNmsFriendCode(profile.nmsCode);
  const others = members.filter((member) => member.email !== excludeEmail);
  if (others.some((member) => member.nmsName.trim().toLowerCase() === name)) return "name";
  if (code && others.some((member) => normalizeNmsFriendCode(member.nmsCode) === code)) return "code";
  return null;
}

export async function createOfflineMember(profile: MemberProfileInput, createdBy: string): Promise<AllianceMember | ProfileConflict> {
  const data = await readAccessData();
  const conflict = findProfileConflict(data.members, profile);
  if (conflict) return conflict;
  const publicId = randomUUID();
  const member: AllianceMember = {
    publicId,
    email: `offline-${publicId}@offline.invalid`,
    name: profile.nmsName.trim(),
    image: "",
    nmsName: profile.nmsName.trim(),
    nmsCode: normalizeNmsFriendCode(profile.nmsCode),
    platforms: [...new Set(profile.platforms)],
    specialty: profile.specialty,
    role: "user",
    membershipStatus: "approved",
    approvedBy: createdBy.trim().toLowerCase(),
    approvedAt: new Date().toISOString(),
    lastLogin: "",
    offline: true,
  };
  data.members.push(member);
  await writeAccessData(data);
  return member;
}

export async function updateOfflineMember(publicId: string, profile: MemberProfileInput): Promise<AllianceMember | ProfileConflict | null> {
  const data = await readAccessData();
  const member = data.members.find((item) => item.publicId === publicId && item.offline);
  if (!member) return null;
  const conflict = findProfileConflict(data.members, profile, member.email);
  if (conflict) return conflict;
  member.name = profile.nmsName.trim();
  member.nmsName = profile.nmsName.trim();
  member.nmsCode = normalizeNmsFriendCode(profile.nmsCode);
  member.platforms = [...new Set(profile.platforms)];
  member.specialty = profile.specialty;
  await writeAccessData(data);
  return member;
}

export async function updateMemberApproval(email: string, approvedBy: string, membershipStatus: MembershipStatus, actorRole: MemberRole) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!normalizedEmail || !membershipStatuses.includes(membershipStatus) || normalizedEmail === adminEmail) return null;
  const data = await readAccessData();
  const member = data.members.find((item) => item.email === normalizedEmail);
  if (!member || member.role === "admin") return null;
  if (actorRole === "moderator" && member.role !== "user") return null;
  member.membershipStatus = membershipStatus;
  member.approvedBy = membershipStatus === "approved" ? approvedBy.trim().toLowerCase() : "";
  member.approvedAt = membershipStatus === "approved" ? new Date().toISOString() : "";
  await writeAccessData(data);
  return member;
}

export async function deleteMember(email: string, actorRole: MemberRole, actorEmail: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  const normalizedActorEmail = actorEmail.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail === adminEmail || normalizedEmail === normalizedActorEmail) return false;
  const data = await readAccessData();
  const index = data.members.findIndex((member) => member.email === normalizedEmail);
  if (index === -1) return false;
  if (actorRole === "moderator" && data.members[index].role !== "user") return false;
  if (data.members[index].role === "admin" && actorRole !== "admin") return false;
  data.members.splice(index, 1);
  await writeAccessData(data);
  return true;
}

export type MemberProfileInput = {
  nmsName: string;
  nmsCode: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty;
  simpleView?: boolean;
};

export function isMemberProfileInput(value: unknown, allowEmptyCode = false): value is MemberProfileInput {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.nmsName === "string" &&
    profile.nmsName.trim().length > 0 && profile.nmsName.trim().length <= 40 &&
    typeof profile.nmsCode === "string" && (isValidNmsFriendCode(profile.nmsCode) || (allowEmptyCode && !profile.nmsCode.trim())) &&
    Array.isArray(profile.platforms) &&
    profile.platforms.every((platform) => nmsPlatforms.includes(platform as NmsPlatform)) &&
    memberSpecialties.includes(profile.specialty as MemberSpecialty) &&
    (profile.simpleView === undefined || typeof profile.simpleView === "boolean");
}

export async function updateMemberProfile(email: string, profile: MemberProfileInput) {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await readAccessData();
  const member = data.members.find((item) => item.email === normalizedEmail);
  if (!member) return null;
  const conflict = findProfileConflict(data.members, profile, normalizedEmail);
  if (conflict) return conflict;
  member.nmsName = profile.nmsName.trim();
  member.nmsCode = normalizeNmsFriendCode(profile.nmsCode);
  member.platforms = [...new Set(profile.platforms)];
  member.specialty = profile.specialty;
  if (profile.simpleView !== undefined) member.simpleView = profile.simpleView;
  await writeAccessData(data);
  return member;
}

export async function updateMemberRole(email: string, role: MemberRole) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmail = process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!normalizedEmail || !memberRoles.includes(role) || normalizedEmail === adminEmail) return false;
  const data = await readAccessData();
  const member = data.members.find((item) => item.email === normalizedEmail);
  if (!member) return false;
  member.role = role;
  await writeAccessData(data);
  return true;
}

export async function updateAllianceSettings(settings: AllianceSettings) {
  const data = await readAccessData();
  data.alliance = settings;
  await writeAccessData(data);
  return data.alliance;
}