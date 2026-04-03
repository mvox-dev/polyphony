// Server-side load for directory page
// Fetches organization list from Vault public API (zero-storage)
/// <reference types="@cloudflare/workers-types" />
import type { PageServerLoad } from './$types';

interface VaultOrganization {
	id: string;
	name: string;
	subdomain: string;
	type: string;
	contactEmail: string;
	createdAt: string;
}

export const load: PageServerLoad = async ({ platform }) => {
	// Query Vault public API for organizations (zero-storage principle)
	const vaultApiUrl = platform?.env?.VAULT_API_URL || 'https://vault.polyphony.uk';

	try {
		const response = await fetch(`${vaultApiUrl}/api/public/organizations`);
		if (!response.ok) {
			console.error(`Failed to fetch organizations from Vault: ${response.status}`);
			return { organizations: [] };
		}

		const data = (await response.json()) as { organizations: VaultOrganization[] };

		// Transform to match directory display format
		const organizations = data.organizations.map((org) => ({
			id: org.id,
			name: org.name,
			subdomain: org.subdomain,
			url: `https://${org.subdomain}.polyphony.uk`,
			registeredAt: org.createdAt
		}));

		return { organizations };
	} catch (error) {
		console.error('Error fetching organizations from Vault:', error);
		return { organizations: [] };
	}
};
