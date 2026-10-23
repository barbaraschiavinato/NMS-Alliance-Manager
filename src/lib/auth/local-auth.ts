import type { MemberRole, MemberSpecialty, NmsPlatform } from "@/lib/members/member-types";

export type LocalAccount = Readonly<{
  email: string;
  name: string;
  nmsName: string;
  nmsCode: string;
  platforms: NmsPlatform[];
  specialty: MemberSpecialty;
  role: MemberRole;
}>;

export type LocalAccountOption = Readonly<{
  email: string;
  label: string;
  role: MemberRole;
  specialty: MemberSpecialty;
}>;

export const adminEmail = process.env.ADMIN_EMAIL || "admin@local";

// Development set (npm run dev:local): one account per role. Profiles are editable from the panel and persist across
// logins, so the specialty can be changed there and no account per specialty is needed.
export const devLocalAccounts: readonly LocalAccount[] = [
  {
    email: adminEmail,
    name: "Local Admin",
    nmsName: "LocalAdmin",
    nmsCode: "LOCALADMIN001",
    platforms: ["PC"],
    specialty: "explorer",
    role: "admin",
  },
  {
    email: "moderator@local",
    name: "Local Moderator",
    nmsName: "LocalModerator",
    nmsCode: "LOCALMODER001",
    platforms: ["PC"],
    specialty: "builder",
    role: "moderator",
  },
  {
    email: "user@local",
    name: "Local User",
    nmsName: "LocalUser",
    nmsCode: "LOCALUSER0001",
    platforms: ["PC"],
    specialty: "ranger",
    role: "user",
  },
];

const testRoles = [
  { role: "admin", title: "Admin", code: "ADM" },
  { role: "moderator", title: "Moderator", code: "MOD" },
  { role: "user", title: "User", code: "USR" },
] as const;

const testSpecialties = [
  { specialty: "ranger", title: "Ranger", code: "RNG" },
  { specialty: "explorer", title: "Explorer", code: "EXP" },
  { specialty: "builder", title: "Builder", code: "BLD" },
] as const;

// Test set (npm run dev:test): every role and specialty combination, 9 fixed accounts. Their profile is reset to
// these values on every login and cannot be edited from the panel.
export const testLocalAccounts: readonly LocalAccount[] = testRoles.flatMap((role) =>
  testSpecialties.map((specialty): LocalAccount => ({
    email: `test-${role.role}-${specialty.specialty}@local`,
    name: `Test ${role.title} ${specialty.title}`,
    nmsName: `Test${role.title}${specialty.title}`,
    nmsCode: `TEST${role.code}${specialty.code}001`,
    platforms: ["PC"],
    specialty: specialty.specialty,
    role: role.role,
  })),
);

// Mai attivo in produzione o su Vercel, anche se LOCAL_AUTH è impostato per errore.
export function isLocalAuthEnabled() {
  return process.env.LOCAL_AUTH === "true" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

function isTestSet() {
  return process.env.LOCAL_AUTH_SET === "test";
}

export function getLocalAccounts(): readonly LocalAccount[] {
  return isTestSet() ? testLocalAccounts : devLocalAccounts;
}

export function findLocalAccount(email: unknown) {
  if (typeof email !== "string") return undefined;
  const normalizedEmail = email.trim().toLowerCase();
  return getLocalAccounts().find((account) => account.email.toLowerCase() === normalizedEmail);
}

// In the test set every local account is fixed: its profile cannot be edited. Google users are unaffected.
export function isFixedLocalAccount(email: string) {
  return isLocalAuthEnabled() && isTestSet() && Boolean(findLocalAccount(email));
}

export function getLocalAccountOptions(): LocalAccountOption[] | undefined {
  if (!isLocalAuthEnabled()) return undefined;
  return getLocalAccounts().map(({ email, name, role, specialty }) => ({
    email,
    label: name,
    role,
    specialty,
  }));
}

export function getMissingAuthConfiguration() {
  if (isLocalAuthEnabled()) return [];
  return ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLIANCE_ADMIN_EMAIL"].filter(
    (key) => !process.env[key],
  );
}
