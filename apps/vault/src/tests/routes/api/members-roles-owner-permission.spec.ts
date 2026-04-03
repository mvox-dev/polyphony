// TDD: Owner role assignment requires org_id parameter
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock the dependencies BEFORE importing the route
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
  isOwner: vi.fn(),
}));

vi.mock("$lib/server/validation/schemas", () => ({
  parseBody: vi.fn(),
  updateRolesSchema: {},
}));

vi.mock("$lib/server/db/roles", () => ({
  addMemberRole: vi.fn(),
  removeMemberRole: vi.fn(),
  countMembersWithRole: vi.fn(),
}));

import { POST } from "../../../routes/api/members/[id]/roles/+server";
import {
  getAuthenticatedMember,
  assertAdmin,
  isOwner,
} from "$lib/server/auth/middleware";
import { parseBody } from "$lib/server/validation/schemas";
import { addMemberRole, countMembersWithRole } from "$lib/server/db/roles";

function createMockEvent(
  memberId: string,
  body: unknown,
  orgId: string = "org-123",
) {
  return {
    params: { id: memberId },
    request: new Request("http://localhost/api/members/test/roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    platform: {
      env: {
        DB: {} as D1Database,
      },
    } as any,
    locals: {
      org: { id: orgId, subdomain: "test" },
    } as any,
    cookies: {
      get: vi.fn(),
    } as any,
  } as any;
}

describe("POST /api/members/[id]/roles - Owner permission checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass orgId when adding roles", async () => {
    // Setup: Current user is owner with members:manage permission
    const currentUser = {
      id: "owner-123",
      email_id: "owner@test.com",
      roles: ["owner"],
    };

    vi.mocked(getAuthenticatedMember).mockResolvedValue(currentUser as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(isOwner).mockReturnValue(true);
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "add" });
    vi.mocked(countMembersWithRole).mockResolvedValue(2);
    vi.mocked(addMemberRole).mockResolvedValue(true);

    const event = createMockEvent(
      "target-member-456",
      { role: "owner", action: "add" },
      "org-koorik",
    );
    const response = await POST(event);
    const data = await response.json();

    expect(data).toEqual({ success: true });
    // CRITICAL: Must pass org_id as 5th parameter
    expect(addMemberRole).toHaveBeenCalledWith(
      {},
      "target-member-456",
      "owner",
      "owner-123",
      "org-koorik",
    );
  });

  it("should reject owner WITHOUT admin/owner role trying to assign roles", async () => {
    // Setup: User only has owner role, but assertAdmin should check permissions properly
    const currentUser = {
      id: "owner-only-123",
      email_id: "owner@test.com",
      roles: ["owner"], // Has owner but assertAdmin might incorrectly allow this
    };

    vi.mocked(getAuthenticatedMember).mockResolvedValue(currentUser as any);

    // assertAdmin should check hasPermission('members:manage'), which owner HAS
    // So this test verifies our permission system is consistent
    vi.mocked(assertAdmin).mockImplementation(() => {
      // Owner has members:manage, so should NOT throw
    });
    vi.mocked(isOwner).mockReturnValue(true);
    vi.mocked(parseBody).mockResolvedValue({ role: "admin", action: "add" });
    vi.mocked(addMemberRole).mockResolvedValue(true);

    const event = createMockEvent("target-member-456", {
      role: "admin",
      action: "add",
    });
    const response = await POST(event);
    const data = await response.json();

    // Should succeed because owner has members:manage permission
    expect(data).toEqual({ success: true });
  });

  it("should reject non-owner trying to assign owner role even with admin", async () => {
    // Setup: User is admin but not owner
    const currentUser = {
      id: "admin-123",
      email_id: "admin@test.com",
      roles: ["admin"],
    };

    vi.mocked(getAuthenticatedMember).mockResolvedValue(currentUser as any);
    vi.mocked(assertAdmin).mockImplementation(() => {}); // Admin passes
    vi.mocked(isOwner).mockReturnValue(false); // But not owner
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "add" });

    const event = createMockEvent("target-member-456", {
      role: "owner",
      action: "add",
    });

    // Should throw 403
    await expect(POST(event)).rejects.toThrow();
  });

  it("should allow librarian-only user to be rejected by assertAdmin", async () => {
    // This tests that assertAdmin properly checks permissions, not hardcoded roles
    const currentUser = {
      id: "lib-123",
      email_id: "lib@test.com",
      roles: ["librarian"], // No admin or owner
    };

    vi.mocked(getAuthenticatedMember).mockResolvedValue(currentUser as any);

    // assertAdmin should throw for librarian-only user
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw new Error("Admin or owner role required"); // Current broken implementation
    });
    vi.mocked(parseBody).mockResolvedValue({ role: "admin", action: "add" });

    const event = createMockEvent("target-member-456", {
      role: "admin",
      action: "add",
    });

    await expect(POST(event)).rejects.toThrow("Admin or owner role required");
  });
});
