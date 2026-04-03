// Auth middleware for route protection
import type { OrgId } from "@polyphony/shared";
import { getMemberById, type Member } from "$lib/server/db/members";
import { requireRole, type Role } from "./permissions";

export interface AuthMiddlewareResult {
  authorized: boolean;
  member?: Member;
  status?: number;
  error?: string;
}

export interface AuthMiddlewareParams {
  db: D1Database;
  memberId: string | null | undefined;
  orgId: OrgId;
}

/**
 * Get member from cookie/session
 */
export async function getMemberFromCookie(
  db: D1Database,
  memberId: string | null | undefined,
  orgId: OrgId,
): Promise<Member | null> {
  if (!memberId) {
    return null;
  }
  return await getMemberById(db, memberId, orgId);
}

/**
 * Create auth middleware for a minimum role requirement
 */
export function createAuthMiddleware(minRole: Role) {
  return async (
    params: AuthMiddlewareParams,
  ): Promise<AuthMiddlewareResult> => {
    const { db, memberId, orgId } = params;

    const member = await getMemberFromCookie(db, memberId, orgId);

    if (!member) {
      return {
        authorized: false,
        status: 401,
        error: "Authentication required",
      };
    }

    const roleCheck = requireRole(member, minRole);

    if (!roleCheck.success) {
      return {
        authorized: false,
        status: 403,
        error: roleCheck.error ?? "Insufficient permissions",
      };
    }

    return {
      authorized: true,
      member,
    };
  };
}

/**
 * Pre-built middleware for common role requirements
 */
export const requireLibrarian = createAuthMiddleware("librarian");
export const requireAdmin = createAuthMiddleware("admin");
export const requireOwner = createAuthMiddleware("owner");

// ============================================
// Direct assertion helpers (throw on failure)
// ============================================

import { error } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";

/**
 * Get authenticated member or throw 401
 * Use in routes: const member = await getAuthenticatedMember(db, cookies, orgId);
 */
export async function getAuthenticatedMember(
  db: D1Database,
  cookies: Cookies,
  orgId: OrgId,
): Promise<Member> {
  const memberId = cookies.get("member_id");
  if (!memberId) {
    throw error(401, "Authentication required");
  }

  const member = await getMemberById(db, memberId, orgId);
  if (!member) {
    throw error(401, "Invalid session");
  }

  // Only REGISTERED members can be authenticated
  // (roster-only members should never have a session cookie)
  if (!member.email_id) {
    throw error(401, "Authentication required - roster-only member");
  }

  return member;
}

/**
 * Assert member has librarian, admin, or owner role, throw 403 if not
 */
export function assertLibrarian(member: Member): void {
  const isLibrarian = member.roles.some((r) =>
    ["librarian", "admin", "owner"].includes(r),
  );
  if (!isLibrarian) {
    throw error(403, "Librarian, admin, or owner role required");
  }
}

/**
 * Assert member has admin or owner role, throw 403 if not
 */
export function assertAdmin(member: Member): void {
  const isAdmin = member.roles.some((r) => ["admin", "owner"].includes(r));
  if (!isAdmin) {
    throw error(403, "Admin or owner role required");
  }
}

/**
 * Assert member has owner role, throw 403 if not
 */
export function assertOwner(member: Member): void {
  if (!member.roles.includes("owner")) {
    throw error(403, "Owner role required");
  }
}

/**
 * Check if member has owner role (no throw)
 */
export function isOwner(member: Member): boolean {
  return member.roles.includes("owner");
}
