// TDD: Two-tier member system tests (roster + registered)
/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createMember,
  createRosterMember,
  upgradeToRegistered,
  getMemberByEmailId,
  getMemberByName,
  isRegistered,
  getAuthEmail,
  getContactEmail,
  type Member,
} from "../../../../lib/server/db/members.js";

const TEST_ORG_ID = createOrgId("org_test_001");

// Simplified mock D1 database for roster tests
const createMockDb = () => {
  const members = new Map<
    string,
    {
      id: string;
      name: string;
      email_id: string | null;
      email_contact: string | null;
      invited_by: string | null;
      joined_at: string;
    }
  >();
  const memberRoles = new Map<string, string[]>();
  const memberVoices = new Map<
    string,
    { voice_id: string; is_primary: number }[]
  >();
  const memberSections = new Map<
    string,
    { section_id: string; is_primary: number }[]
  >();

  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          // INSERT INTO members
          if (sql.includes("INSERT INTO members")) {
            // createMember: VALUES (?, ?, ?, NULL, ?) - email_contact is NULL (4th position)
            // createRosterMember: VALUES (?, ?, NULL, ?, ?) - email_id is NULL (3rd position)
            if (sql.includes("?, ?, NULL, ?, ?)")) {
              // createRosterMember case: email_id=NULL, params=[id, name, email_contact, invited_by]
              const [id, name, email_contact, invited_by] = params as [
                string,
                string,
                string | null,
                string | null,
              ];
              members.set(id, {
                id,
                name,
                email_id: null,
                email_contact,
                invited_by,
                joined_at: new Date().toISOString(),
              });
            } else if (sql.includes("?, ?, ?, NULL, ?)")) {
              // createMember case: email_contact=NULL, params=[id, name, email_id, invited_by]
              const [id, name, email_id, invited_by] = params as [
                string,
                string,
                string,
                string | null,
              ];
              members.set(id, {
                id,
                name,
                email_id,
                email_contact: null,
                invited_by,
                joined_at: new Date().toISOString(),
              });
            }
            return { success: true, meta: { changes: 1 } };
          }
          // INSERT INTO member_organizations (org link)
          if (sql.includes("INSERT INTO member_organizations")) {
            return { success: true, meta: { changes: 1 } };
          }
          // INSERT INTO member_roles
          if (sql.includes("INSERT INTO member_roles")) {
            const [member_id, , role] = params as [
              string,
              string,
              string,
              string | null,
            ];
            const existing = memberRoles.get(member_id) || [];
            existing.push(role);
            memberRoles.set(member_id, existing);
            return { success: true, meta: { changes: 1 } };
          }
          // UPDATE members SET email_id
          if (sql.includes("UPDATE members SET email_id")) {
            const [email_id, id] = params as [string, string];
            const member = members.get(id);
            if (member) {
              member.email_id = email_id;
              members.set(id, member);
            }
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        },
        first: async () => {
          // SELECT member with name check (org-scoped or global)
          if (sql.includes("LOWER(m.name)") || sql.includes("LOWER(name)")) {
            const name = params[0] as string;
            for (const member of members.values()) {
              if (member.name.toLowerCase() === name.toLowerCase()) {
                return { id: member.id };
              }
            }
            return null;
          }
          // SELECT by id (with JOIN member_organizations) — must come before email_id check
          if (
            sql.includes("FROM members") &&
            sql.includes("member_organizations") &&
            sql.includes("WHERE m.id")
          ) {
            const id = params[0] as string;
            return members.get(id) || null;
          }
          // SELECT by email_id (org-scoped via JOIN member_organizations)
          if (
            sql.includes("m.email_id") &&
            sql.includes("member_organizations")
          ) {
            const email_id = params[0] as string;
            for (const member of members.values()) {
              if (member.email_id === email_id) {
                return member;
              }
            }
            return null;
          }
          return null;
        },
        all: async () => {
          // SELECT roles
          if (sql.includes("FROM member_roles")) {
            const member_id = params[0] as string;
            const roles = memberRoles.get(member_id) || [];
            return { results: roles.map((role) => ({ role })) };
          }
          // SELECT voices (queryMemberVoices)
          if (
            sql.includes("FROM voices") &&
            sql.includes("JOIN member_voices")
          ) {
            const member_id = params[0] as string;
            const voices = memberVoices.get(member_id) || [];
            // Return empty array for now - roster tests don't use voices
            return {
              results: voices.map((v) => ({
                id: v.voice_id,
                name: "Test Voice",
                abbreviation: "TV",
                category: "vocal",
                range_group: null,
                display_order: 0,
                is_active: 1,
                is_primary: v.is_primary,
              })),
            };
          }
          // SELECT sections (queryMemberSections)
          if (
            sql.includes("FROM sections") &&
            sql.includes("JOIN member_sections")
          ) {
            const member_id = params[0] as string;
            const sections = memberSections.get(member_id) || [];
            // Return empty array for now - roster tests don't use sections
            return {
              results: sections.map((s) => ({
                id: s.section_id,
                name: "Test Section",
                abbreviation: "TS",
                parent_section_id: null,
                display_order: 0,
                is_active: 1,
                is_primary: s.is_primary,
              })),
            };
          }
          return { results: [] };
        },
      }),
    }),
    batch: async (statements: any[]) => {
      const results = [];
      for (const stmt of statements) {
        const result = await stmt.run();
        results.push(result);
      }
      return results;
    },
  } as unknown as D1Database;
};

