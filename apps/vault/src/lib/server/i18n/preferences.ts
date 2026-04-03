// i18n preference resolution service (Epic #183, Issue #187)
// Resolves effective preferences using cascade: Member → Organization → System

/**
 * System-level defaults when no preferences are set
 */
export const SYSTEM_DEFAULTS = {
  language: "en",
  locale: "en-US",
  timezone: "UTC",
} as const;

/**
 * Source of each resolved preference
 */
export type PreferenceSource = "member" | "organization" | "system";

/**
 * Resolved i18n preferences with source tracking
 */
export interface ResolvedI18nPreferences {
  /** Resolved language code (ISO 639-1) */
  language: string;
  /** Resolved locale code (BCP 47) */
  locale: string;
  /** Resolved timezone (IANA) */
  timezone: string;
  /** Where each preference was resolved from */
  source: {
    language: PreferenceSource;
    locale: PreferenceSource;
    timezone: PreferenceSource;
  };
}

interface MemberPreferencesRow {
  member_id: string;
  language: string | null;
  locale: string | null;
  timezone: string | null;
  updated_at: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  language: string | null;
  locale: string | null;
  timezone: string | null;
}

/**
 * Resolve effective i18n preferences for a member in an organization
 *
 * Resolution cascade:
 * 1. Member preferences (if set and not empty)
 * 2. Organization settings (if set and not empty)
 * 3. System defaults
 *
 * @param db - D1 database connection
 * @param memberId - Member ID (null for anonymous/unauthenticated)
 * @param orgId - Organization ID
 * @returns Resolved preferences with source tracking
 */
export async function resolvePreferences(
  db: D1Database,
  memberId: string | null,
  orgId: string,
): Promise<ResolvedI18nPreferences> {
  // Fetch member preferences (if authenticated)
  let memberPrefs: MemberPreferencesRow | null = null;
  if (memberId) {
    memberPrefs = await db
      .prepare("SELECT * FROM member_preferences WHERE member_id = ?")
      .bind(memberId)
      .first<MemberPreferencesRow>();
  }

  // Fetch organization settings
  const orgSettings = await db
    .prepare(
      "SELECT id, name, language, locale, timezone FROM organizations WHERE id = ?",
    )
    .bind(orgId)
    .first<OrganizationRow>();

  // Resolve each preference with source tracking
  const resolveValue = (
    memberValue: string | null | undefined,
    orgValue: string | null | undefined,
    systemDefault: string,
  ): { value: string; source: PreferenceSource } => {
    // Check member preference (non-null, non-empty)
    if (memberValue && memberValue.trim() !== "") {
      return { value: memberValue, source: "member" };
    }

    // Check organization setting (non-null, non-empty)
    if (orgValue && orgValue.trim() !== "") {
      return { value: orgValue, source: "organization" };
    }

    // Fall back to system default
    return { value: systemDefault, source: "system" };
  };

  const language = resolveValue(
    memberPrefs?.language,
    orgSettings?.language,
    SYSTEM_DEFAULTS.language,
  );

  const locale = resolveValue(
    memberPrefs?.locale,
    orgSettings?.locale,
    SYSTEM_DEFAULTS.locale,
  );

  const timezone = resolveValue(
    memberPrefs?.timezone,
    orgSettings?.timezone,
    SYSTEM_DEFAULTS.timezone,
  );

  return {
    language: language.value,
    locale: locale.value,
    timezone: timezone.value,
    source: {
      language: language.source,
      locale: locale.source,
      timezone: timezone.source,
    },
  };
}
