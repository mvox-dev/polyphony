// Registration page server logic
// Issue #220 - Moved from Vault to Registry, calls Vault public APIs

import { redirect, isRedirect } from '@sveltejs/kit';
import type { Actions } from './$types';

/**
 * Form action handler for organization registration
 * Calls Vault public APIs for subdomain validation and org creation
 */
export const actions: Actions = {
	default: async ({ request, platform }) => {
		const vaultApiUrl = platform?.env?.VAULT_API_URL;

		if (!vaultApiUrl) {
			return { success: false, error: 'Configuration error: VAULT_API_URL not set' };
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const contactEmail = formData.get('email')?.toString()?.trim();
		const subdomain = formData.get('subdomain')?.toString()?.toLowerCase()?.trim();
		const sections = formData.get('sections')?.toString()?.trim() || undefined;

		// Validate required fields
		if (!name || !contactEmail || !subdomain) {
			return { success: false, error: 'All fields are required' };
		}

		try {
			// Step 1: Check subdomain availability via Vault API
			const checkResponse = await fetch(`${vaultApiUrl}/api/public/subdomains/check/${subdomain}`, {
				method: 'GET',
				headers: {
					Accept: 'application/json'
				}
			});

			if (!checkResponse.ok) {
				return { success: false, error: 'Failed to validate subdomain' };
			}

			const checkResult = (await checkResponse.json()) as {
				available: boolean;
				reason?: string;
			};

			if (!checkResult.available) {
				return {
					success: false,
					error: checkResult.reason || 'Subdomain not available'
				};
			}

			// Step 2: Create organization via Vault API
			const createResponse = await fetch(`${vaultApiUrl}/api/public/organizations`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					name,
					subdomain,
					type: 'collective',
					contactEmail,
					...(sections ? { sections } : {})
				})
			});

			if (!createResponse.ok) {
				const errorData = (await createResponse.json()) as { error?: string };
				return {
					success: false,
					error: errorData.error || 'Failed to create organization'
				};
			}

			// Success - redirect to success page
			redirect(303, `/register/success?subdomain=${subdomain}`);
		} catch (error) {
			// SvelteKit redirects are special control flow exceptions
			if (isRedirect(error)) throw error;

			console.error('Registration error:', error);
			return {
				success: false,
				error: 'An unexpected error occurred. Please try again.'
			};
		}
	}
};
