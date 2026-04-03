#!/usr/bin/env node

/**
 * Sorts i18n message JSON files by group and alphabetical key order.
 *
 * Groups are defined by prefix → group name mapping. Within each group,
 * keys are sorted alphabetically. Groups are sorted alphabetically by
 * group name, with "Miscellaneous" always last. Blank lines separate groups.
 *
 * Usage: node apps/vault/messages/sort-messages.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES = ["en", "et", "lv", "uk"];

// Prefix → Group name mapping (order within each group: alphabetical by full key)
// Groups are sorted alphabetically by group name, "Miscellaneous" always last.
const PREFIX_TO_GROUP = new Map([
  // Actions
  ["actions_", "Actions"],
  // Auth
  ["auth_", "Auth"],
  // Common
  ["common_", "Common"],
  // Copyright
  ["copyright_", "Copyright"],
  // Events
  ["event_", "Events"],
  ["events_", "Events"],
  // Guides
  ["guides_", "Guides"],
  // Invitations
  ["invite_link_", "Invitations"],
  ["invite_", "Invitations"],
  ["invites_", "Invitations"],
  // Landing
  ["landing_", "Landing"],
  // Library
  ["collection_", "Library"],
  ["edition_", "Library"],
  ["editions_", "Library"],
  ["library_", "Library"],
  ["missing_", "Library"],
  ["works_", "Library"],
  // Login
  ["login_", "Login"],
  // Members
  ["add_roster_", "Members"],
  ["member_", "Members"],
  ["members_", "Members"],
  // Navigation
  ["nav_", "Navigation"],
  // Registration
  ["register_", "Registration"],
  // Roles
  ["roles_", "Roles"],
  // Roster
  ["roster_", "Roster"],
  // Seasons
  ["season_", "Seasons"],
  ["seasons_", "Seasons"],
  // Settings
  ["settings_", "Settings"],
  // Welcome
  ["welcome_", "Welcome"],
]);

// Prefixes sorted longest-first for correct matching (e.g., "invite_link_" before "invite_")
const SORTED_PREFIXES = [...PREFIX_TO_GROUP.keys()].sort(
  (a, b) => b.length - a.length,
);

function getGroup(key) {
  for (const prefix of SORTED_PREFIXES) {
    if (key.startsWith(prefix)) {
      return PREFIX_TO_GROUP.get(prefix);
    }
  }
  return "Miscellaneous";
}

function sortMessages(messages) {
  // Group keys (skip $schema)
  const groups = new Map();

  for (const key of Object.keys(messages)) {
    if (key === "$schema") continue;

    const group = getGroup(key);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(key);
  }

  // Sort keys within each group
  for (const keys of groups.values()) {
    keys.sort();
  }

  // Sort groups alphabetically, Miscellaneous last
  const sortedGroupNames = [...groups.keys()].sort((a, b) => {
    if (a === "Miscellaneous") return 1;
    if (b === "Miscellaneous") return -1;
    return a.localeCompare(b);
  });

  // Build sorted object
  const sorted = {};
  if (messages.$schema) {
    sorted.$schema = messages.$schema;
  }

  for (const groupName of sortedGroupNames) {
    for (const key of groups.get(groupName)) {
      sorted[key] = messages[key];
    }
  }

  return { sorted, groups, sortedGroupNames };
}

function writeJsonWithGroupSeparators(
  filepath,
  sorted,
  groups,
  sortedGroupNames,
  schema,
) {
  const lines = ["{"];

  if (schema) {
    lines.push(`  "$schema": ${JSON.stringify(schema)},`);
  }

  for (let gi = 0; gi < sortedGroupNames.length; gi++) {
    const groupName = sortedGroupNames[gi];
    const keys = groups.get(groupName);

    // Blank line before each group (except the first if no schema, or after schema)
    lines.push("");

    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki];
      const value = sorted[key];
      const isLastKey =
        gi === sortedGroupNames.length - 1 && ki === keys.length - 1;
      const comma = isLastKey ? "" : ",";
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
    }
  }

  lines.push("}");
  lines.push(""); // trailing newline

  writeFileSync(filepath, lines.join("\n"));
}

// Main
console.log("Sorting i18n message files...\n");

let referenceKeys = null;

for (const locale of LOCALES) {
  const filepath = join(__dirname, `${locale}.json`);
  const raw = readFileSync(filepath, "utf-8");
  const messages = JSON.parse(raw);

  const keyCount = Object.keys(messages).filter((k) => k !== "$schema").length;
  const { sorted, groups, sortedGroupNames } = sortMessages(messages);

  // Verify no keys lost
  const sortedKeyCount = Object.keys(sorted).filter(
    (k) => k !== "$schema",
  ).length;
  if (keyCount !== sortedKeyCount) {
    console.error(
      `ERROR: ${locale}.json key count mismatch! Before: ${keyCount}, After: ${sortedKeyCount}`,
    );
    process.exit(1);
  }

  // Verify all locales have the same keys
  const currentKeys = Object.keys(sorted)
    .filter((k) => k !== "$schema")
    .join(",");
  if (referenceKeys === null) {
    referenceKeys = currentKeys;
  } else if (currentKeys !== referenceKeys) {
    console.error(`ERROR: ${locale}.json keys don't match en.json!`);
    process.exit(1);
  }

  writeJsonWithGroupSeparators(
    filepath,
    sorted,
    groups,
    sortedGroupNames,
    messages.$schema,
  );

  console.log(
    `${locale}.json — ${sortedKeyCount} keys sorted into ${sortedGroupNames.length} groups`,
  );
}

// Print group summary from en.json
console.log("");
const enPath = join(__dirname, "en.json");
const enMessages = JSON.parse(readFileSync(enPath, "utf-8"));
const { groups } = sortMessages(enMessages);
const sortedNames = [...groups.keys()].sort((a, b) => {
  if (a === "Miscellaneous") return 1;
  if (b === "Miscellaneous") return -1;
  return a.localeCompare(b);
});

console.log("Group breakdown:");
for (const name of sortedNames) {
  console.log(`  ${name}: ${groups.get(name).length} keys`);
}
console.log(
  `\nTotal: ${Object.keys(enMessages).filter((k) => k !== "$schema").length} keys`,
);
console.log("\nDone!");
