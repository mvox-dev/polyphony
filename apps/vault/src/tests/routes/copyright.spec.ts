// TDD: Tests for POST /copyright endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../routes/copyright/+server";

// Mock the takedowns module
vi.mock("$lib/server/db/takedowns", () => ({
  createTakedownRequest: vi.fn(),
}));

import { createTakedownRequest } from "$lib/server/db/takedowns";

interface TakedownResponse {
  id?: string;
  message?: string;
  error?: string;
}

const TEST_ORG = { id: "org_crede_001", name: "Crede", subdomain: "crede" };

function createMockRequest(body: unknown): Request {
  return new Request("http://localhost/copyright", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createMockDb() {
  return {} as D1Database;
}

describe("POST /copyright", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 201 with takedown ID on valid request", async () => {
    const mockRequest = {
      edition_id: "edition-123",
      claimant_name: "John Doe",
      claimant_email: "john@example.com",
      reason: "This is my copyrighted work",
      attestation: true,
    };

    vi.mocked(createTakedownRequest).mockResolvedValue({
      id: "takedown-abc",
      edition_id: "edition-123",
      org_id: "org_crede_001",
      claimant_name: "John Doe",
      claimant_email: "john@example.com",
      reason: "This is my copyrighted work",
      attestation: true,
      status: "pending",
      created_at: new Date().toISOString(),
      processed_at: null,
      processed_by: null,
      resolution_notes: null,
    });

    const response = await POST({
      request: createMockRequest(mockRequest),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(201);
    const data = (await response.json()) as TakedownResponse;
    expect(data.id).toBe("takedown-abc");
    expect(data.message).toContain("received");
  });

  it("should return 400 when edition_id is missing", async () => {
    const response = await POST({
      request: createMockRequest({
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Copyright claim",
        attestation: true,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const data = (await response.json()) as TakedownResponse;
    expect(data.error).toContain("edition_id");
  });

  it("should return 400 when attestation is false", async () => {
    const response = await POST({
      request: createMockRequest({
        edition_id: "edition-123",
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Copyright claim",
        attestation: false,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const data = (await response.json()) as TakedownResponse;
    expect(data.error).toContain("attestation");
  });

  it("should return 400 when email is invalid", async () => {
    const response = await POST({
      request: createMockRequest({
        edition_id: "edition-123",
        claimant_name: "John Doe",
        claimant_email: "not-an-email",
        reason: "Copyright claim",
        attestation: true,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const data = (await response.json()) as TakedownResponse;
    expect(data.error).toContain("email");
  });

  it("should return 500 when takedown creation fails", async () => {
    vi.mocked(createTakedownRequest).mockRejectedValue(
      new Error("Edition not found"),
    );

    const response = await POST({
      request: createMockRequest({
        edition_id: "nonexistent-edition",
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Copyright claim",
        attestation: true,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
  });

  it("should return 500 on database error", async () => {
    vi.mocked(createTakedownRequest).mockRejectedValue(new Error("DB error"));

    const response = await POST({
      request: createMockRequest({
        edition_id: "edition-123",
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Copyright claim",
        attestation: true,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: TEST_ORG },
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
  });

  it("should return 500 when org context is missing", async () => {
    const response = await POST({
      request: createMockRequest({
        edition_id: "edition-123",
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Copyright claim",
        attestation: true,
      }),
      platform: { env: { DB: createMockDb() } },
      locals: { org: null },
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
    const data = (await response.json()) as TakedownResponse;
    expect(data.error).toContain("Organization");
  });
});
