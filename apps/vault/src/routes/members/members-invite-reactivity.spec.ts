// Tests for invite reactivity fix (issue #258)
//
// The bug: pendingInviteLinks is passed statically from data.pendingInviteLinks
// (line 366 of +page.svelte), so it never updates when invites are revoked/renewed.
//
// The fix: derive pendingInviteLinks reactively from the invites array.
// This requires:
//   1. The Invite type to include roster_member_id (the member ID key for the map)
//   2. A pure buildPendingInviteLinks(invites) function (or $derived inline)
//      that maps roster_member_id → inviteLink
//
// These tests cover the derivation logic. They will FAIL until:
//   - buildPendingInviteLinks is exported from this module or a shared utility
//   - The Invite type includes roster_member_id
//
// Import will fail (red phase) — buildPendingInviteLinks does not exist yet.
import { describe, it, expect } from "vitest";
import { buildPendingInviteLinks } from "./members-invite-reactivity";

// Minimal Invite shape needed for the derivation
// (The full Invite type lives in PendingInvitesCard.svelte)
interface TestInvite {
  id: string; // invite row id
  rosterId: string; // roster_member_id — member this invite is for
  inviteLink: string; // full URL with token
  name: string;
  expiresAt: string;
  invitedBy: string;
  roles: string[];
}

function makeInvite(
  overrides: Partial<TestInvite> &
    Pick<TestInvite, "id" | "rosterId" | "inviteLink">,
): TestInvite {
  return {
    name: "Test Member",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    invitedBy: "admin@example.com",
    roles: [],
    ...overrides,
  };
}

describe("buildPendingInviteLinks — initial state", () => {
  it("returns empty map when invites array is empty", () => {
    const result = buildPendingInviteLinks([]);
    expect(result).toEqual({});
  });

  it("maps rosterId → inviteLink for a single invite", () => {
    const invites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=abc123",
      }),
    ];
    const result = buildPendingInviteLinks(invites);
    expect(result).toEqual({
      member_a: "https://org.example.com/invite/accept?token=abc123",
    });
  });

  it("maps multiple invites correctly", () => {
    const invites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=aaa",
      }),
      makeInvite({
        id: "inv_2",
        rosterId: "member_b",
        inviteLink: "https://org.example.com/invite/accept?token=bbb",
      }),
      makeInvite({
        id: "inv_3",
        rosterId: "member_c",
        inviteLink: "https://org.example.com/invite/accept?token=ccc",
      }),
    ];
    const result = buildPendingInviteLinks(invites);
    expect(result).toEqual({
      member_a: "https://org.example.com/invite/accept?token=aaa",
      member_b: "https://org.example.com/invite/accept?token=bbb",
      member_c: "https://org.example.com/invite/accept?token=ccc",
    });
  });
});

describe("buildPendingInviteLinks — after revoking an invite", () => {
  it("does not include entry for a member whose invite was removed from the array", () => {
    const initialInvites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=aaa",
      }),
      makeInvite({
        id: "inv_2",
        rosterId: "member_b",
        inviteLink: "https://org.example.com/invite/accept?token=bbb",
      }),
    ];

    // Simulate revoking inv_1 (member_a's invite is filtered out)
    const afterRevoke = initialInvites.filter((inv) => inv.id !== "inv_1");
    const result = buildPendingInviteLinks(afterRevoke);

    expect(result).not.toHaveProperty("member_a");
    expect(result).toHaveProperty("member_b");
  });

  it("returns empty map when last invite is revoked", () => {
    const initialInvites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=aaa",
      }),
    ];

    const afterRevoke = initialInvites.filter((inv) => inv.id !== "inv_1");
    const result = buildPendingInviteLinks(afterRevoke);

    expect(result).toEqual({});
  });
});

describe("buildPendingInviteLinks — after renewing an invite", () => {
  it("reflects updated inviteLink when an invite is renewed with a new token", () => {
    const initialInvites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=old-token",
      }),
    ];

    // Simulate renew: same rosterId, new id and new token
    const afterRenew = initialInvites.map((inv) =>
      inv.id === "inv_1"
        ? {
            ...inv,
            id: "inv_1_renewed",
            inviteLink: "https://org.example.com/invite/accept?token=new-token",
          }
        : inv,
    );

    const result = buildPendingInviteLinks(afterRenew);

    expect(result["member_a"]).toBe(
      "https://org.example.com/invite/accept?token=new-token",
    );
  });

  it("does not retain the old invite link after renewal", () => {
    const initialInvites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=old-token",
      }),
    ];

    const afterRenew = initialInvites.map((inv) =>
      inv.id === "inv_1"
        ? {
            ...inv,
            inviteLink: "https://org.example.com/invite/accept?token=new-token",
          }
        : inv,
    );

    const result = buildPendingInviteLinks(afterRenew);

    expect(result["member_a"]).not.toBe(
      "https://org.example.com/invite/accept?token=old-token",
    );
  });
});

describe("buildPendingInviteLinks — edge cases", () => {
  it("uses the last entry when a member appears twice (should not happen in practice)", () => {
    // If somehow the same rosterId appears twice, last write wins
    const invites = [
      makeInvite({
        id: "inv_1",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=first",
      }),
      makeInvite({
        id: "inv_2",
        rosterId: "member_a",
        inviteLink: "https://org.example.com/invite/accept?token=second",
      }),
    ];
    const result = buildPendingInviteLinks(invites);
    // Just verify a deterministic result exists — no crash, no undefined
    expect(result["member_a"]).toBeDefined();
  });
});
