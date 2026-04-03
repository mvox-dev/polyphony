// Permission system for role-based access control

import type { Role, MemberAuthContext } from "$lib/types";

// Re-export for consumers that import from here
export type { Role, MemberAuthContext };

// Deprecated: Use MemberAuthContext from types.ts
// Keeping alias for backward compatibility
export type Member = MemberAuthContext;

export type Permission =
  | "scores:view"
  | "scores:download"
  | "scores:upload"
  | "scores:delete"
  | "members:invite"
  | "members:manage"
  | "vault:delete"
  | "federation:manage"
  | "events:create"
  | "events:manage"
  | "events:delete"
  | "attendance:record";

export interface RequireRoleResult {
  success: boolean;
  error?: string;
}

/**
 * Permission matrix - which roles have which permissions
 * Note: All authenticated members have implicit 'scores:view' and 'scores:download' permissions
 */
const PERMISSIONS: Record<Role, Permission[]> = {
  librarian: ["scores:upload", "scores:delete"],
  admin: ["members:invite", "members:manage"],
  conductor: [
    "events:create",
    "events:manage",
    "events:delete",
    "attendance:record",
  ],
  section_leader: ["attendance:record"],
  owner: [
    "members:invite",
    "members:manage",
    "vault:delete",
    "federation:manage",
  ],
};

/**
 * Get roles for a member, optionally scoped to an organization
 * @param member The member to check
 * @param orgId Optional org ID to get org-specific roles
 * @returns Array of roles (from orgRoles if orgId provided and available, else from roles)
 */
function getMemberRoles(member: MemberAuthContext, orgId?: string): Role[] {
  if (orgId && member.orgRoles) {
    return member.orgRoles[orgId] ?? [];
  }
  return member.roles;
}

/**
 * Check if a member has a specific permission
 * Permissions are union of all assigned roles
 * @param member The member to check
 * @param permission The permission to check for
 * @param orgId Optional org ID to check org-specific roles
 */
export function hasPermission(
  member: Member | null | undefined,
  permission: Permission,
  orgId?: string,
): boolean {
  // Must be registered to have ANY permissions
  if (!member || !member.email_id) {
    return false;
  }

  // All authenticated (registered) members can view and download scores
  if (permission === "scores:view" || permission === "scores:download") {
    return true;
  }

  const roles = getMemberRoles(member, orgId);

  // Check if any of member's roles grant the permission
  return roles.some((role) => PERMISSIONS[role]?.includes(permission) ?? false);
}

/**
 * Check if a member has a specific role
 * @param member The member to check
 * @param role The role to check for
 * @param orgId Optional org ID to check org-specific roles
 */
export function hasRole(
  member: Member | null | undefined,
  role: Role,
  orgId?: string,
): boolean {
  if (!member) return false;
  const roles = getMemberRoles(member, orgId);
  return roles.includes(role);
}

/**
 * Check if a member has at least one of the required roles
 * Owner role grants access to all role requirements
 * @param member The member to check
 * @param requiredRoles Single role or array of roles (any match = success)
 * @param orgId Optional org ID to check org-specific roles
 */
export function requireRole(
  member: Member | null | undefined,
  requiredRoles: Role | Role[],
  orgId?: string,
): RequireRoleResult {
  if (!member) {
    return { success: false, error: "Authentication required" };
  }

  const roles = getMemberRoles(member, orgId);

  const rolesArray = Array.isArray(requiredRoles)
    ? requiredRoles
    : [requiredRoles];
  const hasRequiredRole = rolesArray.some((role) => roles.includes(role));

  if (!hasRequiredRole) {
    return { success: false, error: "Insufficient permissions" };
  }

  return { success: true };
}

// Permission helper functions

export function canUploadScores(member: Member | null | undefined): boolean {
  return hasPermission(member, "scores:upload");
}

export function canDeleteScores(member: Member | null | undefined): boolean {
  return hasPermission(member, "scores:delete");
}

export function canInviteMembers(member: Member | null | undefined): boolean {
  return hasPermission(member, "members:invite");
}

export function canManageMembers(member: Member | null | undefined): boolean {
  return hasPermission(member, "members:manage");
}

// Deprecated: Use canManageMembers instead
export function canManageRoles(member: Member | null | undefined): boolean {
  return canManageMembers(member);
}

export function canDeleteVault(member: Member | null | undefined): boolean {
  return hasPermission(member, "vault:delete");
}

export function canCreateEvents(member: Member | null | undefined): boolean {
  return hasPermission(member, "events:create");
}

export function canManageEvents(member: Member | null | undefined): boolean {
  return hasPermission(member, "events:manage");
}

export function canDeleteEvents(member: Member | null | undefined): boolean {
  return hasPermission(member, "events:delete");
}

export function canRecordAttendance(
  member: Member | null | undefined,
): boolean {
  return hasPermission(member, "attendance:record");
}

/**
 * Check if a member can edit participation (RSVP/attendance) for a target member
 * Issue #240: Trust Individual Responsibility
 *
 * @param currentMember - The member making the edit
 * @param targetMemberId - The member whose record is being edited
 * @param trustIndividualResponsibility - Organization setting
 * @param isAdmin - Whether currentMember has admin/owner role
 * @returns true if the edit is allowed
 */
export function canEditParticipation(
  currentMember: Member | null | undefined,
  targetMemberId: string,
  trustIndividualResponsibility: boolean,
  isAdmin: boolean,
): boolean {
  if (!currentMember) return false;
  if (isAdmin) return true;
  if (canRecordAttendance(currentMember)) return true;
  if (trustIndividualResponsibility && currentMember.id === targetMemberId)
    return true;
  return false;
}
