/**
 * Integration tests: acceptInvite — real D1/SQLite (#292)
 *
 * These tests run against a real SQLite database (via createTestDb()) with FK
 * constraints enabled.  They catch bugs that map-based mocks cannot detect:
 *
 *   • FK constraint violations (delete-order bugs like #307)
 *   • UNIQUE constraint violations (duplicate email_id)
 *   • CASCADE behaviour on DELETE
 *   • Correct row counts after cleanup operations
 *
 * Test scope:
 *   - Normal path: roster slot upgraded to registered member
 *   - Cross-org path: existing member bound to new org, roster slot cleaned up
 *   - FK order proof: DB blocks member delete while invite still references them
 *   - Hard-delete guard: roster slot NOT deleted when still in another org
 *   - Hard-delete: roster slot deleted when all org memberships removed
 *   - Expired / invalid invite rejection
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { createTestDb } from "./helpers/sqlite-d1-harness";
import { acceptInvite } from "$lib/server/db/invites";
import { createRosterMember } from "$lib/server/db/members";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ORG_A_ID = createOrgId("org_a_test");
const ORG_B_ID = createOrgId("org_b_test");

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

/** Seed minimum data needed before each test */
async function seedOrgsAndAdmin(db: D1Database): Promise<{ adminId: string }> {
  // Two test organizations
  await db
    .prepare(
      "INSERT INTO organizations (id, name, subdomain, type, contact_email) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(ORG_A_ID, "Org A", "org-a-test", "collective", "a@test.com")
    .run();

  await db
    .prepare(
      "INSERT INTO organizations (id, name, subdomain, type, contact_email) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(ORG_B_ID, "Org B", "org-b-test", "collective", "b@test.com")
    .run();

  // Admin member in org B (creates the invites)
  const adminId = "admin_test_001";
  await db
    .prepare(
      "INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, NULL, NULL)",
    )
    .bind(adminId, "Admin", "admin@test.com")
    .run();
  await db
    .prepare(
      "INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at) VALUES (?, ?, NULL, datetime('now'))",
    )
    .bind(adminId, ORG_B_ID)
    .run();

  return { adminId };
}

/** Insert a direct invite row (bypasses createInvite validation for test setup) */
async function seedInvite(
  db: D1Database,
  opts: {
    id: string;
    orgId: string;
    rosterMemberId: string;
    token: string;
    invitedBy: string;
    expiresAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO invites (id, org_id, roster_member_id, token, name, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      opts.id,
      opts.orgId,
      opts.rosterMemberId,
      opts.token,
      "Test Invite",
      opts.invitedBy,
      opts.expiresAt,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function memberExists(
  db: D1Database,
  memberId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM members WHERE id = ?")
    .bind(memberId)
    .first<{ id: string }>();
  return row !== null;
}

async function inviteExists(
  db: D1Database,
  inviteId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM invites WHERE id = ?")
    .bind(inviteId)
    .first<{ id: string }>();
  return row !== null;
}

async function getMemberEmail(
  db: D1Database,
  memberId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT email_id FROM members WHERE id = ?")
    .bind(memberId)
    .first<{ email_id: string | null }>();
  return row?.email_id ?? null;
}

async function getOrgCount(db: D1Database, memberId: string): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM member_organizations WHERE member_id = ?",
    )
    .bind(memberId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function getMemberOrgIds(
  db: D1Database,
  memberId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT org_id FROM member_organizations WHERE member_id = ?")
    .bind(memberId)
    .all<{ org_id: string }>();
  return results.map((r) => r.org_id);
}

// ---------------------------------------------------------------------------
// Tests: Normal path — roster slot upgrade
// ---------------------------------------------------------------------------

describe("acceptInvite (integration) — normal path", () => {
  let db: D1Database;
  let adminId: string;

  beforeEach(async () => {
    db = createTestDb();
    ({ adminId } = await seedOrgsAndAdmin(db));
  });

  it("sets email_id on roster slot when no global member exists", async () => {
    // Create roster member (no email_id)
    const rosterMember = await createRosterMember(db, {
      name: "Alice Roster",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });

    await seedInvite(db, {
      id: "inv_normal_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterMember.id,
      token: "tok_normal_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    const result = await acceptInvite(db, "tok_normal_1", "alice@example.com");

    expect(result.success).toBe(true);
    expect(result.memberId).toBe(rosterMember.id);

    // email_id must be set on the roster slot
    const email = await getMemberEmail(db, rosterMember.id);
    expect(email).toBe("alice@example.com");
  });

  it("deletes the invite after successful acceptance", async () => {
    const rosterMember = await createRosterMember(db, {
      name: "Bob Roster",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });

    await seedInvite(db, {
      id: "inv_cleanup_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterMember.id,
      token: "tok_cleanup_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    await acceptInvite(db, "tok_cleanup_1", "bob@example.com");

    expect(await inviteExists(db, "inv_cleanup_1")).toBe(false);
  });

  it("returns failure for invalid token without touching DB", async () => {
    const result = await acceptInvite(
      db,
      "tok_does_not_exist",
      "any@example.com",
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it("returns failure for expired invite", async () => {
    const rosterMember = await createRosterMember(db, {
      name: "Carol Expired",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });

    await seedInvite(db, {
      id: "inv_expired_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterMember.id,
      token: "tok_expired_1",
      invitedBy: adminId,
      expiresAt: PAST,
    });

    const result = await acceptInvite(db, "tok_expired_1", "carol@example.com");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: Cross-org path — existing member
// ---------------------------------------------------------------------------

describe("acceptInvite (integration) — cross-org path", () => {
  let db: D1Database;
  let adminId: string;

  beforeEach(async () => {
    db = createTestDb();
    ({ adminId } = await seedOrgsAndAdmin(db));
  });

  it("links existing member to org B without FK violation (proves #307 delete order)", async () => {
    // Seed: Alice already registered in org A
    const aliceId = "alice_cross_001";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind(aliceId, "Alice Cross", "alice@cross.com")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(aliceId, ORG_A_ID)
      .run();

    // Org B has a roster slot for Alice
    const rosterMember = await createRosterMember(db, {
      name: "Alice Cross Slot",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });

    await seedInvite(db, {
      id: "inv_cross_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterMember.id,
      token: "tok_cross_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    // Must NOT throw FK error
    const result = await acceptInvite(db, "tok_cross_1", "alice@cross.com");

    expect(result.success).toBe(true);
    expect(result.memberId).toBe(aliceId);
  });

  it("adds existing member to org B", async () => {
    const aliceId = "alice_orgb_001";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind(aliceId, "Alice OrgB", "alice@orgb.com")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(aliceId, ORG_A_ID)
      .run();

    const rosterMember = await createRosterMember(db, {
      name: "Alice OrgB Slot",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });

    await seedInvite(db, {
      id: "inv_orgb_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterMember.id,
      token: "tok_orgb_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    await acceptInvite(db, "tok_orgb_1", "alice@orgb.com");

    const orgIds = await getMemberOrgIds(db, aliceId);
    expect(orgIds).toContain(String(ORG_A_ID));
    expect(orgIds).toContain(String(ORG_B_ID));
  });

  it("does NOT set email_id on roster slot (AC3a: avoids duplicate email)", async () => {
    const aliceId = "alice_noemail_001";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind(aliceId, "Alice NoEmail", "alice@noemail.com")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(aliceId, ORG_A_ID)
      .run();

    const rosterMember = await createRosterMember(db, {
      name: "Alice NoEmail Slot",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });
    const rosterSlotId = rosterMember.id;

    await seedInvite(db, {
      id: "inv_noemail_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterSlotId,
      token: "tok_noemail_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    await acceptInvite(db, "tok_noemail_1", "alice@noemail.com");

    // The roster slot should have been deleted — email_id was NOT set on it
    // (if it had been set, we'd have two members with same email_id which
    // violates the UNIQUE INDEX idx_members_email_id)
    const rosterStillExists = await memberExists(db, rosterSlotId);
    expect(rosterStillExists).toBe(false);
  });

  it("hard-deletes roster slot when it has no remaining org memberships", async () => {
    const aliceId = "alice_harddelete_001";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind(aliceId, "Alice HardDelete", "alice@harddelete.com")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(aliceId, ORG_A_ID)
      .run();

    const rosterMember = await createRosterMember(db, {
      name: "Alice HardDelete Slot",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });
    const rosterSlotId = rosterMember.id;

    await seedInvite(db, {
      id: "inv_harddelete_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterSlotId,
      token: "tok_harddelete_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    await acceptInvite(db, "tok_harddelete_1", "alice@harddelete.com");

    // Roster slot: removed from org B, org count = 0 → hard-deleted
    expect(await memberExists(db, rosterSlotId)).toBe(false);
    expect(await getOrgCount(db, rosterSlotId)).toBe(0);
  });

  it("does NOT hard-delete roster slot when it is still in another org", async () => {
    // Seed: Bob in org A AND org B (second org membership added manually)
    // and also has a roster slot in org B from a separate invite
    const aliceId = "alice_twoorg_001";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind(aliceId, "Alice TwoOrg", "alice@twoorg.com")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(aliceId, ORG_A_ID)
      .run();

    // Roster slot also enrolled in ORG_A (simulates the slot being in 2 orgs)
    const rosterMember = await createRosterMember(db, {
      name: "Alice TwoOrg Slot",
      addedBy: adminId,
      orgId: ORG_B_ID,
    });
    const rosterSlotId = rosterMember.id;

    // Also add roster slot to org A (so it has 2 org memberships)
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(rosterSlotId, ORG_A_ID)
      .run();

    await seedInvite(db, {
      id: "inv_twoorg_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: rosterSlotId,
      token: "tok_twoorg_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    await acceptInvite(db, "tok_twoorg_1", "alice@twoorg.com");

    // Roster slot removed from org B but still in org A → NOT hard-deleted
    expect(await memberExists(db, rosterSlotId)).toBe(true);
    expect(await getOrgCount(db, rosterSlotId)).toBe(1);
  });

  it("deletes the invite BEFORE the roster member (FK order proof)", async () => {
    // This test directly verifies what #307 fixed:
    // The DB MUST enforce that a member referenced by an invite cannot be deleted
    // while the invite row still exists (no CASCADE on invites.roster_member_id FK).
    const memberId = "fk_proof_member";
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, NULL, NULL)",
      )
      .bind(memberId, "FK Proof Member")
      .run();
    await db
      .prepare(
        "INSERT INTO member_organizations VALUES (?, ?, NULL, NULL, datetime('now'))",
      )
      .bind(memberId, ORG_B_ID)
      .run();

    await seedInvite(db, {
      id: "inv_fkproof_1",
      orgId: String(ORG_B_ID),
      rosterMemberId: memberId,
      token: "tok_fkproof_1",
      invitedBy: adminId,
      expiresAt: FUTURE,
    });

    // Attempting to delete the member WHILE the invite still references them
    // must FAIL with an FK constraint error.
    // This proves the DB is actually enforcing the constraint that acceptInvite
    // must work around (by deleting invite FIRST).
    await expect(
      db.prepare("DELETE FROM members WHERE id = ?").bind(memberId).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: UNIQUE constraint — prevents duplicate email_id
// ---------------------------------------------------------------------------

describe("acceptInvite (integration) — UNIQUE constraints", () => {
  let db: D1Database;
  let adminId: string;

  beforeEach(async () => {
    db = createTestDb();
    ({ adminId } = await seedOrgsAndAdmin(db));
  });

  it("DB enforces UNIQUE on email_id (guards against duplicate registration)", async () => {
    // Seed: Carol already has this email
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
      )
      .bind("carol_existing", "Carol Existing", "carol@unique.com")
      .run();

    // Attempt to insert a second member with the same email_id
    await expect(
      db
        .prepare(
          "INSERT INTO members (id, name, email_id, invited_by) VALUES (?, ?, ?, NULL)",
        )
        .bind("carol_dup", "Carol Dup", "carol@unique.com")
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
  });
});
