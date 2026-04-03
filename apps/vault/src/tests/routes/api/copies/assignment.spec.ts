// API tests for copy assignment endpoints
// Issue #116 - Copy Assignment/Return workflow
// Tests: /api/copies/[id]/assign, /api/copies/[id]/return

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";

// Mock modules
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

vi.mock("$lib/server/db/physical-copies", () => ({
  getPhysicalCopyById: vi.fn(),
}));

vi.mock("$lib/server/db/members", () => ({
  getMemberById: vi.fn(),
}));

vi.mock("$lib/server/db/copy-assignments", () => ({
  assignCopy: vi.fn(),
  returnCopy: vi.fn(),
  getActiveAssignments: vi.fn(),
  isAssigned: vi.fn(),
  getAssignmentById: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getPhysicalCopyById } from "$lib/server/db/physical-copies";
import { getMemberById } from "$lib/server/db/members";
import {
  assignCopy,
  returnCopy,
  getActiveAssignments,
  isAssigned,
  getAssignmentById,
} from "$lib/server/db/copy-assignments";
import { POST as assignEndpoint } from "$lib/../routes/api/copies/[id]/assign/+server";
import { POST as returnEndpoint } from "$lib/../routes/api/copies/[id]/return/+server";

const mockGetAuthenticatedMember = vi.mocked(getAuthenticatedMember);
const mockAssertLibrarian = vi.mocked(assertLibrarian);
const mockGetPhysicalCopyById = vi.mocked(getPhysicalCopyById);
const mockGetMemberById = vi.mocked(getMemberById);
const mockAssignCopy = vi.mocked(assignCopy);
const mockReturnCopy = vi.mocked(returnCopy);
const mockIsAssigned = vi.mocked(isAssigned);
const mockGetAssignmentById = vi.mocked(getAssignmentById);

// Type definitions for JSON responses
interface CopyAssignment {
  id: string;
  copyId: string;
  memberId: string;
  assignedAt: string;
  assignedBy: string | null;
  returnedAt: string | null;
  notes: string | null;
}

interface ErrorResponse {
  error: string;
}

const mockMember = {
  id: "admin-1",
  name: "Admin User",
  nickname: null,
  email_id: "admin@example.com",
  email_contact: null,
  roles: ["admin", "librarian"] as (
    | "owner"
    | "admin"
    | "librarian"
    | "conductor"
    | "section_leader"
  )[],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2026-01-01T00:00:00.000Z",
};

const mockCopy = {
  id: "copy-1",
  editionId: "edition-1",
  copyNumber: "01",
  condition: "good" as const,
  acquiredAt: null,
  notes: null,
  createdAt: "2026-01-29T00:00:00.000Z",
};

const mockAssignment = {
  id: "assign-1",
  copyId: "copy-1",
  memberId: "member-1",
  assignedAt: "2026-01-29T12:00:00.000Z",
  assignedBy: "admin-1",
  returnedAt: null,
  notes: null,
};

const mockTargetMember = {
  id: "member-1",
  name: "Choir Member",
  nickname: null,
  email_id: "member@example.com",
  email_contact: null,
  roles: [] as (
    | "owner"
    | "admin"
    | "librarian"
    | "conductor"
    | "section_leader"
  )[],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2026-01-01T00:00:00.000Z",
};

function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  const mockDb = {};
  return {
    params: {},
    url: new URL("http://localhost/api/copies/copy-1/assign"),
    request: new Request("http://localhost/api/copies/copy-1/assign", {
      method: "POST",
    }),
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    platform: { env: { DB: mockDb } },
    locals: { org: { id: createOrgId("test-org") } } as any,
    ...overrides,
  } as unknown as RequestEvent;
}

describe("Copy Assignment API - /api/copies/[id]/assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
  });

  it("assigns copy to member", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetMemberById.mockResolvedValue(mockTargetMember);
    mockIsAssigned.mockResolvedValue(false);
    mockAssignCopy.mockResolvedValue(mockAssignment);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1" }),
      }),
    });

    const response = await assignEndpoint(event);
    const data = (await response.json()) as CopyAssignment;

    expect(response.status).toBe(201);
    expect(data.copyId).toBe("copy-1");
    expect(data.memberId).toBe("member-1");
  });

  it("returns 404 when copy not found", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(null);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/copies/nonexistent/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1" }),
      }),
    });

    await expect(assignEndpoint(event)).rejects.toThrow();
  });

  it("returns 404 when member not found", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetMemberById.mockResolvedValue(null);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "nonexistent" }),
      }),
    });

    await expect(assignEndpoint(event)).rejects.toThrow();
  });

  it("returns 409 when copy already assigned", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetMemberById.mockResolvedValue(mockTargetMember);
    mockIsAssigned.mockResolvedValue(true);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1" }),
      }),
    });

    const response = await assignEndpoint(event);
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(data.error).toContain("already assigned");
  });

  it("requires memberId in request body", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    });

    const response = await assignEndpoint(event);
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(data.error).toContain("memberId");
  });

  it("allows optional notes", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetMemberById.mockResolvedValue(mockTargetMember);
    mockIsAssigned.mockResolvedValue(false);
    mockAssignCopy.mockResolvedValue({
      ...mockAssignment,
      notes: "Concert copies",
    });

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1", notes: "Concert copies" }),
      }),
    });

    const response = await assignEndpoint(event);
    const data = (await response.json()) as CopyAssignment;

    expect(response.status).toBe(201);
    expect(data.notes).toBe("Concert copies");
  });

  it("requires librarian role", async () => {
    mockAssertLibrarian.mockImplementation(() => {
      throw new Error("Forbidden");
    });

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: "member-1" }),
      }),
    });

    await expect(assignEndpoint(event)).rejects.toThrow();
  });
});

describe("Copy Return API - /api/copies/[id]/return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
  });

  it("returns copy (marks as returned)", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetAssignmentById.mockResolvedValue(mockAssignment);
    mockReturnCopy.mockResolvedValue({
      ...mockAssignment,
      returnedAt: "2026-01-30T12:00:00.000Z",
    });

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "assign-1" }),
      }),
    });

    const response = await returnEndpoint(event);
    const data = (await response.json()) as CopyAssignment;

    expect(response.status).toBe(200);
    expect(data.returnedAt).not.toBeNull();
  });

  it("returns 404 when copy not found", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(null);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/copies/nonexistent/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "assign-1" }),
      }),
    });

    await expect(returnEndpoint(event)).rejects.toThrow();
  });

  it("returns 404 when assignment not found", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetAssignmentById.mockResolvedValue(null);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "nonexistent" }),
      }),
    });

    await expect(returnEndpoint(event)).rejects.toThrow();
  });

  it("returns 400 when assignment belongs to different copy", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
    mockGetAssignmentById.mockResolvedValue({
      ...mockAssignment,
      copyId: "copy-99",
    });

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "assign-1" }),
      }),
    });

    const response = await returnEndpoint(event);
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(data.error).toContain("does not belong");
  });

  it("requires assignmentId in request body", async () => {
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    });

    const response = await returnEndpoint(event);
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(data.error).toContain("assignmentId");
  });

  it("requires librarian role", async () => {
    mockAssertLibrarian.mockImplementation(() => {
      throw new Error("Forbidden");
    });

    const event = createMockEvent({
      params: { id: "copy-1" },
      request: new Request("http://localhost/api/copies/copy-1/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: "assign-1" }),
      }),
    });

    await expect(returnEndpoint(event)).rejects.toThrow();
  });
});
