// Tests for single-org roster link logic (issue #259)
//
// When a user belongs to only ONE organization, the nav should show a direct
// "Roster" link (nav_roster i18n key, href="/events/roster") instead of the
// org name + OrgSwitcher dropdown.
//
// When a user belongs to 2+ organizations, the current org name + OrgSwitcher
// dropdown behavior must be preserved (no regression).
//
// These tests cover the pure helper shouldShowRosterLink(memberOrgs).
// They FAIL until:
//   - shouldShowRosterLink is exported from $lib/nav
//
// Red phase: import will succeed but function does not exist yet.
import { describe, it, expect } from "vitest";
import { shouldShowRosterLink } from "$lib/nav";

interface OrgSummary {
  id: string;
  name: string;
  subdomain: string;
}

function makeOrg(subdomain: string): OrgSummary {
  return { id: `org_${subdomain}`, name: subdomain, subdomain };
}

describe("shouldShowRosterLink — single-org user", () => {
  it("returns true when memberOrgs has exactly one entry", () => {
    expect(shouldShowRosterLink([makeOrg("crede")])).toBe(true);
  });

  it("returns true regardless of which org is in the list", () => {
    expect(shouldShowRosterLink([makeOrg("hannijoggi")])).toBe(true);
  });
});

describe("shouldShowRosterLink — multi-org user", () => {
  it("returns false when memberOrgs has two entries", () => {
    expect(
      shouldShowRosterLink([makeOrg("crede"), makeOrg("hannijoggi")]),
    ).toBe(false);
  });

  it("returns false when memberOrgs has three or more entries", () => {
    expect(
      shouldShowRosterLink([
        makeOrg("crede"),
        makeOrg("hannijoggi"),
        makeOrg("tallinn"),
      ]),
    ).toBe(false);
  });
});

describe("shouldShowRosterLink — unauthenticated / empty state", () => {
  it("returns false when memberOrgs is empty (not logged in)", () => {
    expect(shouldShowRosterLink([])).toBe(false);
  });

  it("returns false when memberOrgs is null/undefined (unauthenticated)", () => {
    expect(shouldShowRosterLink(null as unknown as OrgSummary[])).toBe(false);
    expect(shouldShowRosterLink(undefined as unknown as OrgSummary[])).toBe(
      false,
    );
  });
});

describe("shouldShowRosterLink — does not affect OrgSwitcher visibility (regression guard)", () => {
  it("single org: OrgSwitcher should NOT be shown (no other orgs to switch to)", () => {
    // When shouldShowRosterLink is true, OrgSwitcher must not render.
    // This test documents the expected layout condition:
    // OrgSwitcher is only shown when memberOrgs.length > 1.
    const memberOrgs = [makeOrg("crede")];
    const showRosterLink = shouldShowRosterLink(memberOrgs);
    const showOrgSwitcher = memberOrgs.length > 1;

    expect(showRosterLink).toBe(true);
    expect(showOrgSwitcher).toBe(false);
  });

  it("multi-org: OrgSwitcher should be shown, roster link should NOT", () => {
    const memberOrgs = [makeOrg("crede"), makeOrg("hannijoggi")];
    const showRosterLink = shouldShowRosterLink(memberOrgs);
    const showOrgSwitcher = memberOrgs.length > 1;

    expect(showRosterLink).toBe(false);
    expect(showOrgSwitcher).toBe(true);
  });
});
