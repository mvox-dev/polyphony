// Tests for POST /api/participation - RSVP Override Permissions
import { describe, it, expect, vi } from "vitest";
import { POST } from "$lib/../routes/api/participation/+server";
import {
  createMockDb,
  createRequestEvent,
  regularMember,
  conductorMember,
  sectionLeader,
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

describe("RSVP override (conductor/section_leader)", () => {
  it("should allow conductor to update another member's future RSVP", async () => {
    const db = createMockDb({
      members: [conductorMember, regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("should allow conductor to update another member's past RSVP", async () => {
    const db = createMockDb({
      members: [conductorMember, regularMember],
      events: [pastEvent],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("should allow section leader to update another member's RSVP", async () => {
    const db = createMockDb({
      members: [sectionLeader, regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, sectionLeader.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      plannedStatus: "maybe",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });
});
