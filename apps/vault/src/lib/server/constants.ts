// Server-side constants for the vault application
// These provide defaults during the Schema V2 migration period

/**
 * Default organization ID for legacy single-org vault deployments.
 * Used as fallback when org context is not yet available.
 *
 * TODO: Remove after #165 (subdomain routing) is implemented.
 */
export const DEFAULT_ORG_ID = "org_crede_001";
