/**
 * Integration tests for multi-org data isolation (#232)
 *
 * These tests prove the multi-org architecture correctly isolates data so that
 * Org A cannot read, mutate, or delete resources belonging to Org B.
 *
 * RED PHASE: Tests document the required isolation contracts. Several will fail
 * until #233 (DB refactor to require orgId on all by-ID operations) lands.
 *
 * TypeScript note: Functions called with an orgId argument that doesn't exist
 * yet in their signature will produce TS2554 errors. This is intentional — the
 * type errors document the exact signature changes required by #233. Vitest
 * strips types at runtime so the tests still execute and expose the runtime
 * isolation failures.
 *
 * Currently failing (7):
 *   Works: getWorkById, updateWork, deleteWork — no orgId param yet
 *   Events: getEventById, updateEvent, deleteEvent — no orgId param yet
 *   Cross-org: getWorkById/getEventById cross-org access
 *
 * Currently passing (12):
 *   Works:   getAllWorks (already org-scoped), positive path tests
 *   Events:  positive path tests
 *   Members: getAllMembers, getMemberById (already org-scoped via JOIN)
 *
 * Coverage:
 * - Works: getAllWorks, getWorkById, updateWork, deleteWork
 * - Events: getEventById, updateEvent, deleteEvent
 * - Members: getAllMembers, getMemberById
 */

