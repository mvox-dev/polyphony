// Tests for root layout server load - org switcher data
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";

// Mock getMemberById
const mockGetMemberById = vi.fn();
vi.mock("$lib/server/db/members", () => ({
  getMemberById: (...args: any[]) => mockGetMemberById(...args),
}));

// Mock getSetting
const mockGetSetting = vi.fn();
vi.mock("$lib/server/db/settings", () => ({
  getSetting: (...args: any[]) => mockGetSetting(...args),
}));

// Mock getMemberOrgSummaries
const mockGetMemberOrgSummaries = vi.fn();
vi.mock("$lib/server/db/member-organizations", () => ({
  getMemberOrgSummaries: (...args: any[]) => mockGetMemberOrgSummaries(...args),
}));

import { load } from "../../routes/+layout.server";

const ORG_ID = createOrgId("org_crede_001");

// Layout load return type for test assertions
interface LayoutLoadResult {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    voices: any[];
    sections: any[];
  } | null;
  locale: string;
  org: { name: string; subdomain: string } | null;
  memberOrgs: { id: string; name: string; subdomain: string }[];
}

function createMockEvent(
  opts: {
    memberId?: string;
    org?: { id: string; name: string; subdomain: string };
  } = {},
) {
  return {
    platform: { env: { DB: {} as D1Database } },
    cookies: {
      get: vi.fn((name: string) =>
        name === "member_id" ? (opts.memberId ?? null) : null,
      ),
      delete: vi.fn(),
    },
    locals: {
      org: opts.org ?? {
        id: ORG_ID,
        name: "Kammerkoor Crede",
        subdomain: "crede",
      },
    },
  } as any;
}

describe("Root layout server load", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSetting.mockResolvedValue(null);
    mockGetMemberOrgSummaries.mockResolvedValue([]);
  });

  it("returns org info even when user is not logged in", async () => {
    const event = createMockEvent();

    const result = (await load(event)) as LayoutLoadResult;

    expect(result.org).toEqual({
      name: "Kammerkoor Crede",
      subdomain: "crede",
    });
    expect(result.user).toBeNull();
    expect(result.memberOrgs).toEqual([]);
  });

  it("returns user data and member orgs when logged in", async () => {
    const mockMember = {
      id: "member_001",
      email_id: "user@test.com",
      name: "Test User",
      roles: ["owner"],
      voices: [],
      sections: [],
    };
    mockGetMemberById.mockResolvedValue(mockMember);
    mockGetMemberOrgSummaries.mockResolvedValue([
      { id: "org_crede_001", name: "Kammerkoor Crede", subdomain: "crede" },
      { id: "org_hannijoggi_001", name: "Hannijöggi", subdomain: "hannijoggi" },
    ]);

    const event = createMockEvent({ memberId: "member_001" });
    const result = (await load(event)) as LayoutLoadResult;

    expect(result.user).toEqual({
      id: "member_001",
      email: "user@test.com",
      name: "Test User",
      roles: ["owner"],
      voices: [],
      sections: [],
    });
    expect(result.memberOrgs).toHaveLength(2);
    expect(result.memberOrgs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subdomain: "crede" }),
        expect.objectContaining({ subdomain: "hannijoggi" }),
      ]),
    );
  });

  it("returns empty memberOrgs when member has no other orgs", async () => {
    const mockMember = {
      id: "member_solo",
      email_id: "solo@test.com",
      name: "Solo User",
      roles: [],
      voices: [],
      sections: [],
    };
    mockGetMemberById.mockResolvedValue(mockMember);
    mockGetMemberOrgSummaries.mockResolvedValue([
      { id: "org_crede_001", name: "Kammerkoor Crede", subdomain: "crede" },
    ]);

    const event = createMockEvent({ memberId: "member_solo" });
    const result = (await load(event)) as LayoutLoadResult;

    expect(result.memberOrgs).toHaveLength(1);
  });

  it("clears cookie and returns null user when member not found", async () => {
    mockGetMemberById.mockResolvedValue(null);

    const event = createMockEvent({ memberId: "invalid_member" });
    const result = (await load(event)) as LayoutLoadResult;

    expect(result.user).toBeNull();
    expect(result.memberOrgs).toEqual([]);
    expect(event.cookies.delete).toHaveBeenCalledWith("member_id", {
      path: "/",
    });
  });

  it("returns org info with current org name and subdomain", async () => {
    const event = createMockEvent({
      org: {
        id: "org_hannijoggi_001",
        name: "Hannijöggi",
        subdomain: "hannijoggi",
      },
    });

    const result = (await load(event)) as LayoutLoadResult;

    expect(result.org).toEqual({
      name: "Hannijöggi",
      subdomain: "hannijoggi",
    });
  });
});
