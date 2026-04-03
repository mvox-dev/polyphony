// Tests for Issue #240: Trust Individual Responsibility in participation API
import { describe, it, expect, vi } from "vitest";
import { POST } from "$lib/../routes/api/participation/+server";
import {
  createMockDb,
  createRequestEvent,
  regularMember,
  conductorMember,
  futureEvent,
  pastEvent,
  type MockMember,
  type MockDbOptions,
} from "./mocks";

// Mock SvelteKit error/json functions
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
    json: (data: any) =>
      new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      }),
  };
});

const adminMember: MockMember = {
  id: "admin-1",
  email_id: "admin@example.com",
  name: "Admin",
  roles: ["admin"],
};

/**
 * Create a mock DB that also handles organizations queries for trust setting
 */
function createTrustMockDb(options: MockDbOptions & { trustSetting: boolean }) {
  const baseDb = createMockDb(options);
  const originalPrepare = baseDb.prepare.bind(baseDb);

  return {
    prepare: (query: string) => {
      // Intercept organizations queries
      if (query.includes("FROM organizations WHERE id")) {
        let params: unknown[] = [];
        const statement = {
          bind: (...args: unknown[]) => {
            params = args;
            return statement;
          },
          first: async () => ({
            id: "test-org",
            name: "Test Org",
            subdomain: "test",
            type: "collective",
            contact_email: "org@test.com",
            created_at: new Date().toISOString(),
            language: null,
            locale: null,
            timezone: null,
            trust_individual_responsibility: options.trustSetting ? 1 : 0,
          }),
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: { changes: 0 } }),
        };
        return statement as any;
      }
      return originalPrepare(query);
    },
  };
}

describe("POST /api/participation - Trust Individual Responsibility (Issue #240)", () => {
  describe("when trust setting is ENABLED", () => {
    it("should allow regular member to update own RSVP for past event", async () => {
      const db = createTrustMockDb({
        members: [regularMember],
        events: [pastEvent],
        trustSetting: true,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        plannedStatus: "yes",
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    });

    it("should allow regular member to update own attendance for past event", async () => {
      const db = createTrustMockDb({
        members: [regularMember],
        events: [pastEvent],
        trustSetting: true,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        actualStatus: "present",
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    });

    it("should deny regular member from updating another member attendance", async () => {
      const other: MockMember = {
        id: "other",
        email_id: "o@e.com",
        name: "O",
        roles: [],
      };
      const db = createTrustMockDb({
        members: [regularMember, other],
        events: [pastEvent],
        trustSetting: true,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: other.id,
        actualStatus: "present",
      });
      await expect(POST(event)).rejects.toThrow(
        "Only conductors/section leaders",
      );
    });

    it("should deny regular member from updating another member RSVP for past event", async () => {
      const other: MockMember = {
        id: "other",
        email_id: "o@e.com",
        name: "O",
        roles: [],
      };
      const db = createTrustMockDb({
        members: [regularMember, other],
        events: [pastEvent],
        trustSetting: true,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: other.id,
        plannedStatus: "yes",
      });
      await expect(POST(event)).rejects.toThrow("Cannot update RSVP");
    });

    it("should allow conductor to edit any member records with trust enabled", async () => {
      const db = createTrustMockDb({
        members: [conductorMember, regularMember],
        events: [pastEvent],
        trustSetting: true,
      });
      const event = createRequestEvent(db, conductorMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        actualStatus: "present",
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    });
  });

  describe("when trust setting is DISABLED (default)", () => {
    it("should deny regular member updating own RSVP for past event", async () => {
      const db = createTrustMockDb({
        members: [regularMember],
        events: [pastEvent],
        trustSetting: false,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        plannedStatus: "yes",
      });
      await expect(POST(event)).rejects.toThrow("Cannot update RSVP");
    });

    it("should deny regular member updating own attendance", async () => {
      const db = createTrustMockDb({
        members: [regularMember],
        events: [pastEvent],
        trustSetting: false,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        actualStatus: "present",
      });
      await expect(POST(event)).rejects.toThrow(
        "Only conductors/section leaders",
      );
    });

    it("should still allow regular member own future RSVP", async () => {
      const db = createTrustMockDb({
        members: [regularMember],
        events: [futureEvent],
        trustSetting: false,
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: futureEvent.id,
        memberId: regularMember.id,
        plannedStatus: "yes",
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    });
  });
});
