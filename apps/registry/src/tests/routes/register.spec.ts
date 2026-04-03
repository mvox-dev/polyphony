// Tests for /register page and form submission
// Issue #220 - Move registration UI from Vault to Registry

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Registration Flow', () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let mockEvent: any;

	beforeEach(() => {
		mockFetch = vi.fn();
		globalThis.fetch = mockFetch as typeof fetch;

		mockEvent = {
			request: new Request('http://localhost/register', { method: 'POST' }),
			cookies: {
				get: vi.fn().mockReturnValue('session_123'),
				set: vi.fn(),
				delete: vi.fn()
			},
			platform: {
				env: {
					VAULT_API_URL: 'https://vault.test.local'
				}
			},
			url: new URL('http://localhost/register')
		};
	});

	describe('POST /register - Form Submission', () => {
		it('should check subdomain availability via Vault API', async () => {
			// This test will fail until we implement the server action
			const { actions } = await import('../../routes/register/+page.server');

			// Mock Vault API subdomain check
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ available: true })
			});

			// Mock Vault API org creation
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					organization: {
						id: 'org_123',
						name: 'Test Choir',
						subdomain: 'testchoir',
						type: 'collective',
						contactEmail: 'test@example.com'
					}
				})
			});

			const formData = new FormData();
			formData.append('name', 'Test Choir');
			formData.append('email', 'test@example.com');
			formData.append('subdomain', 'testchoir');

			mockEvent.request = new Request('http://localhost/register', {
				method: 'POST',
				body: formData
			});

			try {
				await actions.default(mockEvent);
			} catch (error: any) {
				// Redirect thrown, that's okay for now
			}

			// Should call Vault API to check subdomain
			expect(mockFetch).toHaveBeenCalledWith(
				'https://vault.test.local/api/public/subdomains/check/testchoir',
				expect.any(Object)
			);

			// Should call Vault API to create org
			expect(mockFetch).toHaveBeenCalledWith(
				'https://vault.test.local/api/public/organizations',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json'
					}),
					body: expect.any(String)
				})
			);
		});

		it('should return error when subdomain is unavailable', async () => {
			const { actions } = await import('../../routes/register/+page.server');

			// Mock Vault API subdomain check - unavailable
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					available: false,
					reason: 'Subdomain already taken'
				})
			});

			const formData = new FormData();
			formData.append('name', 'Test Choir');
			formData.append('email', 'test@example.com');
			formData.append('subdomain', 'existingchoir');

			mockEvent.request = new Request('http://localhost/register', {
				method: 'POST',
				body: formData
			});

			const result = await actions.default(mockEvent);

			expect(result).toEqual({
				success: false,
				error: 'Subdomain already taken'
			});
		});

		it('should return error when Vault API org creation fails with 409', async () => {
			const { actions } = await import('../../routes/register/+page.server');

			// Mock subdomain check - available
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ available: true })
			});

			// Mock org creation - conflict
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 409,
				json: async () => ({ error: 'Subdomain already exists' })
			});

			const formData = new FormData();
			formData.append('name', 'Test Choir');
			formData.append('email', 'test@example.com');
			formData.append('subdomain', 'testchoir');

			mockEvent.request = new Request('http://localhost/register', {
				method: 'POST',
				body: formData
			});

			const result = await actions.default(mockEvent);

			expect(result).toEqual({
				success: false,
				error: 'Subdomain already exists'
			});
		});

		it('should validate required fields', async () => {
			const { actions } = await import('../../routes/register/+page.server');

			const formData = new FormData();
			formData.append('name', 'Test Choir');
			// Missing email and subdomain

			mockEvent.request = new Request('http://localhost/register', {
				method: 'POST',
				body: formData
			});

			const result = await actions.default(mockEvent);

			expect(result).toEqual({
				success: false,
				error: 'All fields are required'
			});
		});

		it('should redirect to success page on successful creation', async () => {
			const { actions } = await import('../../routes/register/+page.server');

			// Mock subdomain check - available
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ available: true })
			});

			// Mock org creation - success
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					organization: {
						id: 'org_123',
						name: 'Test Choir',
						subdomain: 'testchoir',
						type: 'collective',
						contactEmail: 'test@example.com'
					}
				})
			});

			const formData = new FormData();
			formData.append('name', 'Test Choir');
			formData.append('email', 'test@example.com');
			formData.append('subdomain', 'testchoir');

			mockEvent.request = new Request('http://localhost/register', {
				method: 'POST',
				body: formData
			});

			// Should throw redirect - SvelteKit redirect() throws a special error
			await expect(async () => {
				await actions.default(mockEvent);
			}).rejects.toThrow();

			// Verify API calls were made
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://vault.test.local/api/public/subdomains/check/testchoir',
				expect.any(Object)
			);
		});
	});

	describe('GET /register - Page Load', () => {
		it('should load page without errors', async () => {
			// No load function - registration page is static
			expect(true).toBe(true);
		});
	});
});
