// Tests for POST /api/participation - Status Values
import { describe, it, expect, vi } from "vitest";
import { POST } from "$lib/../routes/api/participation/+server";
import {
  createMockDb,
  createRequestEvent,
  regularMember,
  conductorMember,
  futureEvent,
  pastEvent,
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

describe("POST /api/participation - clearing status", () => {
  it("should allow clearing RSVP with null", async () => {
    const db = createMockDb({
      members: [regularMember],
      events: [futureEvent],
      participation: [
        {
          id: "part-1",
          member_id: regularMember.id,
          event_id: futureEvent.id,
          planned_status: "yes",
          actual_status: null,
          recorded_by: null,
        },
      ],
    });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      plannedStatus: null,
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("should allow conductor to clear attendance with null", async () => {
    const db = createMockDb({
      members: [conductorMember, regularMember],
      events: [pastEvent],
      participation: [
        {
          id: "part-2",
          member_id: regularMember.id,
          event_id: pastEvent.id,
          planned_status: null,
          actual_status: "present",
          recorded_by: conductorMember.id,
        },
      ],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      actualStatus: null,
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });
});

describe("POST /api/participation - valid status values", () => {
  it.each(["yes", "no", "maybe", "late"] as const)(
    "accepts plannedStatus=%s",
    async (status) => {
      const db = createMockDb({
        members: [regularMember],
        events: [futureEvent],
      });
      const event = createRequestEvent(db, regularMember.id, {
        eventId: futureEvent.id,
        memberId: regularMember.id,
        plannedStatus: status,
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    },
  );

  it.each(["present", "absent", "late"] as const)(
    "accepts actualStatus=%s",
    async (status) => {
      const db = createMockDb({
        members: [conductorMember, regularMember],
        events: [pastEvent],
      });
      const event = createRequestEvent(db, conductorMember.id, {
        eventId: pastEvent.id,
        memberId: regularMember.id,
        actualStatus: status,
      });
      const response = await POST(event);
      expect(response.status).toBe(200);
    },
  );
});
