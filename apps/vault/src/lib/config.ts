// Vault configuration constants
// Single source of truth for auth-related config

import { createOrgId } from "@polyphony/shared";

export const REGISTRY_URL = "https://polyphony.uk";
export const VAULT_ID = "BQ6u9ENTnZk_danhhIbUB";

// Default organization ID (Schema V2)
// Until multi-org UI is implemented, all operations use this org
export const DEFAULT_ORG_ID = createOrgId("org_crede_001");
