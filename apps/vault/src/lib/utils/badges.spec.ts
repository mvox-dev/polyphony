// Tests for badge utility functions
// Issue #143 - DRY: Extract shared utilities

import { describe, it, expect } from "vitest";
import {
  getRoleBadgeClass,
  getRoleLabel,
  getEventTypeBadge,
  getEventTypeBadgeClass,
  getLicenseBadge,
  getLicenseBadgeClass,
  getLicenseLabel,
  getVoiceBadgeClass,
  getSectionBadgeClass,
  getPlannedStatusBadgeClass,
  getActualStatusBadgeClass,
} from "./badges";

describe("Role badges", () => {
  describe("getRoleBadgeClass", () => {
    it("returns purple for owner", () => {
      expect(getRoleBadgeClass("owner")).toContain("bg-purple-100");
      expect(getRoleBadgeClass("owner")).toContain("text-purple-800");
    });

    it("returns blue for admin", () => {
      expect(getRoleBadgeClass("admin")).toContain("bg-blue-100");
      expect(getRoleBadgeClass("admin")).toContain("text-blue-800");
    });

    it("returns green for librarian", () => {
      expect(getRoleBadgeClass("librarian")).toContain("bg-green-100");
      expect(getRoleBadgeClass("librarian")).toContain("text-green-800");
    });

    it("returns amber for conductor", () => {
      expect(getRoleBadgeClass("conductor")).toContain("bg-amber-100");
      expect(getRoleBadgeClass("conductor")).toContain("text-amber-800");
    });

    it("returns teal for section_leader", () => {
      expect(getRoleBadgeClass("section_leader")).toContain("bg-teal-100");
      expect(getRoleBadgeClass("section_leader")).toContain("text-teal-800");
    });

    it("returns gray for unknown roles", () => {
      expect(getRoleBadgeClass("unknown")).toContain("bg-gray-100");
      expect(getRoleBadgeClass("unknown")).toContain("text-gray-800");
    });
  });

  describe("getRoleLabel", () => {
    it("capitalizes simple roles", () => {
      expect(getRoleLabel("admin")).toBe("Admin");
      expect(getRoleLabel("owner")).toBe("Owner");
    });

    it("formats section_leader specially", () => {
      expect(getRoleLabel("section_leader")).toBe("Section Leader");
    });
  });
});

describe("Event type badges", () => {
  describe("getEventTypeBadge", () => {
    it("returns purple for concert", () => {
      const badge = getEventTypeBadge("concert");
      expect(badge.bg).toBe("bg-purple-100");
      expect(badge.text).toBe("text-purple-800");
    });

    it("returns blue for rehearsal", () => {
      const badge = getEventTypeBadge("rehearsal");
      expect(badge.bg).toBe("bg-blue-100");
      expect(badge.text).toBe("text-blue-800");
    });

    it("returns green for retreat", () => {
      const badge = getEventTypeBadge("retreat");
      expect(badge.bg).toBe("bg-green-100");
      expect(badge.text).toBe("text-green-800");
    });

    it("returns orange for festival", () => {
      const badge = getEventTypeBadge("festival");
      expect(badge.bg).toBe("bg-orange-100");
      expect(badge.text).toBe("text-orange-800");
    });

    it("returns gray for unknown types", () => {
      const badge = getEventTypeBadge("unknown");
      expect(badge.bg).toBe("bg-gray-100");
      expect(badge.text).toBe("text-gray-800");
    });
  });

  describe("getEventTypeBadgeClass", () => {
    it("returns combined class string with border", () => {
      const classes = getEventTypeBadgeClass("concert");
      expect(classes).toContain("bg-purple-100");
      expect(classes).toContain("text-purple-800");
      expect(classes).toContain("border-purple-200");
    });
  });
});

describe("License type badges", () => {
  describe("getLicenseBadge", () => {
    it("returns green for public_domain", () => {
      const badge = getLicenseBadge("public_domain");
      expect(badge.bg).toBe("bg-green-100");
      expect(badge.text).toBe("text-green-800");
    });

    it("returns amber for licensed", () => {
      const badge = getLicenseBadge("licensed");
      expect(badge.bg).toBe("bg-amber-100");
      expect(badge.text).toBe("text-amber-800");
    });

    it("returns blue for owned", () => {
      const badge = getLicenseBadge("owned");
      expect(badge.bg).toBe("bg-blue-100");
      expect(badge.text).toBe("text-blue-800");
    });

    it("returns gray for unknown types", () => {
      const badge = getLicenseBadge("unknown");
      expect(badge.bg).toBe("bg-gray-100");
      expect(badge.text).toBe("text-gray-800");
    });
  });

  describe("getLicenseBadgeClass", () => {
    it("returns combined class string", () => {
      const classes = getLicenseBadgeClass("public_domain");
      expect(classes).toContain("bg-green-100");
      expect(classes).toContain("text-green-800");
    });
  });

  describe("getLicenseLabel", () => {
    it("formats public_domain specially", () => {
      expect(getLicenseLabel("public_domain")).toBe("Public Domain");
    });

    it("capitalizes other types", () => {
      expect(getLicenseLabel("licensed")).toBe("Licensed");
      expect(getLicenseLabel("owned")).toBe("Owned");
    });
  });
});

describe("Voice and Section badges", () => {
  it("returns purple for voices", () => {
    expect(getVoiceBadgeClass()).toContain("bg-purple-100");
    expect(getVoiceBadgeClass()).toContain("text-purple-800");
  });

  it("returns teal for sections", () => {
    expect(getSectionBadgeClass()).toContain("bg-teal-100");
    expect(getSectionBadgeClass()).toContain("text-teal-800");
  });
});

describe("Participation status badges", () => {
  describe("getPlannedStatusBadgeClass", () => {
    it("returns green for yes", () => {
      expect(getPlannedStatusBadgeClass("yes")).toContain("bg-green-100");
    });

    it("returns red for no", () => {
      expect(getPlannedStatusBadgeClass("no")).toContain("bg-red-100");
    });

    it("returns amber for maybe", () => {
      expect(getPlannedStatusBadgeClass("maybe")).toContain("bg-amber-100");
    });

    it("returns blue for late", () => {
      expect(getPlannedStatusBadgeClass("late")).toContain("bg-blue-100");
    });

    it("returns gray for null", () => {
      expect(getPlannedStatusBadgeClass(null)).toContain("bg-gray-100");
    });
  });

  describe("getActualStatusBadgeClass", () => {
    it("returns green for present", () => {
      expect(getActualStatusBadgeClass("present")).toContain("bg-green-100");
    });

    it("returns red for absent", () => {
      expect(getActualStatusBadgeClass("absent")).toContain("bg-red-100");
    });

    it("returns amber for late", () => {
      expect(getActualStatusBadgeClass("late")).toContain("bg-amber-100");
    });

    it("returns gray for null", () => {
      expect(getActualStatusBadgeClass(null)).toContain("bg-gray-100");
    });
  });
});
