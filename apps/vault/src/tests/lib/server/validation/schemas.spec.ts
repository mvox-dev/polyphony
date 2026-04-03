// Tests for Zod validation schemas
import { describe, it, expect, vi } from "vitest";
import {
  createInviteSchema,
  updateRolesSchema,
  updateSettingsSchema,
  createEventsSchema,
  updateEventSchema,
  addToProgramSchema,
  getRosterQuerySchema,
  parseBody,
} from "$lib/server/validation/schemas";

describe("createInviteSchema", () => {
  it("validates a valid invite with roster member ID", () => {
    const result = createInviteSchema.safeParse({
      rosterMemberId: "member123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rosterMemberId).toBe("member123");
    }
  });

  it("requires rosterMemberId", () => {
    const result = createInviteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty rosterMemberId", () => {
    const result = createInviteSchema.safeParse({ rosterMemberId: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateRolesSchema", () => {
  it("validates add action", () => {
    const result = updateRolesSchema.safeParse({
      role: "admin",
      action: "add",
    });
    expect(result.success).toBe(true);
  });

  it("validates remove action", () => {
    const result = updateRolesSchema.safeParse({
      role: "librarian",
      action: "remove",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = updateRolesSchema.safeParse({
      role: "superadmin",
      action: "add",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action", () => {
    const result = updateRolesSchema.safeParse({
      role: "admin",
      action: "toggle",
    });
    expect(result.success).toBe(false);
  });

  it("requires both role and action", () => {
    expect(updateRolesSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(updateRolesSchema.safeParse({ action: "add" }).success).toBe(false);
  });
});

describe("parseBody", () => {
  it("parses valid JSON and validates", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ rosterMemberId: "member123" }),
      headers: { "Content-Type": "application/json" },
    });

    const result = await parseBody(request, createInviteSchema);
    expect(result.rosterMemberId).toBe("member123");
  });

  it("throws on invalid JSON", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });

    await expect(parseBody(request, createInviteSchema)).rejects.toThrow();
  });

  it("throws on validation failure with message", async () => {
    const request = new Request("http://test", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    });

    await expect(parseBody(request, createInviteSchema)).rejects.toThrow();
  });
});

describe("updateSettingsSchema", () => {
  it("validates valid settings with all fields", () => {
    const result = updateSettingsSchema.safeParse({
      default_event_duration: 120,
      conductor_id: "member-123",
      locale: "et-EE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_event_duration).toBe(120);
      expect(result.data.conductor_id).toBe("member-123");
      expect(result.data.locale).toBe("et-EE");
    }
  });

  it("allows partial updates", () => {
    const result = updateSettingsSchema.safeParse({ locale: "en-US" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("en-US");
      expect(result.data.default_event_duration).toBeUndefined();
    }
  });

  it("allows empty object", () => {
    const result = updateSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("coerces string to number for default_event_duration", () => {
    const result = updateSettingsSchema.safeParse({
      default_event_duration: "90",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_event_duration).toBe(90);
    }
  });

  it("rejects non-positive duration", () => {
    expect(
      updateSettingsSchema.safeParse({ default_event_duration: 0 }).success,
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({ default_event_duration: -10 }).success,
    ).toBe(false);
  });

  it("rejects non-integer duration", () => {
    const result = updateSettingsSchema.safeParse({
      default_event_duration: 90.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("createEventsSchema", () => {
  const validEvent = {
    title: "Rehearsal",
    description: "Weekly practice",
    location: "Church Hall",
    starts_at: "2024-03-15T18:00:00Z",
    ends_at: "2024-03-15T20:00:00Z",
    event_type: "rehearsal" as const,
  };

  it("validates array of valid events", () => {
    const result = createEventsSchema.safeParse({ events: [validEvent] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0].title).toBe("Rehearsal");
    }
  });

  it("validates multiple events (batch)", () => {
    const result = createEventsSchema.safeParse({
      events: [
        validEvent,
        {
          ...validEvent,
          title: "Second Rehearsal",
          starts_at: "2024-03-22T18:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(2);
    }
  });

  it("requires at least one event", () => {
    const result = createEventsSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it("requires title", () => {
    const result = createEventsSchema.safeParse({
      events: [{ ...validEvent, title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires valid datetime format for starts_at", () => {
    const result = createEventsSchema.safeParse({
      events: [{ ...validEvent, starts_at: "invalid-date" }],
    });
    expect(result.success).toBe(false);
  });

  it("allows optional description, location, ends_at", () => {
    const result = createEventsSchema.safeParse({
      events: [
        {
          title: "Minimal Event",
          starts_at: "2024-03-15T18:00:00Z",
          event_type: "concert",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates event_type enum", () => {
    expect(
      createEventsSchema.safeParse({
        events: [{ ...validEvent, event_type: "rehearsal" }],
      }).success,
    ).toBe(true);
    expect(
      createEventsSchema.safeParse({
        events: [{ ...validEvent, event_type: "concert" }],
      }).success,
    ).toBe(true);
    expect(
      createEventsSchema.safeParse({
        events: [{ ...validEvent, event_type: "retreat" }],
      }).success,
    ).toBe(true);
    expect(
      createEventsSchema.safeParse({
        events: [{ ...validEvent, event_type: "party" }],
      }).success,
    ).toBe(false);
  });
});

describe("updateEventSchema", () => {
  it("validates partial update with title only", () => {
    const result = updateEventSchema.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("New Title");
    }
  });

  it("allows all fields to be updated", () => {
    const result = updateEventSchema.safeParse({
      title: "Updated Rehearsal",
      description: "Updated description",
      location: "New Location",
      starts_at: "2024-03-20T19:00:00Z",
      ends_at: "2024-03-20T21:00:00Z",
      event_type: "concert",
    });
    expect(result.success).toBe(true);
  });

  it("allows empty object for no-op update", () => {
    const result = updateEventSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = updateEventSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("validates datetime format for starts_at and ends_at", () => {
    expect(updateEventSchema.safeParse({ starts_at: "bad-date" }).success).toBe(
      false,
    );
    expect(updateEventSchema.safeParse({ ends_at: "bad-date" }).success).toBe(
      false,
    );
    expect(
      updateEventSchema.safeParse({ starts_at: "2024-03-20T19:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("validates event_type enum", () => {
    expect(
      updateEventSchema.safeParse({ event_type: "rehearsal" }).success,
    ).toBe(true);
    expect(updateEventSchema.safeParse({ event_type: "invalid" }).success).toBe(
      false,
    );
  });
});

describe("addToProgramSchema", () => {
  it("validates valid program entry", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "edition-123",
      position: 1,
      notes: "Opening piece",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.edition_id).toBe("edition-123");
      expect(result.data.position).toBe(1);
      expect(result.data.notes).toBe("Opening piece");
    }
  });

  it("allows position 0", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "edition-123",
      position: 0,
    });
    expect(result.success).toBe(true);
  });

  it("requires edition_id", () => {
    const result = addToProgramSchema.safeParse({ position: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects empty edition_id", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "",
      position: 1,
    });
    expect(result.success).toBe(false);
  });

  it("requires position", () => {
    const result = addToProgramSchema.safeParse({ edition_id: "edition-123" });
    expect(result.success).toBe(false);
  });

  it("rejects negative position", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "edition-123",
      position: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer position", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "edition-123",
      position: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("allows optional notes", () => {
    const result = addToProgramSchema.safeParse({
      edition_id: "edition-123",
      position: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeUndefined();
    }
  });
});

describe("getRosterQuerySchema", () => {
  it("validates valid date range", () => {
    const result = getRosterQuerySchema.safeParse({
      start: "2024-03-01T00:00:00Z",
      end: "2024-03-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.start).toBe("2024-03-01T00:00:00Z");
      expect(result.data.end).toBe("2024-03-31T23:59:59Z");
    }
  });

  it("accepts optional sectionId", () => {
    const result = getRosterQuerySchema.safeParse({
      start: "2024-03-01T00:00:00Z",
      end: "2024-03-31T23:59:59Z",
      sectionId: "section-soprano",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sectionId).toBe("section-soprano");
    }
  });

  it("requires start", () => {
    const result = getRosterQuerySchema.safeParse({
      end: "2024-03-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("requires end", () => {
    const result = getRosterQuerySchema.safeParse({
      start: "2024-03-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime format for start", () => {
    const result = getRosterQuerySchema.safeParse({
      start: "March 1, 2024",
      end: "2024-03-31T23:59:59Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime format for end", () => {
    const result = getRosterQuerySchema.safeParse({
      start: "2024-03-01T00:00:00Z",
      end: "March 31, 2024",
    });
    expect(result.success).toBe(false);
  });
});