/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId, type OrgId } from "@polyphony/shared";
import {
  createWork,
  getWorkById,
  getAllWorks,
  updateWork,
  deleteWork,
} from "../../../../lib/server/db/works.js";
import {
  createEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from "../../../../lib/server/db/events.js";
import {
  getAllMembers,
  getMemberById,
  createMember,
} from "../../../../lib/server/db/members.js";

const ORG_A = createOrgId("org_aaaaaaaaa");
const ORG_B = createOrgId("org_bbbbbbbbb");

// ─── Mock D1 ─────────────────────────────────────────────────────────────────

function createMockDb() {
  const works = new Map<
    string,
    {
      id: string;
      org_id: string;
      title: string;
      composer: string | null;
      lyricist: string | null;
      created_at: string;
    }
  >();
  const events = new Map<
    string,
    {
      id: string;
      org_id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      event_type: string;
      created_by: string;
      created_at: string;
    }
  >();
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
  const memberOrgs = new Map<string, string>(); // member_id → org_id
  const memberRoles = new Map<string, string[]>(); // member_id → roles[]

  return {
    _works: works,
    _events: events,
    _members: members,
    _memberOrgs: memberOrgs,
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          // INSERT INTO works
          if (sql.includes("INSERT INTO works")) {
            const [id, org_id, title, composer, lyricist, created_at] =
              params as [
                string,
                string,
                string,
                string | null,
                string | null,
                string,
              ];
            works.set(id, {
              id,
              org_id,
              title,
              composer,
              lyricist,
              created_at,
            });
            return { success: true, meta: { changes: 1 } };
          }
          // UPDATE works
          if (sql.startsWith("UPDATE works SET")) {
            // params layout: [title, composer, lyricist, id, orgId]  (from buildUpdateSet + id + orgId appended)
            const orgId = params[params.length - 1] as string;
            const id = params[params.length - 2] as string;
            const work = works.get(id);
            if (!work || work.org_id !== orgId)
              return { success: false, meta: { changes: 0 } };
            // Apply partial updates (title, composer, lyricist in order)
            const sets = sql.match(/SET (.+) WHERE/)?.[1]?.split(", ") ?? [];
            let pi = 0;
            for (const set of sets) {
              if (set.includes("title")) work.title = params[pi++] as string;
              else if (set.includes("composer"))
                work.composer = params[pi++] as string | null;
              else if (set.includes("lyricist"))
                work.lyricist = params[pi++] as string | null;
            }
            works.set(id, work);
            return { success: true, meta: { changes: 1 } };
          }
          // DELETE FROM works
          if (sql.includes("DELETE FROM works")) {
            const id = params[0] as string;
            const orgId = params[1] as string | undefined;
            const work = works.get(id);
            const existed = work && (!orgId || work.org_id === orgId);
            if (existed) works.delete(id);
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }
          // INSERT INTO events
          if (sql.includes("INSERT INTO events")) {
            const [
              id,
              org_id,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              created_by,
            ] = params as [
              string,
              string,
              string,
              string | null,
              string | null,
              string,
              string | null,
              string,
              string,
            ];
            const created_at = new Date().toISOString();
            events.set(id, {
              id,
              org_id,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              created_by,
              created_at,
            });
            return { success: true, meta: { changes: 1 } };
          }
          // UPDATE events
          if (sql.startsWith("UPDATE events SET")) {
            // params layout: [title, description, location, starts_at, ends_at, event_type, id, orgId]
            const orgId = params[params.length - 1] as string;
            const id = params[params.length - 2] as string;
            const event = events.get(id);
            if (!event || event.org_id !== orgId)
              return { success: false, meta: { changes: 0 } };
            const [
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
            ] = params as [
              string,
              string | null,
              string | null,
              string,
              string | null,
              string,
              string,
            ];
            events.set(id, {
              ...event,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
            });
            return { success: true, meta: { changes: 1 } };
          }
          // DELETE FROM events
          if (sql.includes("DELETE FROM events")) {
            const id = params[0] as string;
            const orgId = params[1] as string | undefined;
            const event = events.get(id);
            const existed = event && (!orgId || event.org_id === orgId);
            if (existed) events.delete(id);
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }
          // INSERT INTO members
          if (sql.includes("INSERT INTO members")) {
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
            return { success: true, meta: { changes: 1 } };
          }
          // INSERT INTO member_organizations
          if (sql.includes("INSERT INTO member_organizations")) {
            const [member_id, org_id] = params as [string, string];
            memberOrgs.set(member_id, org_id);
            return { success: true, meta: { changes: 1 } };
          }
          // INSERT INTO member_roles
          if (sql.includes("INSERT INTO member_roles")) {
            const [member_id, _org_id, role] = params as [
              string,
              string,
              string,
            ];
            const roles = memberRoles.get(member_id) ?? [];
            roles.push(role);
            memberRoles.set(member_id, roles);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        first: async () => {
          // SELECT FROM works WHERE id = ? AND org_id = ?
          if (sql.includes("FROM works") && sql.includes("WHERE id =")) {
            const id = params[0] as string;
            const org_id = params[1] as string | undefined;
            const work = works.get(id) ?? null;
            // If orgId provided, check org isolation
            if (work && org_id && work.org_id !== org_id) return null;
            return work;
          }
          // SELECT FROM events WHERE id = ? AND org_id = ?
          if (sql.includes("FROM events") && sql.includes("WHERE id =")) {
            const id = params[0] as string;
            const org_id = params[1] as string | undefined;
            const event = events.get(id) ?? null;
            // If orgId provided, check org isolation
            if (event && org_id && event.org_id !== org_id) return null;
            return event;
          }
          // SELECT member by id + org (getMemberById uses JOIN member_organizations)
          if (
            sql.includes("FROM members") &&
            sql.includes("member_organizations") &&
            sql.includes("WHERE m.id")
          ) {
            const [id, org_id] = params as [string, string];
            const member = members.get(id);
            if (!member) return null;
            // Only return if member belongs to requested org
            if (memberOrgs.get(id) !== org_id) return null;
            return member;
          }
          // SELECT member by email_id
          if (
            sql.includes("FROM members") &&
            sql.includes("WHERE email_id =")
          ) {
            const email_id = params[0] as string;
            for (const m of members.values()) {
              if (m.email_id === email_id) return m;
            }
            return null;
          }
          // SELECT member by name (LOWER)
          if (sql.includes("FROM members") && sql.includes("LOWER(name)")) {
            const name = (params[0] as string).toLowerCase();
            for (const m of members.values()) {
              if (
                m.name.toLowerCase() === name &&
                memberOrgs.get(m.id) === params[1]
              )
                return m;
            }
            return null;
          }
          // SELECT org_id FROM sections (addMemberSection validation) - not needed here
          if (sql.includes("FROM sections") && sql.includes("WHERE id =")) {
            return null; // no sections in these tests
          }
          return null;
        },
        all: async () => {
          // SELECT works WHERE org_id = ?
          if (sql.includes("FROM works") && sql.includes("WHERE org_id =")) {
            const org_id = params[0] as string;
            const results = Array.from(works.values()).filter(
              (w) => w.org_id === org_id,
            );
            return { results };
          }
          // SELECT members via member_organizations WHERE mo.org_id = ?
          if (
            sql.includes("FROM members") &&
            sql.includes("member_organizations")
          ) {
            const org_id = params[0] as string;
            const results = Array.from(members.values()).filter(
              (m) => memberOrgs.get(m.id) === org_id,
            );
            return { results };
          }
          // SELECT roles for member
          if (sql.includes("FROM member_roles")) {
            const member_id = params[0] as string;
            const roles = memberRoles.get(member_id) ?? [];
            return { results: roles.map((role) => ({ role })) };
          }
          // member voices / sections (not in scope for these tests — return empty)
          if (sql.includes("FROM voices") || sql.includes("FROM sections")) {
            return { results: [] };
          }
          return { results: [] };
        },
      }),
    }),
    batch: async (statements: any[]) => {
      for (const stmt of statements) await stmt.run();
      return [];
    },
  } as unknown as D1Database;
}

