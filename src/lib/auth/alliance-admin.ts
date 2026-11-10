/**
 * The configured alliance admin email (`ALLIANCE_ADMIN_EMAIL`), trimmed and lowercased, or `undefined` when it is
 * unset or blank. This account is auto-approved as admin and cannot be demoted, blocked or removed.
 */
export function allianceAdminEmail(): string | undefined {
  return process.env.ALLIANCE_ADMIN_EMAIL?.trim().toLowerCase() || undefined;
}
