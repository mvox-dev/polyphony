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

// ─── flattenPreset() — orchestral (hierarchical) ────────────────────────────

describe("flattenPreset — strings (hierarchical)", () => {
  it("returns 6 sections (1 parent + 5 children)", () => {
    expect(flattenPreset("strings")).toHaveLength(6);
  });

  it("Strings is the parent with parentName null", () => {
    const sections = flattenPreset("strings");
    const parent = sections.find((s) => s.name === "Strings");
    expect(parent?.parentName).toBeNull();
  });

  it("Violin I and Violin II reference Strings as parent", () => {
    const sections = flattenPreset("strings");
    expect(sections.find((s) => s.name === "Violin I")?.parentName).toBe(
      "Strings",
    );
    expect(sections.find((s) => s.name === "Violin II")?.parentName).toBe(
      "Strings",
    );
  });

  it("all children reference Strings", () => {
    const sections = flattenPreset("strings");
    const children = sections.filter((s) => s.parentName !== null);
    expect(children).toHaveLength(5);
    for (const child of children) {
      expect(child.parentName).toBe("Strings");
    }
  });
});

describe("flattenPreset — chamber (hierarchical)", () => {
  it("returns 10 sections", () => {
    expect(flattenPreset("chamber")).toHaveLength(10);
  });

  it("has 4 top-level parents", () => {
    const sections = flattenPreset("chamber");
    const parents = sections.filter((s) => s.parentName === null);
    expect(parents.map((p) => p.name).sort()).toEqual([
      "Brass",
      "Percussion",
      "Strings",
      "Woodwinds",
    ]);
  });

  it("children reference their correct parent", () => {
    const sections = flattenPreset("chamber");
    expect(sections.find((s) => s.name === "Flute")?.parentName).toBe(
      "Woodwinds",
    );
    expect(sections.find((s) => s.name === "Horn")?.parentName).toBe("Brass");
    expect(sections.find((s) => s.name === "Violin")?.parentName).toBe(
      "Strings",
    );
  });
});

describe("flattenPreset — orchestra (hierarchical)", () => {
  it("returns 18 sections", () => {
    expect(flattenPreset("orchestra")).toHaveLength(18);
  });

  it("has 4 top-level parents", () => {
    const sections = flattenPreset("orchestra");
    const parents = sections.filter((s) => s.parentName === null);
    expect(parents.map((p) => p.name).sort()).toEqual([
      "Brass",
      "Percussion",
      "Strings",
      "Woodwinds",
    ]);
  });

  it("string children reference Strings", () => {
    const sections = flattenPreset("orchestra");
    for (const name of [
      "Violin I",
      "Violin II",
      "Viola",
      "Cello",
      "Double Bass",
    ]) {
      expect(sections.find((s) => s.name === name)?.parentName).toBe("Strings");
    }
  });

  it("woodwind children reference Woodwinds", () => {
    const sections = flattenPreset("orchestra");
    for (const name of ["Flute", "Oboe", "Clarinet", "Bassoon"]) {
      expect(sections.find((s) => s.name === name)?.parentName).toBe(
        "Woodwinds",
      );
    }
  });

  it("brass children reference Brass", () => {
    const sections = flattenPreset("orchestra");
    for (const name of ["Horn", "Trumpet", "Trombone", "Tuba"]) {
      expect(sections.find((s) => s.name === name)?.parentName).toBe("Brass");
    }
  });

  it("Timpani references Percussion", () => {
    const sections = flattenPreset("orchestra");
    expect(sections.find((s) => s.name === "Timpani")?.parentName).toBe(
      "Percussion",
    );
  });

  it("displayOrder is sequential starting at 1", () => {
    const sections = flattenPreset("orchestra");
    sections.forEach((s, i) => {
      expect(s.displayOrder).toBe(i + 1);
    });
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