// ─── Works isolation ─────────────────────────────────────────────────────────

describe("Multi-org data isolation: Works", () => {
  let db: D1Database;
  let workAId: string;

  beforeEach(async () => {
    db = createMockDb();
    const workA = await createWork(db, {
      orgId: ORG_A,
      title: "Ave Maria",
      composer: "Schubert",
    });
    workAId = workA.id;
  });

  it("getAllWorks returns only works belonging to the requesting org", async () => {
    await createWork(db, {
      orgId: ORG_B,
      title: "Gloria",
      composer: "Vivaldi",
    });

    const orgAWorks = await getAllWorks(db, ORG_A);
    const orgBWorks = await getAllWorks(db, ORG_B);

    expect(orgAWorks).toHaveLength(1);
    expect(orgAWorks[0].title).toBe("Ave Maria");
    expect(orgBWorks).toHaveLength(1);
    expect(orgBWorks[0].title).toBe("Gloria");
  });

  it("getWorkById scoped to org — returns null for another org's work", async () => {
    // This test will FAIL until #233 adds orgId parameter to getWorkById
    const work = await getWorkById(db, workAId, ORG_B);
    expect(work).toBeNull();
  });

  it("getWorkById scoped to org — returns work for the owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to getWorkById
    const work = await getWorkById(db, workAId, ORG_A);
    expect(work).not.toBeNull();
    expect(work?.title).toBe("Ave Maria");
  });

  it("updateWork scoped to org — cannot update another org's work", async () => {
    // This test will FAIL until #233 adds orgId parameter to updateWork
    const result = await updateWork(db, workAId, { title: "Hacked" }, ORG_B);
    expect(result).toBeNull();

    // Verify original is unchanged
    const original = await getWorkById(db, workAId, ORG_A);
    expect(original?.title).toBe("Ave Maria");
  });

  it("updateWork scoped to org — allows update by owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to updateWork
    const result = await updateWork(
      db,
      workAId,
      { title: "Ave Maria (revised)" },
      ORG_A,
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Ave Maria (revised)");
  });

  it("deleteWork scoped to org — cannot delete another org's work", async () => {
    // This test will FAIL until #233 adds orgId parameter to deleteWork
    const deleted = await deleteWork(db, workAId, ORG_B);
    expect(deleted).toBe(false);

    // Verify work still exists for owning org
    const work = await getWorkById(db, workAId, ORG_A);
    expect(work).not.toBeNull();
  });

  it("deleteWork scoped to org — allows deletion by owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to deleteWork
    const deleted = await deleteWork(db, workAId, ORG_A);
    expect(deleted).toBe(true);

    const work = await getWorkById(db, workAId, ORG_A);
    expect(work).toBeNull();
  });
});

// ─── Events isolation ─────────────────────────────────────────────────────────

describe("Multi-org data isolation: Events", () => {
  let db: D1Database;
  let eventAId: string;

  beforeEach(async () => {
    db = createMockDb();
    const [eventA] = await createEvents(
      db,
      ORG_A,
      [
        {
          title: "Spring Concert",
          starts_at: "2026-04-01T19:00:00Z",
          event_type: "concert",
        },
      ],
      "member-a1",
    );
    eventAId = eventA.id;
  });

  it("getEventById scoped to org — returns null for another org's event", async () => {
    // This test will FAIL until #233 adds orgId parameter to getEventById
    const event = await getEventById(db, eventAId, ORG_B);
    expect(event).toBeNull();
  });

  it("getEventById scoped to org — returns event for the owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to getEventById
    const event = await getEventById(db, eventAId, ORG_A);
    expect(event).not.toBeNull();
    expect(event?.title).toBe("Spring Concert");
  });

  it("updateEvent scoped to org — cannot update another org's event", async () => {
    // This test will FAIL until #233 adds orgId parameter to updateEvent
    const updated = await updateEvent(
      db,
      eventAId,
      { title: "Hacked Concert" },
      ORG_B,
    );
    expect(updated).toBe(false);

    const original = await getEventById(db, eventAId, ORG_A);
    expect(original?.title).toBe("Spring Concert");
  });

  it("updateEvent scoped to org — allows update by owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to updateEvent
    const updated = await updateEvent(
      db,
      eventAId,
      { title: "Spring Gala" },
      ORG_A,
    );
    expect(updated).toBe(true);

    const event = await getEventById(db, eventAId, ORG_A);
    expect(event?.title).toBe("Spring Gala");
  });

  it("deleteEvent scoped to org — cannot delete another org's event", async () => {
    // This test will FAIL until #233 adds orgId parameter to deleteEvent
    const deleted = await deleteEvent(db, eventAId, ORG_B);
    expect(deleted).toBe(false);

    const event = await getEventById(db, eventAId, ORG_A);
    expect(event).not.toBeNull();
  });

  it("deleteEvent scoped to org — allows deletion by owning org", async () => {
    // This test will FAIL until #233 adds orgId parameter to deleteEvent
    const deleted = await deleteEvent(db, eventAId, ORG_A);
    expect(deleted).toBe(true);

    const event = await getEventById(db, eventAId, ORG_A);
    expect(event).toBeNull();
  });
});

