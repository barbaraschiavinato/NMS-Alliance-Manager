export const memberRoles = ["user", "moderator", "admin"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const nmsPlatforms = ["PC", "PlayStation", "Xbox", "Nintendo Switch", "Mac"] as const;
export type NmsPlatform = (typeof nmsPlatforms)[number];
export const memberSpecialties = ["builder", "ranger", "explorer"] as const;
export type MemberSpecialty = (typeof memberSpecialties)[number];
export const membershipStatuses = ["pending", "approved", "blocked"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export type AllianceMember = {
  email: string;
  name: string;
  image: string;
  nmsName: string;
  nmsCode: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty | "";
  role: MemberRole;
  membershipStatus: MembershipStatus;
  approvedBy: string;
  approvedAt: string;
  lastLogin: string;
};

export type AllianceSettings = {
  name: string;
  logoUrl: string;
  bannerUrl: string;
};