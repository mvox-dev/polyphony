// Member-Organization junction table operations
// Part of Schema V2 multi-organization support

import type {
  MemberOrganization,
  AddMemberToOrgInput,
  OrgSummary,
} from "$lib/types";

/**
 * Add a member to an organization
 */
export async function addMemberToOrganization(
  db: D1Database,
  input: AddMemberToOrgInput,
): Promise<MemberOrganization> {
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO member_organizations (member_id, org_id, nickname, invited_by, joined_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      input.memberId,
      input.orgId,
      input.nickname ?? null,
      input.invitedBy ?? null,
      now,
    )
    .run();

  return {
    memberId: input.memberId,
    orgId: input.orgId,
    nickname: input.nickname ?? null,
    invitedBy: input.invitedBy ?? null,
    joinedAt: now,
  };
}

/**
 * Get all organizations a member belongs to
 */
export async function getMemberOrganizations(
  db: D1Database,
  memberId: string,
): Promise<MemberOrganization[]> {
  const { results } = await db
    .prepare(
      "SELECT member_id, org_id, nickname, invited_by, joined_at FROM member_organizations WHERE member_id = ?",
    )
    .bind(memberId)
    .all<MemberOrganizationRow>();

  return results.map(mapRowToMemberOrganization);
}

/**
 * Get all members in an organization
 */
export async function getMembersByOrganization(
  db: D1Database,
  orgId: string,
): Promise<MemberOrganization[]> {
  const { results } = await db
    .prepare(
      "SELECT member_id, org_id, nickname, invited_by, joined_at FROM member_organizations WHERE org_id = ?",
    )
    .bind(orgId)
    .all<MemberOrganizationRow>();

  return results.map(mapRowToMemberOrganization);
}

/**
 * Get a specific member-organization relationship
 */
export async function getMemberOrganization(
  db: D1Database,
  memberId: string,
  orgId: string,
): Promise<MemberOrganization | null> {
  const row = await db
    .prepare(
      "SELECT member_id, org_id, nickname, invited_by, joined_at FROM member_organizations WHERE member_id = ? AND org_id = ?",
    )
    .bind(memberId, orgId)
    .first<MemberOrganizationRow>();

  if (!row) {
    return null;
  }

  return mapRowToMemberOrganization(row);
}

/**
 * Remove a member from an organization
 */
export async function removeMemberFromOrganization(
  db: D1Database,
  memberId: string,
  orgId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      "DELETE FROM member_organizations WHERE member_id = ? AND org_id = ?",
    )
    .bind(memberId, orgId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Update a member's nickname in an organization
 */
export async function updateMemberOrgNickname(
  db: D1Database,
  memberId: string,
  orgId: string,
  nickname: string | null,
): Promise<MemberOrganization | null> {
  const result = await db
    .prepare(
      "UPDATE member_organizations SET nickname = ? WHERE member_id = ? AND org_id = ?",
    )
    .bind(nickname, memberId, orgId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  return getMemberOrganization(db, memberId, orgId);
}

/**
 * Get lightweight org summaries (name + subdomain) for a member.
 * Used by the org switcher in the nav — JOINs to organizations table.
 */
export async function getMemberOrgSummaries(
  db: D1Database,
  memberId: string,
): Promise<OrgSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.name, o.subdomain
			 FROM member_organizations mo
			 JOIN organizations o ON o.id = mo.org_id
			 WHERE mo.member_id = ?
			 ORDER BY o.name`,
    )
    .bind(memberId)
    .all<{ id: string; name: string; subdomain: string }>();

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    subdomain: row.subdomain,
  }));
}

// =============================================================================
// Internal types and helpers
// =============================================================================

interface MemberOrganizationRow {
  member_id: string;
  org_id: string;
  nickname: string | null;
  invited_by: string | null;
  joined_at: string;
}

function mapRowToMemberOrganization(
  row: MemberOrganizationRow,
): MemberOrganization {
  return {
    memberId: row.member_id,
    orgId: row.org_id,
    nickname: row.nickname,
    invitedBy: row.invited_by,
    joinedAt: row.joined_at,
  };
}
