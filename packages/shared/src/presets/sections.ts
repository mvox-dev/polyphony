// Section presets for organization registration
// Predefined section configurations that orgs can choose during setup

/**
 * A single section definition within a preset
 */
export interface PresetSection {
  name: string;
  abbreviation: string;
  /** Parent section name (must match another entry's name in the same preset) */
  parentName?: string;
}

/**
 * A named collection of sections (e.g., "SATB", "SSAATTBB")
 */
export interface SectionPreset {
  id: string;
  label: string;
  description: string;
  sections: PresetSection[];
}

/**
 * All available section presets.
 * Order matters — first preset is the default in the UI.
 */
export const SECTION_PRESETS: readonly SectionPreset[] = [
  {
    id: "satb",
    label: "SATB",
    description: "Standard four-part choir",
    sections: [
      { name: "Soprano", abbreviation: "S" },
      { name: "Alto", abbreviation: "A" },
      { name: "Tenor", abbreviation: "T" },
      { name: "Bass", abbreviation: "B" },
    ],
  },
  {
    id: "ssaattbb",
    label: "SSAATTBB",
    description: "Double choir with subdivisions",
    sections: [
      { name: "Soprano", abbreviation: "S" },
      { name: "Soprano I", abbreviation: "S1", parentName: "Soprano" },
      { name: "Soprano II", abbreviation: "S2", parentName: "Soprano" },
      { name: "Alto", abbreviation: "A" },
      { name: "Alto I", abbreviation: "A1", parentName: "Alto" },
      { name: "Alto II", abbreviation: "A2", parentName: "Alto" },
      { name: "Tenor", abbreviation: "T" },
      { name: "Tenor I", abbreviation: "T1", parentName: "Tenor" },
      { name: "Tenor II", abbreviation: "T2", parentName: "Tenor" },
      { name: "Bass", abbreviation: "B" },
      { name: "Bass I", abbreviation: "B1", parentName: "Bass" },
      { name: "Bass II", abbreviation: "B2", parentName: "Bass" },
    ],
  },
  {
    id: "sab",
    label: "SAB",
    description: "Three-part choir",
    sections: [
      { name: "Soprano", abbreviation: "S" },
      { name: "Alto", abbreviation: "A" },
      { name: "Bass", abbreviation: "B" },
    ],
  },
  {
    id: "strings",
    label: "Strings",
    description: "String section ensemble",
    sections: [
      { name: "Violin I", abbreviation: "Vn1" },
      { name: "Violin II", abbreviation: "Vn2" },
      { name: "Viola", abbreviation: "Vla" },
      { name: "Cello", abbreviation: "Vc" },
      { name: "Double Bass", abbreviation: "Db" },
    ],
  },
  {
    id: "chamber",
    label: "Chamber",
    description: "Small chamber ensemble",
    sections: [
      { name: "Woodwinds", abbreviation: "WW" },
      { name: "Brass", abbreviation: "Br" },
      { name: "Strings", abbreviation: "Str" },
      { name: "Percussion", abbreviation: "Perc" },
    ],
  },
  {
    id: "orchestra",
    label: "Full Orchestra",
    description: "Full symphonic orchestra sections",
    sections: [
      { name: "Woodwinds", abbreviation: "WW" },
      { name: "Brass", abbreviation: "Br" },
      { name: "Percussion", abbreviation: "Perc" },
      { name: "Violin I", abbreviation: "Vn1" },
      { name: "Violin II", abbreviation: "Vn2" },
      { name: "Viola", abbreviation: "Vla" },
      { name: "Cello", abbreviation: "Vc" },
      { name: "Double Bass", abbreviation: "Db" },
    ],
  },
] as const;

/**
 * Flat section ready for DB insertion (parentName resolved to index-based reference)
 */
export interface FlatSection {
  name: string;
  abbreviation: string;
  parentName: string | null;
  displayOrder: number;
}

/**
 * Flatten a preset into an ordered list of sections for DB insertion.
 * Parent references use name strings — the caller resolves to IDs after insert.
 */
export function flattenPreset(presetId: string): FlatSection[] {
  const preset = SECTION_PRESETS.find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Unknown section preset: ${presetId}`);
  }

  return preset.sections.map((s, i) => ({
    name: s.name,
    abbreviation: s.abbreviation,
    parentName: s.parentName ?? null,
    displayOrder: i + 1,
  }));
}

/**
 * Get preset IDs for validation
 */
export function getPresetIds(): string[] {
  return SECTION_PRESETS.map((p) => p.id);
}
