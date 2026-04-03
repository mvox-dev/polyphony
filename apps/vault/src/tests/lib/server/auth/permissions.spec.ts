// TDD: Permission system tests (RED phase)
import { describe, it, expect } from "vitest";
import {
  requireRole,
  hasPermission,
  hasRole,
  canUploadScores,
  canDeleteScores,
  canInviteMembers,
  canManageRoles,
  type Member,
} from "$lib/server/auth/permissions";

describe("Permission System", () => {
  describe("hasPermission", () => {
    it("owner has only governance permissions (not operational)", () => {
      const owner: Member = {
        id: "1",
        email_id: "owner@test.com",
        roles: ["owner"],
      };
      // Owner should NOT have operational permissions (must assign roles for those)
      expect(hasPermission(owner, "scores:upload")).toBe(false);
      expect(hasPermission(owner, "scores:delete")).toBe(false);
      expect(hasPermission(owner, "events:create")).toBe(false);
      expect(hasPermission(owner, "events:manage")).toBe(false);
      // Owner SHOULD have governance permissions
      expect(hasPermission(owner, "scores:view")).toBe(true); // implicit for all members
      expect(hasPermission(owner, "members:invite")).toBe(true);
      expect(hasPermission(owner, "members:manage")).toBe(true);
      expect(hasPermission(owner, "vault:delete")).toBe(true);
      expect(hasPermission(owner, "federation:manage")).toBe(true);
    });

    it("admin has score and member management permissions", () => {
      const admin: Member = {
        id: "2",
        email_id: "admin@test.com",
        roles: ["admin"],
      };
      expect(hasPermission(admin, "scores:upload")).toBe(false); // Only librarian can upload
      expect(hasPermission(admin, "scores:delete")).toBe(false); // Only librarian can delete
      expect(hasPermission(admin, "scores:view")).toBe(true);
      expect(hasPermission(admin, "members:invite")).toBe(true);
      expect(hasPermission(admin, "members:manage")).toBe(true);
      expect(hasPermission(admin, "vault:delete")).toBe(false);
    });

    it("librarian has score management but not member management", () => {
      const librarian: Member = {
        id: "3",
        email_id: "librarian@test.com",
        roles: ["librarian"],
      };
      expect(hasPermission(librarian, "scores:upload")).toBe(true);
      expect(hasPermission(librarian, "scores:delete")).toBe(true);
      expect(hasPermission(librarian, "scores:view")).toBe(true);
      expect(hasPermission(librarian, "members:invite")).toBe(false);
      expect(hasPermission(librarian, "members:manage")).toBe(false);
      expect(hasPermission(librarian, "vault:delete")).toBe(false);
    });

    it("singer has view-only permissions", () => {
      const singer: Member = {
        id: "4",
        email_id: "singer@test.com",
        roles: [],
      };
      expect(hasPermission(singer, "scores:upload")).toBe(false);
      expect(hasPermission(singer, "scores:delete")).toBe(false);
      expect(hasPermission(singer, "scores:view")).toBe(true);
      expect(hasPermission(singer, "scores:download")).toBe(true);
      expect(hasPermission(singer, "members:invite")).toBe(false);
      expect(hasPermission(singer, "members:manage")).toBe(false);
      expect(hasPermission(singer, "vault:delete")).toBe(false);
    });
  });

  describe("requireRole", () => {
    it("returns success when role meets minimum", () => {
      const member: Member = {
        id: "test-123",
        roles: ["admin"],
        email_id: "test@example.com",
      };
      const result = requireRole(member, "admin");
      expect(result.success).toBe(true);
    });

    it("returns failure when member has different role than required", () => {
      const member: Member = {
        id: "test-123",
        roles: ["owner"],
        email_id: "test@example.com",
      };
      const result = requireRole(member, "admin");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Insufficient permissions");
    });

    it("returns failure when role below minimum", () => {
      const member: Member = {
        id: "test-123",
        roles: [],
        email_id: "test@example.com",
      };
      const result = requireRole(member, "admin");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Insufficient permissions");
    });

    it("returns failure when no member provided", () => {
      const result = requireRole(null, "librarian");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Authentication required");
    });
  });

  describe("permission helpers", () => {
    it("canUploadScores returns true for librarian only", () => {
      expect(
        canUploadScores({ id: "1", roles: ["owner"], email_id: "t@t.com" }),
      ).toBe(false);
      expect(
        canUploadScores({ id: "2", roles: ["admin"], email_id: "t@t.com" }),
      ).toBe(false);
      expect(
        canUploadScores({ id: "3", roles: ["librarian"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(canUploadScores({ id: "4", roles: [], email_id: "t@t.com" })).toBe(
        false,
      );
    });

    it("canDeleteScores returns true for librarian only", () => {
      expect(
        canDeleteScores({ id: "1", roles: ["owner"], email_id: "t@t.com" }),
      ).toBe(false);
      expect(
        canDeleteScores({ id: "2", roles: ["admin"], email_id: "t@t.com" }),
      ).toBe(false);
      expect(
        canDeleteScores({ id: "3", roles: ["librarian"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(canDeleteScores({ id: "4", roles: [], email_id: "t@t.com" })).toBe(
        false,
      );
    });

    it("canInviteMembers returns true for admin+ only", () => {
      expect(
        canInviteMembers({ id: "1", roles: ["owner"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(
        canInviteMembers({ id: "2", roles: ["admin"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(
        canInviteMembers({
          id: "3",
          roles: ["librarian"],
          email_id: "t@t.com",
        }),
      ).toBe(false);
      expect(
        canInviteMembers({ id: "4", roles: [], email_id: "t@t.com" }),
      ).toBe(false);
    });

    it("canManageRoles returns true for admin+ only", () => {
      expect(
        canManageRoles({ id: "1", roles: ["owner"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(
        canManageRoles({ id: "2", roles: ["admin"], email_id: "t@t.com" }),
      ).toBe(true);
      expect(
        canManageRoles({ id: "3", roles: ["librarian"], email_id: "t@t.com" }),
      ).toBe(false);
      expect(canManageRoles({ id: "4", roles: [], email_id: "t@t.com" })).toBe(
        false,
      );
    });
  });

  describe("conductor role permissions", () => {
    it("conductor has event management permissions", () => {
      const conductor: Member = {
        id: "5",
        email_id: "conductor@test.com",
        roles: ["conductor"],
      };
      expect(hasPermission(conductor, "events:create")).toBe(true);
      expect(hasPermission(conductor, "events:manage")).toBe(true);
      expect(hasPermission(conductor, "events:delete")).toBe(true);
      expect(hasPermission(conductor, "attendance:record")).toBe(true);
    });

    it("conductor does not have score management permissions", () => {
      const conductor: Member = {
        id: "5",
        email_id: "conductor@test.com",
        roles: ["conductor"],
      };
      expect(hasPermission(conductor, "scores:upload")).toBe(false);
      expect(hasPermission(conductor, "scores:delete")).toBe(false);
    });

    it("conductor does not have member management permissions", () => {
      const conductor: Member = {
        id: "5",
        email_id: "conductor@test.com",
        roles: ["conductor"],
      };
      expect(hasPermission(conductor, "members:invite")).toBe(false);
      expect(hasPermission(conductor, "members:manage")).toBe(false);
      expect(hasPermission(conductor, "vault:delete")).toBe(false);
    });

    it("conductor can view and download scores (implicit)", () => {
      const conductor: Member = {
        id: "5",
        email_id: "conductor@test.com",
        roles: ["conductor"],
      };
      expect(hasPermission(conductor, "scores:view")).toBe(true);
      expect(hasPermission(conductor, "scores:download")).toBe(true);
    });

    it("owner needs conductor role for event permissions", () => {
      const owner: Member = {
        id: "1",
        email_id: "owner@test.com",
        roles: ["owner"],
      };
      expect(hasPermission(owner, "events:create")).toBe(false);
      expect(hasPermission(owner, "events:manage")).toBe(false);
      expect(hasPermission(owner, "events:delete")).toBe(false);
      expect(hasPermission(owner, "attendance:record")).toBe(false);

      // But owner+conductor has those permissions
      const ownerConductor: Member = {
        id: "1",
        email_id: "owner@test.com",
        roles: ["owner", "conductor"],
      };
      expect(hasPermission(ownerConductor, "events:create")).toBe(true);
      expect(hasPermission(ownerConductor, "events:manage")).toBe(true);
    });
  });

  // Registration checks (Issue #97) - roster-only members have no permissions
  describe("registration requirements", () => {
    it("roster-only member (email_id=null) has NO permissions", () => {
      const rosterMember: Member = {
        id: "roster-1",
        email_id: null, // NOT registered
        roles: ["librarian"], // Has roles but not registered
      };
      // Even basic permissions should be denied
      expect(hasPermission(rosterMember, "scores:view")).toBe(false);
      expect(hasPermission(rosterMember, "scores:download")).toBe(false);
      expect(hasPermission(rosterMember, "scores:upload")).toBe(false);
    });

    it("null member has no permissions", () => {
      expect(hasPermission(null, "scores:view")).toBe(false);
      expect(hasPermission(null, "scores:download")).toBe(false);
    });

    it("undefined member has no permissions", () => {
      expect(hasPermission(undefined, "scores:view")).toBe(false);
      expect(hasPermission(undefined, "scores:download")).toBe(false);
    });
  });

  // Organization-scoped permissions (Issue #161 - Schema V2)
  describe("organization-scoped permissions", () => {
    it("hasPermission with orgId checks org-specific roles only", () => {
      // Member with roles in org_crede_001
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["admin"], // Has admin in Crede
        orgRoles: {
          org_crede_001: ["admin"],
          org_other_001: [], // No roles in other org
        },
      };
      // With orgId, should check that specific org
      expect(hasPermission(member, "members:invite", "org_crede_001")).toBe(
        true,
      );
      expect(hasPermission(member, "members:invite", "org_other_001")).toBe(
        false,
      );
    });

    it("hasPermission without orgId falls back to roles array (backward compat)", () => {
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["admin"],
      };
      // Without orgId, use existing behavior
      expect(hasPermission(member, "members:invite")).toBe(true);
    });

    it("hasRole with orgId checks org-specific roles", () => {
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["owner", "admin"], // Aggregate
        orgRoles: {
          org_crede_001: ["owner"],
          org_other_001: ["admin"],
        },
      };
      expect(hasRole(member, "owner", "org_crede_001")).toBe(true);
      expect(hasRole(member, "admin", "org_crede_001")).toBe(false);
      expect(hasRole(member, "owner", "org_other_001")).toBe(false);
      expect(hasRole(member, "admin", "org_other_001")).toBe(true);
    });

    it("hasRole without orgId checks roles array (backward compat)", () => {
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["admin"],
      };
      expect(hasRole(member, "admin")).toBe(true);
      expect(hasRole(member, "owner")).toBe(false);
    });

    it("owner in one org does not grant owner in another org", () => {
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["owner"],
        orgRoles: {
          org_crede_001: ["owner"],
          org_other_001: [],
        },
      };
      // Owner in Crede has all permissions there
      expect(hasPermission(member, "vault:delete", "org_crede_001")).toBe(true);
      // But not in other org
      expect(hasPermission(member, "vault:delete", "org_other_001")).toBe(
        false,
      );
    });

    it("requireRole with orgId checks org-specific roles", () => {
      const member: Member = {
        id: "member-1",
        email_id: "member@test.com",
        roles: ["admin"],
        orgRoles: {
          org_crede_001: ["admin"],
          org_other_001: [],
        },
      };
      expect(requireRole(member, "admin", "org_crede_001").success).toBe(true);
      expect(requireRole(member, "admin", "org_other_001").success).toBe(false);
    });
  });
});
