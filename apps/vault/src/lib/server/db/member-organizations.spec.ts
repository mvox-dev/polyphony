// member-organizations.ts TDD test suite
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  addMemberToOrganization,
  getMemberOrganizations,
  getMemberOrgSummaries,
  getMembersByOrganization,
  removeMemberFromOrganization,
  updateMemberOrgNickname,
} from "./member-organizations";
import type {
  MemberOrganization,
  AddMemberToOrgInput,
  OrgSummary,
} from "$lib/types";

// Mock D1Database for testing
function createMockDB(): D1Database {
  const memberOrgs = new Map<string, any>(); // key: `${memberId}:${orgId}`
  const organizations = new Map<
    string,
    { id: string; name: string; subdomain: string }
  >(); // key: orgId

  // Seed org data for JOIN tests
  organizations.set("org_crede_001", {
    id: "org_crede_001",
    name: "Kammerkoor Crede",
    subdomain: "crede",
  });
  organizations.set("org_eca_001", {
    id: "org_eca_001",
    name: "ECA",
    subdomain: "eca",
  });
  organizations.set("org_hannijoggi_001", {
    id: "org_hannijoggi_001",
    name: "Hannijöggi",
    subdomain: "hannijoggi",
  });

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes("WHERE member_id = ? AND org_id = ?")) {
              const key = `${params[0]}:${params[1]}`;
              return memberOrgs.get(key) || null;
            }
            return null;
          },
          all: async () => {
            if (
              sql.includes("JOIN organizations") &&
              sql.includes("WHERE mo.member_id = ?")
            ) {
              // getMemberOrgSummaries JOIN query
              const memberId = params[0];
              const results = Array.from(memberOrgs.values())
                .filter((mo) => mo.member_id === memberId)
                .map((mo) => {
                  const org = organizations.get(mo.org_id);
                  return org
                    ? { id: org.id, name: org.name, subdomain: org.subdomain }
                    : null;
                })
                .filter(Boolean);
              return { results };
            }
            if (sql.includes("WHERE member_id = ?")) {
              const memberId = params[0];
              const results = Array.from(memberOrgs.values()).filter(
                (mo) => mo.member_id === memberId,
              );
              return { results };
            }
            if (sql.includes("WHERE org_id = ?")) {
              const orgId = params[0];
              const results = Array.from(memberOrgs.values()).filter(
                (mo) => mo.org_id === orgId,
              );
              return { results };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes("INSERT INTO member_organizations")) {
              const [memberId, orgId, nickname, invitedBy] = params;
              const key = `${memberId}:${orgId}`;
              memberOrgs.set(key, {
                member_id: memberId,
                org_id: orgId,
                nickname: nickname || null,
                invited_by: invitedBy || null,
                joined_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE member_organizations SET nickname")) {
              const [nickname, memberId, orgId] = params;
              const key = `${memberId}:${orgId}`;
              const mo = memberOrgs.get(key);
              if (mo) {
                mo.nickname = nickname;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: false, meta: { changes: 0 } };
            }
            if (sql.includes("DELETE FROM member_organizations")) {
              const [memberId, orgId] = params;
              const key = `${memberId}:${orgId}`;
              const deleted = memberOrgs.delete(key);
              return { success: deleted, meta: { changes: deleted ? 1 : 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
        all: async () => ({ results: [] }),
      };
    },
    batch: async () => ({ results: [] }),
    exec: async () => ({ results: [] }),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

describe("Member Organizations Database Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("addMemberToOrganization", () => {
    it("adds a member to an organization", async () => {
      const input: AddMemberToOrgInput = {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      };

      const result = await addMemberToOrganization(db, input);

      expect(result).toBeDefined();
      expect(result.memberId).toBe("member_001");
      expect(result.orgId).toBe("org_crede_001");
      expect(result.nickname).toBeNull();
      expect(result.invitedBy).toBeNull();
      expect(result.joinedAt).toBeDefined();
    });

    it("adds a member with nickname and invitedBy", async () => {
      const input: AddMemberToOrgInput = {
        memberId: "member_002",
        orgId: createOrgId("org_crede_001"),
        nickname: "Tom",
        invitedBy: "member_001",
      };

      const result = await addMemberToOrganization(db, input);

      expect(result.nickname).toBe("Tom");
      expect(result.invitedBy).toBe("member_001");
    });
  });

  describe("getMemberOrganizations", () => {
    it("returns all organizations for a member", async () => {
      // Add member to two orgs
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      });
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_eca_001"),
      });

      const orgs = await getMemberOrganizations(db, "member_001");

      expect(orgs).toHaveLength(2);
    });

    it("returns empty array for member with no organizations", async () => {
      const orgs = await getMemberOrganizations(db, "nonexistent");

      expect(orgs).toEqual([]);
    });
  });

  describe("getMembersByOrganization", () => {
    it("returns all members in an organization", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      });
      await addMemberToOrganization(db, {
        memberId: "member_002",
        orgId: createOrgId("org_crede_001"),
      });
      await addMemberToOrganization(db, {
        memberId: "member_003",
        orgId: createOrgId("org_other_001"), // Different org
      });

      const members = await getMembersByOrganization(db, "org_crede_001");

      expect(members).toHaveLength(2);
      expect(members.map((m) => m.memberId)).toContain("member_001");
      expect(members.map((m) => m.memberId)).toContain("member_002");
    });

    it("returns empty array for organization with no members", async () => {
      const members = await getMembersByOrganization(db, "empty_org");

      expect(members).toEqual([]);
    });
  });

  describe("removeMemberFromOrganization", () => {
    it("removes a member from an organization", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      });

      const removed = await removeMemberFromOrganization(
        db,
        "member_001",
        "org_crede_001",
      );

      expect(removed).toBe(true);

      const orgs = await getMemberOrganizations(db, "member_001");
      expect(orgs).toHaveLength(0);
    });

    it("returns false when removing non-existent membership", async () => {
      const removed = await removeMemberFromOrganization(
        db,
        "nonexistent",
        "org_crede_001",
      );

      expect(removed).toBe(false);
    });
  });

  describe("updateMemberOrgNickname", () => {
    it("updates nickname for a member in an organization", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      });

      const updated = await updateMemberOrgNickname(
        db,
        "member_001",
        "org_crede_001",
        "Tommy",
      );

      expect(updated).toBeDefined();
      expect(updated?.nickname).toBe("Tommy");
    });

    it("returns null for non-existent membership", async () => {
      const updated = await updateMemberOrgNickname(
        db,
        "nonexistent",
        "org_crede_001",
        "Nick",
      );

      expect(updated).toBeNull();
    });

    it("clears nickname when set to null", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
        nickname: "Tom",
      });

      const updated = await updateMemberOrgNickname(
        db,
        "member_001",
        "org_crede_001",
        null,
      );

      expect(updated).toBeDefined();
      expect(updated?.nickname).toBeNull();
    });
  });

  describe("getMemberOrgSummaries", () => {
    it("returns org summaries with name and subdomain for a member", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_crede_001"),
      });
      await addMemberToOrganization(db, {
        memberId: "member_001",
        orgId: createOrgId("org_hannijoggi_001"),
      });

      const summaries = await getMemberOrgSummaries(db, "member_001");

      expect(summaries).toHaveLength(2);
      expect(summaries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Kammerkoor Crede",
            subdomain: "crede",
          }),
          expect.objectContaining({
            name: "Hannijöggi",
            subdomain: "hannijoggi",
          }),
        ]),
      );
    });

    it("returns empty array for member with no organizations", async () => {
      const summaries = await getMemberOrgSummaries(db, "nonexistent");

      expect(summaries).toEqual([]);
    });

    it("returns single org for member in one organization", async () => {
      await addMemberToOrganization(db, {
        memberId: "member_solo",
        orgId: createOrgId("org_eca_001"),
      });

      const summaries = await getMemberOrgSummaries(db, "member_solo");

      expect(summaries).toHaveLength(1);
      expect(summaries[0].name).toBe("ECA");
      expect(summaries[0].subdomain).toBe("eca");
    });
  });
});
