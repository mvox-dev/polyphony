// Tests for POST /api/participation - RSVP Permissions (own RSVP)
import { describe, it, expect, vi } from "vitest";
import { POST } from "$lib/../routes/api/participation/+server";
import {
  createMockDb,
  createRequestEvent,
  regularMember,
  futureEvent,
  pastEvent,
  type MockMember,
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

describe("Own RSVP", () => {
  it("should allow user to update their own future RSVP", async () => {
    const db = createMockDb({
      members: [regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("should deny updating own past RSVP", async () => {
    const db = createMockDb({ members: [regularMember], events: [pastEvent] });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    await expect(POST(event)).rejects.toThrow("Cannot update RSVP");
  });

  it("should deny updating another member's RSVP", async () => {
    const other: MockMember = {
      id: "other",
      email_id: "o@e.com",
      name: "O",
      roles: [],
    };
    const db = createMockDb({
      members: [regularMember, other],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: futureEvent.id,
      memberId: other.id,
      plannedStatus: "yes",
    });
    await expect(POST(event)).rejects.toThrow("Cannot update RSVP");
  });
});
