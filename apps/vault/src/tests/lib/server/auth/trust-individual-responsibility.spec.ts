// Tests for Issue #240: Trust Individual Responsibility permission logic
import { describe, it, expect } from "vitest";
import { canEditParticipation } from "$lib/server/auth/permissions";
import type { MemberAuthContext } from "$lib/types";

function makeMember(
  id: string,
  roles: string[] = [],
  emailId = "test@example.com",
): MemberAuthContext {
  return { id, roles: roles as any[], email_id: emailId };
}

describe("canEditParticipation", () => {
  const regularMember = makeMember("member-1");
  const adminMember = makeMember("admin-1", ["admin"]);
  const ownerMember = makeMember("owner-1", ["owner"]);
  const conductorMember = makeMember("conductor-1", ["conductor"]);
  const sectionLeader = makeMember("leader-1", ["section_leader"]);

  describe("when trustIndividualResponsibility is DISABLED (default)", () => {
    const trust = false;

    it("should deny regular member editing own record", () => {
      expect(
        canEditParticipation(regularMember, "member-1", trust, false),
      ).toBe(false);
    });

    it("should deny regular member editing another record", () => {
      expect(canEditParticipation(regularMember, "other", trust, false)).toBe(
        false,
      );
    });

    it("should allow admin to edit any record", () => {
      expect(canEditParticipation(adminMember, "member-1", trust, true)).toBe(
        true,
      );
      expect(canEditParticipation(adminMember, "other", trust, true)).toBe(
        true,
      );
    });

    it("should allow owner to edit any record", () => {
      expect(canEditParticipation(ownerMember, "member-1", trust, true)).toBe(
        true,
      );
    });

    it("should allow conductor to edit any record (attendance:record permission)", () => {
      expect(
        canEditParticipation(conductorMember, "member-1", trust, false),
      ).toBe(true);
    });

    it("should allow section leader to edit (attendance:record permission)", () => {
      expect(canEditParticipation(sectionLeader, "other", trust, false)).toBe(
        true,
      );
    });
  });

  describe("when trustIndividualResponsibility is ENABLED", () => {
    const trust = true;

    it("should allow regular member to edit own record", () => {
      expect(
        canEditParticipation(regularMember, "member-1", trust, false),
      ).toBe(true);
    });

    it("should deny regular member editing another member record", () => {
      expect(canEditParticipation(regularMember, "other", trust, false)).toBe(
        false,
      );
    });

    it("should allow admin to edit any record", () => {
      expect(canEditParticipation(adminMember, "other", trust, true)).toBe(
        true,
      );
    });

    it("should allow conductor to edit any record", () => {
      expect(canEditParticipation(conductorMember, "other", trust, false)).toBe(
        true,
      );
    });
  });

  describe("edge cases", () => {
    it("should deny null member", () => {
      expect(canEditParticipation(null, "any", true, false)).toBe(false);
    });

    it("should deny undefined member", () => {
      expect(canEditParticipation(undefined, "any", true, false)).toBe(false);
    });
  });
});
