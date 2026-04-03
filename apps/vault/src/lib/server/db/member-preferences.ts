// Member preferences database operations (Epic #183 - i18n)
// Stores member-level overrides for language, locale, and timezone

import type {
  MemberPreferences,
  UpdateMemberPreferencesInput,
} from "$lib/types";

interface MemberPreferencesRow {
  member_id: string;
  language: string | null;
  locale: string | null;
  timezone: string | null;
  updated_at: string;
}

function rowToPreferences(row: MemberPreferencesRow): MemberPreferences {
  return {
    memberId: row.member_id,
    language: row.language,
    locale: row.locale,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  };
}

/**
 * Get member preferences by member ID
 * Returns null if no preferences set (use org/system defaults)
 */
export async function getMemberPreferences(
  db: D1Database,
  memberId: string,
): Promise<MemberPreferences | null> {
  const row = await db
    .prepare("SELECT * FROM member_preferences WHERE member_id = ?")
    .bind(memberId)
    .first<MemberPreferencesRow>();

  return row ? rowToPreferences(row) : null;
}

/**
 * Build UPDATE SET clause for partial updates
 * Returns { updates: [SET clauses], params: [values] }
 */
function buildUpdateSet(input: UpdateMemberPreferencesInput): {
  updates: string[];
  params: (string | null)[];
} {
  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (input.language !== undefined) {
    updates.push("language = ?");
    params.push(input.language);
  }
  if (input.locale !== undefined) {
    updates.push("locale = ?");
    params.push(input.locale);
  }
  if (input.timezone !== undefined) {
    updates.push("timezone = ?");
    params.push(input.timezone);
  }

  return { updates, params };
}

/**
 * Execute update for existing preferences
 */
async function updateExistingPreferences(
  db: D1Database,
  memberId: string,
  input: UpdateMemberPreferencesInput,
): Promise<void> {
  const { updates, params } = buildUpdateSet(input);
  if (updates.length === 0) return; // No changes

  updates.push("updated_at = datetime('now')");
  params.push(memberId);

  await db
    .prepare(
      `UPDATE member_preferences SET ${updates.join(", ")} WHERE member_id = ?`,
    )
    .bind(...params)
    .run();
}

/**
 * Execute insert for new preferences
 */
async function insertNewPreferences(
  db: D1Database,
  memberId: string,
  input: UpdateMemberPreferencesInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO member_preferences (member_id, language, locale, timezone)
			 VALUES (?, ?, ?, ?)`,
    )
    .bind(
      memberId,
      input.language ?? null,
      input.locale ?? null,
      input.timezone ?? null,
    )
    .run();
}

/**
 * Upsert member preferences (creates or updates)
 * Partial updates preserve unchanged fields
 */
export async function setMemberPreferences(
  db: D1Database,
  memberId: string,
  input: UpdateMemberPreferencesInput,
): Promise<MemberPreferences> {
  const existing = await getMemberPreferences(db, memberId);

  if (existing) {
    await updateExistingPreferences(db, memberId, input);
  } else {
    await insertNewPreferences(db, memberId, input);
  }

  const result = await getMemberPreferences(db, memberId);
  if (!result) throw new Error("Failed to save preferences");
  return result;
}

/**
 * Delete member preferences (revert to org/system defaults)
 */
export async function deleteMemberPreferences(
  db: D1Database,
  memberId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM member_preferences WHERE member_id = ?")
    .bind(memberId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
