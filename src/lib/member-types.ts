export const memberRoles = ["user", "moderator", "admin"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const nmsPlatforms = ["PC", "SteamOS", "PlayStation", "Xbox", "Nintendo Switch", "Mac"] as const;
export type NmsPlatform = (typeof nmsPlatforms)[number];
export const memberSpecialties = ["builder", "ranger", "explorer"] as const;
export type MemberSpecialty = (typeof memberSpecialties)[number];
export const membershipStatuses = ["pending", "approved", "blocked"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export function normalizeNmsFriendCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function formatNmsFriendCode(value: string) {
  const code = normalizeNmsFriendCode(value).slice(0, 13);
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8)].filter(Boolean).join("-");
}

export function isValidNmsFriendCode(value: string) {
  return /^[A-Z0-9]{13}$/.test(normalizeNmsFriendCode(value));
}

export function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type AllianceMember = {
  publicId: string;
  email: string;
  name: string;
  image: string;
  nmsName: string;
  nmsCode: string;
  telegramName?: string;
  discordName?: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty | "";
  role: MemberRole;
  displayRole?: MemberRole;
  membershipStatus: MembershipStatus;
  approvedBy: string;
  approvedAt: string;
  lastLogin: string;
  offline?: boolean;
  simpleView?: boolean;
};

export type AllianceSettings = {
  name: string;
  logoUrl: string;
  bannerUrl: string;
  discordUrl: string;
  telegramUrl: string;
  heroGradientMode: "none" | "left" | "full";
  defaultTableView: "list" | "cards";
};