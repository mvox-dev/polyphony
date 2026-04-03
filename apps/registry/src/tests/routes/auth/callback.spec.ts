// Test OAuth callback endpoint
/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi } from 'vitest';
import { GET } from '../../../routes/auth/callback/+server.js';
import type { TestRequestEvent } from '../../helpers/types.js';

// Mock fetch for Google token exchange
const createMockFetch = (success: boolean = true) => {
	return vi.fn(async (input: URL | RequestInfo) => {
		const url = input.toString();
		if (url.includes('oauth2.googleapis.com/token')) {
			if (!success) {
				return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
			}
			return new Response(
				JSON.stringify({
					access_token: 'mock-access-token',
					id_token: 'mock-id-token'
				}),
				{ status: 200 }
			);
		}
		if (url.includes('www.googleapis.com/oauth2/v3/userinfo')) {
			return new Response(
				JSON.stringify({
					email: 'user@example.com',
					name: 'Test User',
					picture: 'https://example.com/photo.jpg'
				}),
				{ status: 200 }
			);
		}
		return new Response('Not found', { status: 404 });
	});
};

// Mock D1 database with signing key
const createMockDb = () =>
	({
		prepare: (sql: string) => ({
			first: async () => ({
				id: 'key-1',
				private_key: `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHcHbQpzGKV9PBbBclGyZkXfTC+H68CZKrF3+6UduSwq
-----END PRIVATE KEY-----`,
				public_key: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=
-----END PUBLIC KEY-----`
			})
		})
	}) as unknown as D1Database;

describe('GET /auth/callback', () => {
	it('should reject missing code parameter', async () => {
		const url = new URL('http://localhost/auth/callback?state={}');
		const response = await GET({
			url,
			platform: {
				env: {
					DB: createMockDb(),
					API_KEY: 'test',
					GOOGLE_CLIENT_ID: 'test-client-id',
					GOOGLE_CLIENT_SECRET: 'test-secret'
				}
			},
			fetch: createMockFetch()
		} satisfies TestRequestEvent);

		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toContain('Missing authorization code');
	});

	it('should reject missing state parameter', async () => {
		const url = new URL('http://localhost/auth/callback?code=test-code');
		const response = await GET({
			url,
			platform: {
				env: {
					DB: createMockDb(),
					API_KEY: 'test',
					GOOGLE_CLIENT_ID: 'test-client-id',
					GOOGLE_CLIENT_SECRET: 'test-secret'
				}
			},
			fetch: createMockFetch()
		} satisfies TestRequestEvent);

		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toContain('Missing state');
	});

	it('should exchange code for tokens and redirect with JWT', async () => {
		const state = JSON.stringify({
			vaultId: 'vault-test-id',
			callbackUrl: 'https://vault.example.com/callback'
		});
		const url = new URL(`http://localhost/auth/callback?code=test-code&state=${state}`);

		const response = await GET({
			url,
			platform: {
				env: {
					DB: createMockDb(),
					API_KEY: 'test',
					GOOGLE_CLIENT_ID: 'test-client-id',
					GOOGLE_CLIENT_SECRET: 'test-client-secret'
				}
			},
			fetch: createMockFetch(true)
		} satisfies TestRequestEvent);

		// Now returns Response with Location header (not throw)
		expect(response.status).toBe(302);
		const location = response.headers.get('Location');
		expect(location).toContain('https://vault.example.com/callback');
		expect(location).toContain('token=');
	});

	it('should handle Google token exchange failure', async () => {
		const state = JSON.stringify({
			vaultId: 'vault-test-id',
			callbackUrl: 'https://vault.example.com/callback'
		});
		const url = new URL(`http://localhost/auth/callback?code=bad-code&state=${state}`);

		const response = await GET({
			url,
			platform: {
				env: {
					DB: createMockDb(),
					API_KEY: 'test',
					GOOGLE_CLIENT_ID: 'test-client-id',
					GOOGLE_CLIENT_SECRET: 'test-client-secret'
				}
			},
			fetch: createMockFetch(false)
		} satisfies TestRequestEvent);

		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toContain('Failed to exchange');
	});

	// SSO Cookie tests (Issue #208)
	describe('SSO Cookie', () => {
		it('should set polyphony_sso cookie on successful auth', async () => {
			const state = JSON.stringify({
				vaultId: 'vault-test-id',
				callbackUrl: 'https://vault.example.com/callback'
			});
			const url = new URL(`http://localhost/auth/callback?code=test-code&state=${state}`);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id',
						GOOGLE_CLIENT_SECRET: 'test-client-secret'
					}
				},
				fetch: createMockFetch(true)
			} satisfies TestRequestEvent);

			// Should be a redirect response (not throw)
			expect(response.status).toBe(302);

			// Check Set-Cookie header
			const setCookie = response.headers.get('Set-Cookie');
			expect(setCookie).toBeTruthy();
			expect(setCookie).toContain('polyphony_sso=');
		});

		it('should set cookie with correct attributes', async () => {
			const state = JSON.stringify({
				vaultId: 'vault-test-id',
				callbackUrl: 'https://vault.example.com/callback'
			});
			const url = new URL(`http://localhost/auth/callback?code=test-code&state=${state}`);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id',
						GOOGLE_CLIENT_SECRET: 'test-client-secret'
					}
				},
				fetch: createMockFetch(true)
			} satisfies TestRequestEvent);

			const setCookie = response.headers.get('Set-Cookie');
			expect(setCookie).toContain('Domain=.polyphony.uk');
			expect(setCookie).toContain('HttpOnly');
			expect(setCookie).toContain('Secure');
			expect(setCookie).toContain('SameSite=Lax');
			expect(setCookie).toContain('Max-Age=2592000'); // 30 days
			expect(setCookie).toContain('Path=/');
		});

		it('should redirect to vault callback with token', async () => {
			const state = JSON.stringify({
				vaultId: 'vault-test-id',
				callbackUrl: 'https://vault.example.com/callback'
			});
			const url = new URL(`http://localhost/auth/callback?code=test-code&state=${state}`);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id',
						GOOGLE_CLIENT_SECRET: 'test-client-secret'
					}
				},
				fetch: createMockFetch(true)
			} satisfies TestRequestEvent);

			expect(response.status).toBe(302);
			const location = response.headers.get('Location');
			expect(location).toContain('https://vault.example.com/callback');
			expect(location).toContain('token=');
		});

		it('should include valid JWT in SSO cookie', async () => {
			const state = JSON.stringify({
				vaultId: 'vault-test-id',
				callbackUrl: 'https://vault.example.com/callback'
			});
			const url = new URL(`http://localhost/auth/callback?code=test-code&state=${state}`);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id',
						GOOGLE_CLIENT_SECRET: 'test-client-secret'
					}
				},
				fetch: createMockFetch(true)
			} satisfies TestRequestEvent);

			const setCookie = response.headers.get('Set-Cookie');
			// Extract token from cookie
			const match = setCookie?.match(/polyphony_sso=([^;]+)/);
			expect(match).toBeTruthy();
			const ssoToken = match![1];

			// JWT has 3 parts separated by dots
			const parts = ssoToken.split('.');
			expect(parts).toHaveLength(3);

			// Decode payload (base64url)
			const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
			expect(payload.email).toBe('user@example.com');
			expect(payload.name).toBe('Test User');
			expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
		});
	});
});
