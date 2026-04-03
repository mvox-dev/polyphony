// Tests for POST /api/participation - Attendance Permissions
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

describe("POST /api/participation - attendance permissions", () => {
  it("should deny recording attendance for future events", async () => {
    const db = createMockDb({
      members: [conductorMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      actualStatus: "present",
    });
    await expect(POST(event)).rejects.toThrow(
      "Cannot record attendance for future events",
    );
  });

  it("should deny regular user from recording attendance", async () => {
    const db = createMockDb({ members: [regularMember], events: [pastEvent] });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      actualStatus: "present",
    });
    await expect(POST(event)).rejects.toThrow(
      "Only conductors/section leaders",
    );
  });

  it("should allow conductor to record attendance for past event", async () => {
    const db = createMockDb({
      members: [conductorMember, regularMember],
      events: [pastEvent],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      actualStatus: "present",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("should allow section leader to record attendance", async () => {
    const db = createMockDb({
      members: [sectionLeader, regularMember],
      events: [pastEvent],
    });
    const event = createRequestEvent(db, sectionLeader.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      actualStatus: "absent",
    });
    const response = await POST(event);
    expect(response.status).toBe(200);
  });
});
