// Shared mocks for participation API tests
import { vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";

// Test data
export const futureDate = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1000,
).toISOString();
export const pastDate = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1000,
).toISOString();

export interface MockMember {
  id: string;
  email_id: string;
  name: string;
  roles: string[];
}

export interface MockEvent {
  id: string;
  title: string;
  starts_at: string;
}

export interface MockParticipation {
  id: string;
  member_id: string;
  event_id: string;
  planned_status: string | null;
  actual_status: string | null;
  recorded_by: string | null;
}

export interface MockDbOptions {
  members: MockMember[];
  events: MockEvent[];
  participation?: MockParticipation[];
}

// Handler for member lookups
function handleMemberLookup(members: MockMember[], memberId: string) {
  const member = members.find((m) => m.id === memberId);
  if (!member) return null;
  return {
    id: member.id,
    name: member.name,
    nickname: null,
    email_id: member.email_id,
    email_contact: null,
    invited_by: null,
    joined_at: new Date().toISOString(),
  };
}

// Handler for participation lookups
function handleParticipationLookup(
  records: Map<string, MockParticipation>,
  memberId: string,
  eventId: string,
) {
  const record = records.get(`${memberId}:${eventId}`);
  if (!record) return null;
  return {
    id: record.id,
    member_id: record.member_id,
    event_id: record.event_id,
    planned_status: record.planned_status,
    planned_at: null,
    planned_notes: null,
    actual_status: record.actual_status,
    recorded_at: null,
    recorded_by: record.recorded_by,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Create first() handler
function createFirstHandler(
  query: string,
  params: unknown[],
  options: MockDbOptions,
  records: Map<string, MockParticipation>,
) {
  if (
    query.includes("FROM members") &&
    query.includes("member_organizations") &&
    query.includes("WHERE m.id")
  ) {
    return handleMemberLookup(options.members, params[0] as string);
  }
  if (query.includes("FROM events WHERE id")) {
    return options.events.find((e) => e.id === params[0]) || null;
  }
  if (query.includes("FROM participation") && query.includes("member_id")) {
    return handleParticipationLookup(
      records,
      params[0] as string,
      params[1] as string,
    );
  }
  return null;
}

// Create all() handler
function createAllHandler(
  query: string,
  params: unknown[],
  options: MockDbOptions,
) {
  if (query.includes("FROM member_roles")) {
    const member = options.members.find((m) => m.id === params[0]);
    return { results: member ? member.roles.map((role) => ({ role })) : [] };
  }
  if (
    query.includes("FROM member_voices") ||
    query.includes("FROM member_sections")
  ) {
    return { results: [] };
  }
  return { results: [] };
}

// Create run() handler
function createRunHandler(
  query: string,
  params: unknown[],
  records: Map<string, MockParticipation>,
) {
  if (query.includes("INSERT INTO participation")) {
    const [id, memberId, eventId, plannedStatus] = params as string[];
    records.set(`${memberId}:${eventId}`, {
      id,
      member_id: memberId,
      event_id: eventId,
      planned_status: plannedStatus ?? null,
      actual_status: null,
      recorded_by: null,
    });
    return { success: true, meta: { changes: 1 } };
  }
  if (query.includes("UPDATE participation")) {
    return { success: true, meta: { changes: 1 } };
  }
  return { success: true, meta: { changes: 0 } };
}

// Mock database factory
export function createMockDb(options: MockDbOptions) {
  const records = new Map<string, MockParticipation>();
  (options.participation ?? []).forEach((p) =>
    records.set(`${p.member_id}:${p.event_id}`, p),
  );

  return {
    prepare: (query: string) => {
      let params: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          params = args;
          return statement;
        },
        first: async () => createFirstHandler(query, params, options, records),
        all: async () => createAllHandler(query, params, options),
        run: async () => createRunHandler(query, params, records),
      };
      return statement as any;
    },
  };
}

// Helper to create mock request event
export function createRequestEvent(
  db: any,
  memberId: string | null,
  body: Record<string, unknown>,
): RequestEvent {
  return {
    platform: { env: { DB: db } },
    cookies: {
      get: (name: string) => (name === "member_id" ? memberId : undefined),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
      getAll: vi.fn(),
    },
    request: {
      json: async () => body,
    },
    locals: { org: { id: createOrgId("test-org") } } as any,
  } as unknown as RequestEvent;
}

// Common test fixtures
export const regularMember: MockMember = {
  id: "member-1",
  email_id: "member@example.com",
  name: "Regular Member",
  roles: [],
};

export const conductorMember: MockMember = {
  id: "conductor-1",
  email_id: "conductor@example.com",
  name: "Conductor",
  roles: ["conductor"],
};

export const sectionLeader: MockMember = {
  id: "section-leader-1",
  email_id: "leader@example.com",
  name: "Section Leader",
  roles: ["section_leader"],
};

export const futureEvent: MockEvent = {
  id: "event-future",
  title: "Future Rehearsal",
  starts_at: futureDate,
};

export const pastEvent: MockEvent = {
  id: "event-past",
  title: "Past Rehearsal",
  starts_at: pastDate,
};
