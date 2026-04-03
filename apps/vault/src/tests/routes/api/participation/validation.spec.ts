// Tests for POST /api/participation - Validation
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

describe("POST /api/participation - validation", () => {
  it("should return 400 if eventId is missing", async () => {
    const db = createMockDb({
      members: [regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, regularMember.id, {
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    await expect(POST(event)).rejects.toThrow(
      "eventId and memberId are required",
    );
  });

  it("should return 400 if memberId is missing", async () => {
    const db = createMockDb({
      members: [regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: futureEvent.id,
      plannedStatus: "yes",
    });
    await expect(POST(event)).rejects.toThrow(
      "eventId and memberId are required",
    );
  });

  it("should return 404 if event not found", async () => {
    const db = createMockDb({ members: [regularMember], events: [] });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: "non-existent",
      memberId: regularMember.id,
      plannedStatus: "yes",
    });
    await expect(POST(event)).rejects.toThrow("Event not found");
  });

  it("should return 400 for invalid planned status", async () => {
    const db = createMockDb({
      members: [regularMember],
      events: [futureEvent],
    });
    const event = createRequestEvent(db, regularMember.id, {
      eventId: futureEvent.id,
      memberId: regularMember.id,
      plannedStatus: "invalid",
    });
    await expect(POST(event)).rejects.toThrow("Invalid planned status");
  });

  it("should return 400 for invalid actual status", async () => {
    const db = createMockDb({
      members: [conductorMember],
      events: [pastEvent],
    });
    const event = createRequestEvent(db, conductorMember.id, {
      eventId: pastEvent.id,
      memberId: regularMember.id,
      actualStatus: "invalid",
    });
    await expect(POST(event)).rejects.toThrow("Invalid actual status");
  });
});
