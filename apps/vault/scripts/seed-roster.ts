// Seed roster members from members.md
// Run with: pnpm tsx scripts/seed-roster.ts

interface RosterMember {
  name: string;
  voicePart: string;
  section: string;
}

const members: RosterMember[] = [
  // Soprano I
  { name: "Jane Makke", voicePart: "S", section: "Soprano I" },
  { name: "Kaire Hallismaa", voicePart: "S", section: "Soprano I" },
  { name: "Mairi Leppmets", voicePart: "S", section: "Soprano I" },
  { name: "Maritana Tedre-Vilimäe", voicePart: "S", section: "Soprano I" },
  { name: "Marjut Engelbrecht", voicePart: "S", section: "Soprano I" },

  // Soprano II
  { name: "Kai Adrikorn", voicePart: "S", section: "Soprano II" },
  { name: "Kati Sass", voicePart: "S", section: "Soprano II" },
  { name: "Kerti Rannisto", voicePart: "S", section: "Soprano II" },
  { name: "Merje Karu", voicePart: "S", section: "Soprano II" },

  // Alto I
  { name: "Koidu Ilmjärv", voicePart: "A", section: "Alto I" },
  { name: "Kristi Sihvonen", voicePart: "A", section: "Alto I" },
  { name: "Saskia Saulus", voicePart: "A", section: "Alto I" },
  { name: "Merle Randmäe", voicePart: "A", section: "Alto I" },

  // Alto II
  { name: "Chris-Helin Loik", voicePart: "A", section: "Alto II" },
  { name: "Lea Adrikorn-Pruul", voicePart: "A", section: "Alto II" },
  { name: "Svetlana Roosileht", voicePart: "A", section: "Alto II" },

  // Tenor
  { name: "Joonatan Uusväli", voicePart: "T", section: "Tenor" },

  // Baritone
  { name: "Joosep Loidap", voicePart: "Bar", section: "Baritone" },
  { name: "Valdur Hüvato", voicePart: "Bar", section: "Baritone" },

  // Bass
  { name: "Mihkel Putrinš", voicePart: "B", section: "Bass" },
];

// Map voice part abbreviations to voice IDs
const voiceMap: Record<string, string> = {
  S: "soprano",
  A: "alto",
  T: "tenor",
  Bar: "baritone",
  B: "bass",
};

// Map section names to section IDs
const sectionMap: Record<string, string> = {
  "Soprano I": "soprano-1",
  "Soprano II": "soprano-2",
  "Alto I": "alto-1",
  "Alto II": "alto-2",
  Tenor: "tenor",
  Baritone: "baritone",
  Bass: "bass",
};

// Generate SQL INSERT statements
console.log("-- Seed roster members");
console.log("-- Run this SQL against production database\n");

members.forEach((member, index) => {
  const memberId = `roster-${String(index + 1).padStart(3, "0")}`;
  const voiceId = voiceMap[member.voicePart];
  const sectionId = sectionMap[member.section];
  const addedBy = "db056854b627423e98d1e"; // Owner (mitselek@gmail.com)

  // Skip Mihkel Putrinš - already exists as owner
  if (member.name === "Mihkel Putrinš") {
    console.log(`-- Skipping ${member.name} (already exists as owner)`);
    return;
  }

  console.log(`-- ${member.name} (${member.section})`);
  console.log(
    `INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES ('${memberId}', '${member.name}', NULL, NULL, '${addedBy}');`,
  );
  console.log(
    `INSERT INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES ('${memberId}', '${voiceId}', 1, '${addedBy}');`,
  );
  console.log(
    `INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES ('${memberId}', '${sectionId}', 1, '${addedBy}');`,
  );
  console.log("");
});

console.log(`-- Total: ${members.length - 1} roster members (excluding owner)`);