// ─── Members isolation ────────────────────────────────────────────────────────

describe("Multi-org data isolation: Members", () => {
  let db: D1Database;
  let memberAId: string;

  beforeEach(async () => {
    db = createMockDb();
    const memberA = await createMember(db, {
      email: "alice@chora.org",
      name: "Alice",
      roles: ["admin"],
      orgId: ORG_A,
    });
    memberAId = memberA.id;
  });

  it("getAllMembers returns only members belonging to the requesting org", async () => {
    await createMember(db, {
      email: "bob@other.org",
      name: "Bob",
      roles: [],
      orgId: ORG_B,
    });

    const orgAMembers = await getAllMembers(db, ORG_A);
    const orgBMembers = await getAllMembers(db, ORG_B);

    expect(orgAMembers).toHaveLength(1);
    expect(orgAMembers[0].name).toBe("Alice");
    expect(orgBMembers).toHaveLength(1);
    expect(orgBMembers[0].name).toBe("Bob");
  });

  it("getMemberById returns null when member does not belong to the requesting org", async () => {
    // getMemberById already JOINs member_organizations — this should pass today
    const member = await getMemberById(db, memberAId, ORG_B);
    expect(member).toBeNull();
  });

  it("getMemberById returns the member for the owning org", async () => {
    const member = await getMemberById(db, memberAId, ORG_A);
    expect(member).not.toBeNull();
    expect(member?.name).toBe("Alice");
  });

  it("org A members are not visible in org B listing", async () => {
    // No members in ORG_B; listing should be empty
    const orgBMembers = await getAllMembers(db, ORG_B);
    expect(orgBMembers).toHaveLength(0);
  });
});

// ─── Cross-org resource confusion ────────────────────────────────────────────

describe("Multi-org data isolation: cross-org resource confusion", () => {
  it("IDs from org A cannot be used to access org B resources", async () => {
    const db = createMockDb();

    const workA = await createWork(db, { orgId: ORG_A, title: "Secret Work" });
    const [eventA] = await createEvents(
      db,
      ORG_A,
      [
        {
          title: "Secret Event",
          starts_at: "2026-06-01T18:00:00Z",
          event_type: "rehearsal",
        },
      ],
      "admin-a",
    );

    // Org B tries to use Org A's IDs
    // These should all return null (will FAIL until #233 lands)
    const workCrossOrg = await getWorkById(db, workA.id, ORG_B);
    const eventCrossOrg = await getEventById(db, eventA.id, ORG_B);

    expect(workCrossOrg).toBeNull();
    expect(eventCrossOrg).toBeNull();
  });

  it("two orgs can have works with the same title without interference", async () => {
    const db = createMockDb();

    await createWork(db, {
      orgId: ORG_A,
      title: "Messiah",
      composer: "Handel",
    });
    await createWork(db, {
      orgId: ORG_B,
      title: "Messiah",
      composer: "Handel",
    });

    const orgAWorks = await getAllWorks(db, ORG_A);
    const orgBWorks = await getAllWorks(db, ORG_B);

    expect(orgAWorks).toHaveLength(1);
    expect(orgBWorks).toHaveLength(1);
    // Each org sees only their own copy
    expect(orgAWorks[0].orgId).toBe(ORG_A);
    expect(orgBWorks[0].orgId).toBe(ORG_B);
  });
});
