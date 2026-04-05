// RED: Section presets — flattenPreset() contract and data integrity (#340)
//
// flattenPreset(presetId) → FlatSection[]
//   - name, abbreviation, parentName (null or string), displayOrder (1-based)
//   - choral (SATB): all parentName null, displayOrder sequential
//   - hierarchical (SSAATTBB): child sections carry parentName matching parent's name
//   - throws on unknown preset ID
//
// SECTION_PRESETS data integrity:
//   - all IDs unique
//   - all parentName references resolve within the same preset

import { describe, it, expect } from "vitest";
import {
  flattenPreset,
  getPresetIds,
  SECTION_PRESETS,
  type FlatSection,
  type SectionPreset,
} from "./sections";

// ─── flattenPreset() — choral (flat, no parent hierarchy) ────────────────────

describe("flattenPreset — SATB (flat choral)", () => {
  it("returns 4 sections", () => {
    const sections = flattenPreset("satb");
    expect(sections).toHaveLength(4);
  });

  it("all sections have parentName null", () => {
    const sections = flattenPreset("satb");
    for (const s of sections) {
      expect(s.parentName).toBeNull();
    }
  });

  it("displayOrder is sequential starting at 1", () => {
    const sections = flattenPreset("satb");
    sections.forEach((s, i) => {
      expect(s.displayOrder).toBe(i + 1);
    });
  });

  it("section names are Soprano, Alto, Tenor, Bass", () => {
    const names = flattenPreset("satb").map((s) => s.name);
    expect(names).toEqual(["Soprano", "Alto", "Tenor", "Bass"]);
  });

  it("abbreviations are S, A, T, B", () => {
    const abbrevs = flattenPreset("satb").map((s) => s.abbreviation);
    expect(abbrevs).toEqual(["S", "A", "T", "B"]);
  });
});

describe("flattenPreset — SAB (flat choral)", () => {
  it("returns 3 sections all with parentName null", () => {
    const sections = flattenPreset("sab");
    expect(sections).toHaveLength(3);
    for (const s of sections) {
      expect(s.parentName).toBeNull();
    }
  });
});

// ─── flattenPreset() — hierarchical (parent–child) ────────────────────────────

describe("flattenPreset — SSAATTBB (hierarchical)", () => {
  it("returns 12 sections", () => {
    expect(flattenPreset("ssaattbb")).toHaveLength(12);
  });

  it("top-level voices have parentName null", () => {
    const sections = flattenPreset("ssaattbb");
    const topLevel = sections.filter((s) => s.parentName === null);
    const names = topLevel.map((s) => s.name);
    expect(names).toContain("Soprano");
    expect(names).toContain("Alto");
    expect(names).toContain("Tenor");
    expect(names).toContain("Bass");
  });

  it("subdivision sections have parentName pointing to a top-level section", () => {
    const sections = flattenPreset("ssaattbb");
    const topNames = new Set(
      sections.filter((s) => s.parentName === null).map((s) => s.name),
    );
    const children = sections.filter((s) => s.parentName !== null);

    // Every child must reference an existing top-level section
    for (const child of children) {
      expect(topNames.has(child.parentName!)).toBe(true);
    }
  });

  it("Soprano I and Soprano II both reference Soprano", () => {
    const sections = flattenPreset("ssaattbb");
    const s1 = sections.find((s) => s.name === "Soprano I");
    const s2 = sections.find((s) => s.name === "Soprano II");
    expect(s1?.parentName).toBe("Soprano");
    expect(s2?.parentName).toBe("Soprano");
  });

  it("displayOrder is sequential starting at 1", () => {
    const sections = flattenPreset("ssaattbb");
    sections.forEach((s, i) => {
      expect(s.displayOrder).toBe(i + 1);
    });
  });
});

// ─── flattenPreset() — orchestral (no parent hierarchy, flat) ────────────────

describe("flattenPreset — strings", () => {
  it("returns 5 sections", () => {
    expect(flattenPreset("strings")).toHaveLength(5);
  });

  it("all sections have parentName null", () => {
    const sections = flattenPreset("strings");
    for (const s of sections) {
      expect(s.parentName).toBeNull();
    }
  });

  it("includes Violin I and Violin II", () => {
    const names = flattenPreset("strings").map((s) => s.name);
    expect(names).toContain("Violin I");
    expect(names).toContain("Violin II");
  });
});

describe("flattenPreset — orchestra", () => {
  it("returns sections with displayOrder starting at 1", () => {
    const sections = flattenPreset("orchestra");
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].displayOrder).toBe(1);
  });

  it("all sections have name and abbreviation", () => {
    for (const s of flattenPreset("orchestra")) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.abbreviation.length).toBeGreaterThan(0);
    }
  });
});

// ─── flattenPreset() — error handling ────────────────────────────────────────

describe("flattenPreset — unknown preset ID", () => {
  it("throws for unknown preset ID", () => {
    expect(() => flattenPreset("bagpipe-choir")).toThrow();
  });

  it("error message mentions the unknown ID", () => {
    expect(() => flattenPreset("bagpipe-choir")).toThrow("bagpipe-choir");
  });
});

// ─── SECTION_PRESETS data integrity ──────────────────────────────────────────

describe("SECTION_PRESETS — data integrity", () => {
  it("all preset IDs are unique", () => {
    const ids = SECTION_PRESETS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every preset has a non-empty label and description", () => {
    for (const preset of SECTION_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it("every preset has at least one section", () => {
    for (const preset of SECTION_PRESETS) {
      expect(preset.sections.length).toBeGreaterThan(0);
    }
  });

  it("all parentName references resolve within the same preset", () => {
    for (const preset of SECTION_PRESETS) {
      const names = new Set(preset.sections.map((s) => s.name));
      const badRefs = preset.sections.filter(
        (s) => s.parentName !== undefined && !names.has(s.parentName),
      );
      expect(badRefs).toHaveLength(0);
    }
  });

  it("section names are unique within each preset", () => {
    for (const preset of SECTION_PRESETS) {
      const names = preset.sections.map((s) => s.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });

  it("abbreviations are unique within each preset", () => {
    for (const preset of SECTION_PRESETS) {
      const abbrevs = preset.sections.map((s) => s.abbreviation);
      const unique = new Set(abbrevs);
      expect(unique.size).toBe(abbrevs.length);
    }
  });
});

// ─── getPresetIds() ───────────────────────────────────────────────────────────

describe("getPresetIds()", () => {
  it("returns an array of strings", () => {
    const ids = getPresetIds();
    expect(Array.isArray(ids)).toBe(true);
    for (const id of ids) {
      expect(typeof id).toBe("string");
    }
  });

  it("includes known preset IDs", () => {
    const ids = getPresetIds();
    expect(ids).toContain("satb");
    expect(ids).toContain("ssaattbb");
    expect(ids).toContain("sab");
  });

  it("length matches SECTION_PRESETS", () => {
    expect(getPresetIds()).toHaveLength(SECTION_PRESETS.length);
  });
});
