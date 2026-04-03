// Vault settings database operations
// Settings are stored as key-value pairs per organization with audit trail

import type { OrgId } from "@polyphony/shared";

export interface VaultSetting {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
}

/**
 * Get a setting value by key, scoped to organization
 * Returns null if the setting doesn't exist
 */
export async function getSetting(
  db: D1Database,
  key: string,
  orgId: OrgId,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM vault_settings WHERE org_id = ? AND key = ?")
    .bind(orgId, key)
    .first<{ value: string }>();

  return row?.value ?? null;
}

/**
 * Set a setting value (creates or updates), scoped to organization
 * @param updated_by - Member ID who made the change (optional)
 */
export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
  updated_by: string | undefined,
  orgId: OrgId,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO vault_settings (org_id, key, value, updated_by) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT (org_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(orgId, key, value, updated_by ?? null)
    .run();
}

/**
 * Get all settings as a key-value object, scoped to organization
 */
export async function getAllSettings(
  db: D1Database,
  orgId: OrgId,
): Promise<Record<string, string>> {
  const { results } = await db
    .prepare("SELECT key, value FROM vault_settings WHERE org_id = ?")
    .bind(orgId)
    .all<{ key: string; value: string }>();

  const settings: Record<string, string> = {};
  for (const row of results) {
    settings[row.key] = row.value;
  }

  return settings;
}
