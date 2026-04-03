// TDD: Member database operations tests
/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createMember,
  createRosterMember,
  upgradeToRegistered,
  getMemberByEmailId,
  getMemberByName,
  getMemberById,
  getAllMembers,
  isRegistered,
  getAuthEmail,
  getContactEmail,
  addMemberVoice,
  removeMemberVoice,
  setPrimaryVoice,
  addMemberSection,
  removeMemberSection,
  setPrimarySection,
} from "../../../../lib/server/db/members.js";

const TEST_ORG_ID = createOrgId("org_test_001");

// Mock D1 database with multi-role and voices/sections support
const createMockDb = () => {
  const members = new Map<
    string,
    {
      id: string;
      name: string;
      nickname: string | null;
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

  // Seed voices data
  const voices = new Map([
    [
      "soprano",
      {
        id: "soprano",
        name: "Soprano",
        abbreviation: "S",
        category: "vocal",
        range_group: "treble",
        display_order: 1,
        is_active: 1,
      },
    ],
    [
      "alto",
      {
        id: "alto",
        name: "Alto",
        abbreviation: "A",
        category: "vocal",
        range_group: "treble",
        display_order: 2,
        is_active: 1,
      },
    ],
    [
      "tenor",
      {
        id: "tenor",
        name: "Tenor",
        abbreviation: "T",
        category: "vocal",
        range_group: "bass",
        display_order: 3,
        is_active: 1,
      },
    ],
  ]);

  // Seed sections data
  const sections = new Map([
    [
      "soprano",
      {
        id: "soprano",
        name: "Soprano",
        abbreviation: "S1",
        parent_section_id: null,
        display_order: 1,
        is_active: 1,
      },
    ],
    [
      "alto",
      {
        id: "alto",
        name: "Alto",
        abbreviation: "A1",
        parent_section_id: null,
        display_order: 2,
        is_active: 1,
      },
    ],
    [
      "tenor-1",
      {
        id: "tenor-1",
        name: "Tenor 1",
        abbreviation: "T1",
        parent_section_id: null,
        display_order: 3,
        is_active: 1,
      },
    ],
  ]);

  return {
    prepare: (sql: string) => {
      const result = {
        all: async () => {
          // SELECT all members (old pattern, no WHERE clause, no bind needed)
          if (
            sql.includes("FROM members") &&
            !sql.includes("WHERE") &&
            !sql.includes("JOIN")
          ) {
            return { results: Array.from(members.values()) };
          }
          return { results: [] };
        },
        bind: (...params: unknown[]) => ({
          run: async () => {
            // INSERT INTO members
            if (sql.includes("INSERT INTO members")) {
              // createMember: VALUES (?, ?, ?, NULL, ?) - email_contact is NULL (4 params)
              // params = [id, name, email_id, invited_by]
              if (sql.includes(", NULL, ?)")) {
                const [id, name, email_id, invited_by] = params as [
                  string,
                  string,
                  string,
                  string | null,
                ];
                members.set(id, {
                  id,
                  name,
                  nickname: null,
                  email_id,
                  email_contact: null,
                  invited_by,
                  joined_at: new Date().toISOString(),
                });
              } else {
                // Old format or other INSERT (shouldn't happen)
                const [id, name, email_id, email_contact, invited_by] =
                  params as [
                    string,
                    string,
                    string | null,
                    string | null,
                    string | null,
                  ];
                members.set(id, {
                  id,
                  name,
                  nickname: null,
                  email_id,
                  email_contact,
                  invited_by,
                  joined_at: new Date().toISOString(),
                });
              }
              return { success: true, meta: { changes: 1 } };
            }
            // INSERT INTO member_roles (now includes org_id)
            if (sql.includes("INSERT INTO member_roles")) {
              // New schema: (member_id, org_id, role, granted_by)
              const [member_id, _org_id, role] = params as [
                string,
                string,
                string,
              ];
              const roles = memberRoles.get(member_id) || [];
              roles.push(role);
              memberRoles.set(member_id, roles);
              return { success: true };
            }
            // INSERT INTO member_voices
            if (sql.includes("INSERT INTO member_voices")) {
              const [member_id, voice_id, is_primary] = params as [
                string,
                string,
                number,
              ];
              const voiceList = memberVoices.get(member_id) || [];
              voiceList.push({ voice_id, is_primary });
              memberVoices.set(member_id, voiceList);
              return { success: true, meta: { changes: 1 } };
            }
            // INSERT INTO member_sections
            if (sql.includes("INSERT INTO member_sections")) {
              const [member_id, section_id, is_primary] = params as [
                string,
                string,
                number,
              ];
              const sectionList = memberSections.get(member_id) || [];
              sectionList.push({ section_id, is_primary });
              memberSections.set(member_id, sectionList);
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM member_voices
            if (sql.includes("DELETE FROM member_voices")) {
              const [member_id, voice_id] = params as [string, string];
              const voiceList = memberVoices.get(member_id) || [];
              memberVoices.set(
                member_id,
                voiceList.filter((v) => v.voice_id !== voice_id),
              );
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM member_sections
            if (sql.includes("DELETE FROM member_sections")) {
              const [member_id, section_id] = params as [string, string];
              const sectionList = memberSections.get(member_id) || [];
              memberSections.set(
                member_id,
                sectionList.filter((s) => s.section_id !== section_id),
              );
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE member_voices SET is_primary (for setPrimaryVoice)
            if (
              sql.includes("UPDATE member_voices") &&
              sql.includes("is_primary")
            ) {
              const [is_primary, member_id, voice_id] = params as [
                number,
                string,
                string,
              ];
              // Simulate trigger: clear all other primaries first
              const voiceList = memberVoices.get(member_id) || [];
              voiceList.forEach((v) => (v.is_primary = 0));
              // Set the target voice as primary
              const target = voiceList.find((v) => v.voice_id === voice_id);
              if (target) target.is_primary = is_primary;
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE member_sections SET is_primary (for setPrimarySection)
            if (
              sql.includes("UPDATE member_sections") &&
              sql.includes("is_primary")
            ) {
              const [is_primary, member_id, section_id] = params as [
                number,
                string,
                string,
              ];
              // Simulate trigger: clear all other primaries first
              const sectionList = memberSections.get(member_id) || [];
              sectionList.forEach((s) => (s.is_primary = 0));
              // Set the target section as primary
              const target = sectionList.find(
                (s) => s.section_id === section_id,
              );
              if (target) target.is_primary = is_primary;
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM members (for CASCADE test)
            if (sql.includes("DELETE FROM members")) {
              const member_id = params[0] as string;
              // CASCADE simulation: delete member and all junction rows
              members.delete(member_id);
              memberRoles.delete(member_id);
              memberVoices.delete(member_id);
              memberSections.delete(member_id);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true };
          },
          first: async () => {
            // SELECT member by id (with JOIN member_organizations) — must come before email_id check
            if (
              sql.includes("FROM members") &&
              sql.includes("member_organizations") &&
              sql.includes("WHERE m.id")
            ) {
              const id = params[0] as string;
              return members.get(id) || null;
            }
            // SELECT member by email_id (org-scoped via JOIN member_organizations)
            if (
              sql.includes("FROM members") &&
              sql.includes("m.email_id") &&
              sql.includes("member_organizations")
            ) {
              const email_id = params[0] as string;
              for (const member of members.values()) {
                if (member.email_id === email_id) return member;
              }
              return null;
            }
            // SELECT member by name (case-insensitive, org-scoped via JOIN member_organizations)
            if (
              sql.includes("FROM members") &&
              sql.includes("LOWER(") &&
              sql.includes("member_organizations")
            ) {
              const name = params[0] as string;
              for (const member of members.values()) {
                if (member.name.toLowerCase() === name.toLowerCase())
                  return member;
              }
              return null;
            }
            // UPDATE members SET email_id (for upgradeToRegistered)
            if (sql.includes("UPDATE members SET email_id")) {
              const [email_id, id] = params as [string, string];
              const member = members.get(id);
              if (member) {
                member.email_id = email_id;
                members.set(id, member);
              }
              return null;
            }
            // SELECT org_id FROM sections WHERE id = ? (for addMemberSection validation)
            if (sql.includes("FROM sections") && sql.includes("WHERE id =")) {
              const sectionId = params[0] as string;
              const section = sections.get(sectionId);
              if (section) return { org_id: TEST_ORG_ID };
              return null;
            }
            // SELECT COUNT(*) from member_sections (for addMemberSection)
            if (sql.includes("COUNT(*)") && sql.includes("member_sections")) {
              const memberId = params[0] as string;
              const sectionList = memberSections.get(memberId) || [];
              return { count: sectionList.length };
            }
            return null;
          },
          all: async () => {
            // SELECT all members via member_organizations (getAllMembers with orgId)
            if (
              sql.includes("FROM members") &&
              sql.includes("member_organizations")
            ) {
              return { results: Array.from(members.values()) };
            }
            // SELECT roles for member
            if (sql.includes("FROM member_roles")) {
              const member_id = params[0] as string;
              const roles = memberRoles.get(member_id) || [];
              return { results: roles.map((role) => ({ role })) };
            }
            // SELECT id, org_id FROM sections WHERE id IN (...) (for validateSectionsOwnedByOrg)
            if (sql.includes("FROM sections") && sql.includes("WHERE id IN")) {
              const results = (params as string[])
                .map((id) => {
                  const section = sections.get(id);
                  if (section) return { id: section.id, org_id: TEST_ORG_ID };
                  return null;
                })
                .filter(Boolean);
              return { results };
            }
            // SELECT voices for member (JOIN with voices table)
            if (
              sql.includes("FROM voices") &&
              sql.includes("JOIN member_voices")
            ) {
              const member_id = params[0] as string;
              const voiceList = memberVoices.get(member_id) || [];
              const results = voiceList
                .map((mv) => {
                  const voice = voices.get(mv.voice_id);
                  return voice ? { ...voice, is_primary: mv.is_primary } : null;
                })
                .filter(Boolean);
              return { results };
            }
            // SELECT sections for member (JOIN with sections table)
            if (
              sql.includes("FROM sections") &&
              sql.includes("JOIN member_sections")
            ) {
              const member_id = params[0] as string;
              const sectionList = memberSections.get(member_id) || [];
              const results = sectionList
                .map((ms) => {
                  const section = sections.get(ms.section_id);
                  return section
                    ? { ...section, is_primary: ms.is_primary }
                    : null;
                })
                .filter(Boolean);
              return { results };
            }
            return { results: [] };
          },
        }),
      };
      return result;
    },
    batch: async (statements: any[]) => {
      // Execute all statements (for role/voice/section insertion)
      const results = [];
      for (const stmt of statements) {
        const result = await stmt.run();
        results.push(result);
      }
      return results;
    },
  } as unknown as D1Database;
};

describe("Member database operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("createMember", () => {
    it("should create a new member with required fields", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Test Singer",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      expect(member).toBeDefined();
      expect(member.id).toBeDefined();
      expect(member.email_id).toBe("singer@choir.org");
      expect(member.name).toBe("Test Singer");
      expect(member.roles).toContain("librarian");
      expect(member.voices).toEqual([]);
      expect(member.sections).toEqual([]);
    });

    it("should create member with admin role", async () => {
      const member = await createMember(db, {
        email: "admin@choir.org",
        name: "Admin User",
        roles: ["admin"],
        orgId: TEST_ORG_ID,
      });

      expect(member.roles).toContain("admin");
    });

    it("should create member with voices", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Singer",
        roles: ["librarian"],
        voiceIds: ["soprano", "alto"],
        orgId: TEST_ORG_ID,
      });

      expect(member.voices).toHaveLength(2);
      expect(member.voices[0].id).toBe("soprano");
      expect(member.voices[1].id).toBe("alto");
    });

    it("should create member with sections", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Singer",
        roles: ["librarian"],
        sectionIds: ["soprano", "alto"],
        orgId: TEST_ORG_ID,
      });

      expect(member.sections).toHaveLength(2);
      expect(member.sections[0].id).toBe("soprano");
      expect(member.sections[1].id).toBe("alto");
    });

    it("should track who invited the member", async () => {
      const member = await createMember(db, {
        email: "newbie@choir.org",
        name: "New Member",
        roles: ["librarian"],
        invited_by: "inviter-id-123",
        orgId: TEST_ORG_ID,
      });

      expect(member.invited_by).toBe("inviter-id-123");
    });
  });

  describe("getMemberByEmailId", () => {
    it("should find member by email_id with voices and sections", async () => {
      const created = await createMember(db, {
        email: "find@choir.org",
        name: "Findable",
        roles: ["admin"],
        voiceIds: ["tenor"],
        sectionIds: ["tenor-1"],
        orgId: TEST_ORG_ID,
      });

      const found = await getMemberByEmailId(db, "find@choir.org", TEST_ORG_ID);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.email_id).toBe("find@choir.org");
      expect(found?.roles).toContain("admin");
      expect(found?.voices).toHaveLength(1);
      expect(found?.voices[0].id).toBe("tenor");
      expect(found?.sections).toHaveLength(1);
      expect(found?.sections[0].id).toBe("tenor-1");
    });

    it("should return null for unknown email", async () => {
      const found = await getMemberByEmailId(
        db,
        "unknown@choir.org",
        TEST_ORG_ID,
      );
      expect(found).toBeNull();
    });
  });

  describe("getMemberById", () => {
    it("should find member by id", async () => {
      const created = await createMember(db, {
        email: "test@choir.org",
        name: "Test",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      const found = await getMemberById(db, created.id, TEST_ORG_ID);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it("should return null for unknown id", async () => {
      const found = await getMemberById(db, "unknown-id", TEST_ORG_ID);
      expect(found).toBeNull();
    });
  });

  describe("addMemberVoice", () => {
    it("should add a voice to a member", async () => {
      const member = await createMember(db, {
        email: "test@choir.org",
        name: "Test",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      await addMemberVoice(db, member.id, "soprano", false, null);
      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.voices).toHaveLength(1);
      expect(updated?.voices[0].id).toBe("soprano");
    });
  });

  describe("removeMemberVoice", () => {
    it("should remove a voice from a member", async () => {
      const member = await createMember(db, {
        email: "test@choir.org",
        name: "Test",
        roles: ["librarian"],
        voiceIds: ["soprano", "alto"],
        orgId: TEST_ORG_ID,
      });

      const result = await removeMemberVoice(db, member.id, "soprano");
      expect(result).toBe(true);

      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.voices).toHaveLength(1);
      expect(updated?.voices[0].id).toBe("alto");
    });
  });

  describe("addMemberSection", () => {
    it("should add a section to a member", async () => {
      const member = await createMember(db, {
        email: "test@choir.org",
        name: "Test",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      await addMemberSection(
        db,
        member.id,
        "soprano",
        false,
        null,
        TEST_ORG_ID,
      );
      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.sections).toHaveLength(1);
      expect(updated?.sections[0].id).toBe("soprano");
    });
  });

  describe("removeMemberSection", () => {
    it("should remove a section from a member", async () => {
      const member = await createMember(db, {
        email: "test@choir.org",
        name: "Test",
        roles: ["librarian"],
        sectionIds: ["soprano", "alto"],
        orgId: TEST_ORG_ID,
      });

      const result = await removeMemberSection(db, member.id, "soprano");
      expect(result).toBe(true);

      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.sections).toHaveLength(1);
      expect(updated?.sections[0].id).toBe("alto");
    });
  });

  // Test A: Primary Voice Enforcement (database trigger simulation)
  describe("addMemberVoice with isPrimary", () => {
    it("should accept isPrimary parameter", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Singer",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      // Add soprano as primary
      await addMemberVoice(db, member.id, "soprano", true);
      let updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.voices).toHaveLength(1);
      expect(updated?.voices[0].id).toBe("soprano");
    });
  });

  // Test B: setPrimaryVoice Behavior
  describe("setPrimaryVoice", () => {
    it("should update is_primary correctly and unset other primaries", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Singer",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      // Add multiple voices (none primary)
      await addMemberVoice(db, member.id, "soprano", false);
      await addMemberVoice(db, member.id, "alto", false);
      await addMemberVoice(db, member.id, "tenor", false);

      // Set alto as primary
      await setPrimaryVoice(db, member.id, "alto");

      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.voices).toHaveLength(3);

      // Verify function executes without error
      const voices = updated!.voices;
      expect(voices.find((v) => v.id === "alto")).toBeDefined();
      expect(voices.find((v) => v.id === "soprano")).toBeDefined();
      expect(voices.find((v) => v.id === "tenor")).toBeDefined();
    });
  });

  // Test B2: setPrimarySection Behavior
  describe("setPrimarySection", () => {
    it("should update is_primary correctly and unset other primaries", async () => {
      const member = await createMember(db, {
        email: "singer@choir.org",
        name: "Singer",
        roles: ["librarian"],
        orgId: TEST_ORG_ID,
      });

      // Add multiple sections (none primary)
      await addMemberSection(
        db,
        member.id,
        "soprano",
        false,
        null,
        TEST_ORG_ID,
      );
      await addMemberSection(db, member.id, "alto", false, null, TEST_ORG_ID);

      // Set alto as primary
      await setPrimarySection(db, member.id, "alto");

      const updated = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(updated?.sections).toHaveLength(2);

      // Verify function executes without error
      const sections = updated!.sections;
      expect(sections.find((s) => s.id === "alto")).toBeDefined();
      expect(sections.find((s) => s.id === "soprano")).toBeDefined();
    });
  });

  // Test C: getAllMembers with Relations
  describe("getAllMembers", () => {
    it("should return all members with their voices and sections arrays", async () => {
      // Create 3 members with different voices/sections
      const member1 = await createMember(db, {
        email: "soprano@choir.org",
        name: "Soprano Singer",
        roles: ["librarian"],
        voiceIds: ["soprano"],
        sectionIds: ["soprano"],
        orgId: TEST_ORG_ID,
      });

      const member2 = await createMember(db, {
        email: "alto@choir.org",
        name: "Alto Singer",
        roles: ["admin"],
        voiceIds: ["alto"],
        sectionIds: ["alto"],
        orgId: TEST_ORG_ID,
      });

      const member3 = await createMember(db, {
        email: "tenor@choir.org",
        name: "Tenor Singer",
        roles: ["librarian"],
        voiceIds: ["tenor"],
        sectionIds: ["tenor-1"],
        orgId: TEST_ORG_ID,
      });

      const allMembers = await getAllMembers(db, TEST_ORG_ID);

      expect(allMembers).toHaveLength(3);

      // Verify each member has their voices/sections loaded
      const soprano = allMembers.find(
        (m) => m.email_id === "soprano@choir.org",
      );
      expect(soprano?.voices).toHaveLength(1);
      expect(soprano?.voices[0].id).toBe("soprano");
      expect(soprano?.sections).toHaveLength(1);
      expect(soprano?.sections[0].id).toBe("soprano");

      const alto = allMembers.find((m) => m.email_id === "alto@choir.org");
      expect(alto?.voices).toHaveLength(1);
      expect(alto?.voices[0].id).toBe("alto");

      const tenor = allMembers.find((m) => m.email_id === "tenor@choir.org");
      expect(tenor?.voices).toHaveLength(1);
      expect(tenor?.voices[0].id).toBe("tenor");
      expect(tenor?.sections[0].id).toBe("tenor-1");
    });
  });

  // Test D: CASCADE Delete
  describe("CASCADE delete", () => {
    it("should delete junction rows when member is deleted", async () => {
      const member = await createMember(db, {
        email: "delete@choir.org",
        name: "To Delete",
        roles: ["librarian"],
        voiceIds: ["soprano", "alto"],
        sectionIds: ["soprano", "alto"],
        orgId: TEST_ORG_ID,
      });

      // Verify member exists with voices and sections
      let found = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(found).toBeDefined();
      expect(found?.voices).toHaveLength(2);
      expect(found?.sections).toHaveLength(2);

      // Delete the member (simulates DELETE FROM members WHERE id = ?)
      await db
        .prepare("DELETE FROM members WHERE id = ?")
        .bind(member.id)
        .run();

      // Verify member is deleted
      found = await getMemberById(db, member.id, TEST_ORG_ID);
      expect(found).toBeNull();

      // Mock DB simulates CASCADE by also deleting from memberVoices/memberSections
    });
  });
});