describe("Two-tier member system", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("Helper functions", () => {
    it("isRegistered should return true for OAuth members", async () => {
      const member = await createMember(db, {
        email: "registered@choir.org",
        name: "Registered User",
        roles: [],
        orgId: TEST_ORG_ID,
      });

      expect(isRegistered(member)).toBe(true);
    });

    it("isRegistered should return false for roster-only members", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Roster Only",
        addedBy: "admin-id",
      });

      expect(isRegistered(member)).toBe(false);
    });

    it("getAuthEmail should return email_id for registered members", async () => {
      const member = await createMember(db, {
        email: "auth@choir.org",
        name: "Auth User",
        roles: [],
        orgId: TEST_ORG_ID,
      });

      expect(getAuthEmail(member)).toBe("auth@choir.org");
    });

    it("getAuthEmail should return null for roster-only members", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Roster Member",
        addedBy: "admin-id",
      });

      expect(getAuthEmail(member)).toBeNull();
    });

    it("getContactEmail should prefer email_contact over email_id", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Contact Test",
        email_contact: "contact@example.com",
        addedBy: "admin-id",
      });

      // After upgrade with different OAuth email
      const upgraded = await upgradeToRegistered(
        db,
        member.id,
        "oauth@provider.com",
        TEST_ORG_ID,
      );

      expect(getContactEmail(upgraded)).toBe("contact@example.com");
    });

    it("getContactEmail should fallback to email_id if no contact email", async () => {
      const member = await createMember(db, {
        email: "fallback@choir.org",
        name: "Fallback User",
        roles: [],
        orgId: TEST_ORG_ID,
      });

      expect(getContactEmail(member)).toBe("fallback@choir.org");
    });
  });

  describe("createRosterMember", () => {
    it("should create a roster-only member without OAuth", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Jane Doe",
        addedBy: "admin-123",
      });

      expect(member.name).toBe("Jane Doe");
      expect(member.email_id).toBeNull();
      expect(member.email_contact).toBeNull();
      expect(member.invited_by).toBe("admin-123");
      expect(member.roles).toEqual([]); // Roster-only members have no roles
      expect(isRegistered(member)).toBe(false);
    });

    it("should create roster member with contact email", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Contact Member",
        email_contact: "contact@personal.com",
        addedBy: "admin-123",
      });

      expect(member.email_contact).toBe("contact@personal.com");
      expect(member.email_id).toBeNull();
    });

    it("should create roster member with pre-assigned roles", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Future Admin",
        roles: ["admin", "librarian"],
        addedBy: "owner-123",
      });

      expect(member.roles).toEqual(["admin", "librarian"]);
      expect(isRegistered(member)).toBe(false);
    });

    it("should create roster member without roles (backward compat)", async () => {
      const member = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "No Roles Member",
        addedBy: "admin-123",
      });

      expect(member.roles).toEqual([]);
    });

    it("should enforce case-insensitive name uniqueness", async () => {
      await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Unique Name",
        addedBy: "admin-123",
      });

      await expect(
        createRosterMember(db, {
          orgId: TEST_ORG_ID,
          name: "UNIQUE NAME", // Different case
          addedBy: "admin-123",
        }),
      ).rejects.toThrow('Member with name "UNIQUE NAME" already exists');
    });
  });

  describe("upgradeToRegistered", () => {
    it("should add email_id to roster-only member", async () => {
      const rosterMember = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Upgrader",
        addedBy: "admin-123",
      });

      expect(rosterMember.email_id).toBeNull();

      const upgraded = await upgradeToRegistered(
        db,
        rosterMember.id,
        "verified@oauth.com",
        TEST_ORG_ID,
      );

      expect(upgraded.email_id).toBe("verified@oauth.com");
      expect(upgraded.name).toBe("Upgrader"); // Name unchanged
      expect(isRegistered(upgraded)).toBe(true);
    });

    it("should prevent email_id collision", async () => {
      // Create registered member
      const existing = await createMember(db, {
        email: "taken@choir.org",
        name: "Existing",
        roles: [],
        orgId: TEST_ORG_ID,
      });

      // Create roster member
      const roster = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Roster",
        addedBy: "admin-123",
      });

      // Try to upgrade with existing email
      await expect(
        upgradeToRegistered(db, roster.id, "taken@choir.org", TEST_ORG_ID),
      ).rejects.toThrow("Email already registered to another member");
    });

    it("should allow upgrading with same email (idempotent)", async () => {
      const roster = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Idempotent",
        addedBy: "admin-123",
      });

      const upgraded1 = await upgradeToRegistered(
        db,
        roster.id,
        "email@example.com",
        TEST_ORG_ID,
      );
      const upgraded2 = await upgradeToRegistered(
        db,
        roster.id,
        "email@example.com",
        TEST_ORG_ID,
      );

      expect(upgraded2.email_id).toBe("email@example.com");
    });
  });

  describe("getMemberByEmailId", () => {
    it("should find registered member by email_id", async () => {
      const created = await createMember(db, {
        email: "find@choir.org",
        name: "Findable",
        roles: [],
        orgId: TEST_ORG_ID,
      });

      const found = await getMemberByEmailId(db, "find@choir.org", TEST_ORG_ID);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.email_id).toBe("find@choir.org");
    });

    it("should not find roster-only members by email_id", async () => {
      await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Roster Only",
        email_contact: "contact@example.com",
        addedBy: "admin-123",
      });

      const found = await getMemberByEmailId(
        db,
        "contact@example.com",
        TEST_ORG_ID,
      );

      expect(found).toBeNull(); // Contact email is NOT email_id
    });

    it("should return null for unknown email_id", async () => {
      const found = await getMemberByEmailId(
        db,
        "nonexistent@choir.org",
        TEST_ORG_ID,
      );
      expect(found).toBeNull();
    });
  });

  describe("getMemberByName", () => {
    it("should find member by exact name", async () => {
      const created = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Exact Match",
        addedBy: "admin-123",
      });

      const found = await getMemberByName(db, "Exact Match", TEST_ORG_ID);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it("should find member by case-insensitive name", async () => {
      const created = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "Case Insensitive",
        addedBy: "admin-123",
      });

      const found = await getMemberByName(db, "CASE INSENSITIVE", TEST_ORG_ID);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it("should return null for unknown name", async () => {
      const found = await getMemberByName(db, "Nonexistent", TEST_ORG_ID);
      expect(found).toBeNull();
    });
  });

  describe("Data migration workflow", () => {
    it("should support complete workflow: roster with pre-assigned roles → upgrade", async () => {
      // 1. Add to roster with pre-assigned roles (before OAuth)
      const roster = await createRosterMember(db, {
        orgId: TEST_ORG_ID,
        name: "New Singer",
        email_contact: "personal@email.com",
        roles: ["conductor"],
        addedBy: "owner-id",
      });

      expect(roster.roles).toEqual(["conductor"]);
      expect(isRegistered(roster)).toBe(false);

      // 2. Member accepts invite and does OAuth
      const registered = await upgradeToRegistered(
        db,
        roster.id,
        "oauth@google.com",
        TEST_ORG_ID,
      );

      expect(registered.email_id).toBe("oauth@google.com");
      expect(registered.email_contact).toBe("personal@email.com");
      expect(isRegistered(registered)).toBe(true);
      // 3. Pre-assigned roles survive the upgrade
      expect(registered.roles).toEqual(["conductor"]);
    });
  });
});
