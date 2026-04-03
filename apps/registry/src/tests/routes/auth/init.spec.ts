// Test OAuth initiation endpoint
/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../../routes/auth/+server.js';
import type { ErrorResponse } from '../../../lib/types/api.js';
import type { JWKS } from '@polyphony/shared/crypto';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { signToken } from '@polyphony/shared/crypto';

// Test key pair - generated once for all tests
let testPrivateKey: string;
let testPublicKeyJwk: object;

beforeEach(async () => {
	// Generate a fresh Ed25519 key pair for testing
	const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
	testPrivateKey = await exportPKCS8(keyPair.privateKey);
	const jwk = await exportJWK(keyPair.publicKey);
	jwk.kid = 'test-key-id';
	testPublicKeyJwk = jwk;
});

// Type for our GET handler parameters
interface AuthRequestEvent {
	url: URL;
	platform?: {
		env: {
			DB: D1Database;
			API_KEY: string;
			GOOGLE_CLIENT_ID: string;
		};
	};
	cookies?: {
		get: (name: string) => string | undefined;
	};
}

// Mock D1 database (no vault table - zero-storage)
const createMockDb = (includePrivateKey: boolean = false, privateKey?: string) =>
	({
		prepare: (sql: string) => {
			const queryResult = async () => {
				if (sql.includes('signing_keys') && includePrivateKey) {
					return {
						id: 'test-key-id',
						private_key: privateKey,
						public_key: JSON.stringify(testPublicKeyJwk)
					};
				}
				return null;
			};

			return {
				// D1 allows calling .first() directly (no bind) or .bind().first()
				first: queryResult,
				bind: (...args: unknown[]) => ({
					first: queryResult
				})
			};
		}
	}) as unknown as D1Database;

// Helper to create a valid SSO token
async function createValidSSOToken(privateKey: string): Promise<string> {
	return await signToken(
		{
			iss: 'https://polyphony.uk',
			sub: 'user@example.com',
			aud: 'polyphony-sso',
			nonce: 'test-nonce',
			email: 'user@example.com',
			name: 'Test User',
			picture: 'https://example.com/photo.jpg'
		},
		privateKey
	);
}

// Mock cookies helper
const createMockCookies = (cookieValue?: string) => ({
	get: (name: string) => (name === 'polyphony_sso' ? cookieValue : undefined)
});

describe('GET /auth', () => {
	it('should reject missing vault_id parameter', async () => {
		const url = new URL('http://localhost/auth');
		const response = await GET({
			url,
			platform: { env: { DB: createMockDb(), API_KEY: 'test', GOOGLE_CLIENT_ID: 'test-client-id' } }
		} satisfies AuthRequestEvent);

		expect(response.status).toBe(400);
		const data = (await response.json()) as ErrorResponse;
		expect(data.error).toContain('vault_id');
	});

	it('should reject missing callback parameter', async () => {
		const url = new URL('http://localhost/auth?vault_id=vault-test-id');
		const response = await GET({
			url,
			platform: { env: { DB: createMockDb(), API_KEY: 'test', GOOGLE_CLIENT_ID: 'test-client-id' } }
		} satisfies AuthRequestEvent);

		expect(response.status).toBe(400);
		const data = (await response.json()) as ErrorResponse;
		expect(data.error).toContain('callback');
	});

	it('should reject callback URL not on allowed domain', async () => {
		const url = new URL(
			'http://localhost/auth?vault_id=testorg&callback=https://evil.com/callback'
		);
		const response = await GET({
			url,
			platform: { env: { DB: createMockDb(), API_KEY: 'test', GOOGLE_CLIENT_ID: 'test-client-id' } }
		} satisfies AuthRequestEvent);

		expect(response.status).toBe(400);
		const data = (await response.json()) as ErrorResponse;
		expect(data.error).toContain('callback URL');
	});

	it('should redirect to Google OAuth with valid parameters', async () => {
		const url = new URL(
			'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
		);

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id'
					}
				}
			} satisfies AuthRequestEvent);

			// Should not reach here - redirect throws
			expect(true).toBe(false);
		} catch (redirect: any) {
			// SvelteKit redirect throws an error
			expect(redirect.status).toBe(302);
			const location = redirect.location;
			expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
			expect(location).toContain('client_id=test-client-id');
			expect(location).toContain('response_type=code');
			expect(location).toContain('scope=openid+email+profile');
		}
	});

	// ==========================================================================
	// SSO Cookie Tests (Issue #209)
	// ==========================================================================
	describe('SSO Cookie', () => {
		it('should skip OAuth and redirect with vault token when valid SSO cookie present', async () => {
			const ssoToken = await createValidSSOToken(testPrivateKey);
			const url = new URL(
				'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
			);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(true, testPrivateKey),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id'
					}
				},
				cookies: createMockCookies(ssoToken)
			} as unknown as Parameters<typeof GET>[0]);

			// Should return Response (not throw redirect)
			expect(response.status).toBe(302);
			const location = response.headers.get('Location');
			expect(location).toContain('https://testorg.polyphony.uk/auth/callback');
			expect(location).toContain('token=');
			// Should NOT go to Google OAuth
			expect(location).not.toContain('accounts.google.com');
		});

		it('should include valid vault JWT in redirect when SSO cookie used', async () => {
			const ssoToken = await createValidSSOToken(testPrivateKey);
			const url = new URL(
				'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
			);

			const response = await GET({
				url,
				platform: {
					env: {
						DB: createMockDb(true, testPrivateKey),
						API_KEY: 'test',
						GOOGLE_CLIENT_ID: 'test-client-id'
					}
				},
				cookies: createMockCookies(ssoToken)
			} as unknown as Parameters<typeof GET>[0]);

			const location = response.headers.get('Location')!;
			const callbackUrl = new URL(location);
			const vaultToken = callbackUrl.searchParams.get('token')!;

			// Vault token should be a valid JWT (3 parts)
			const parts = vaultToken.split('.');
			expect(parts.length).toBe(3);

			// Decode payload and check claims
			const payload = JSON.parse(atob(parts[1]));
			expect(payload.aud).toBe('testorg'); // Vault-specific audience
			expect(payload.email).toBe('user@example.com');
			expect(payload.iss).toBe('https://polyphony.uk');
		});

		it('should proceed to OAuth when SSO cookie is expired', async () => {
			// Create an expired token by manipulating time
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2025-01-01'));
			const expiredToken = await createValidSSOToken(testPrivateKey);
			vi.useRealTimers();

			const url = new URL(
				'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
			);

			try {
				await GET({
					url,
					platform: {
						env: {
							DB: createMockDb(true, testPrivateKey),
							API_KEY: 'test',
							GOOGLE_CLIENT_ID: 'test-client-id'
						}
					},
					cookies: createMockCookies(expiredToken)
				} as unknown as Parameters<typeof GET>[0]);

				expect(true).toBe(false); // Should throw redirect
			} catch (redirect: any) {
				// Should redirect to Google OAuth (expired SSO)
				expect(redirect.status).toBe(302);
				expect(redirect.location).toContain('accounts.google.com');
			}
		});

		it('should proceed to OAuth when SSO cookie is invalid', async () => {
			const url = new URL(
				'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
			);

			try {
				await GET({
					url,
					platform: {
						env: {
							DB: createMockDb(true, testPrivateKey),
							API_KEY: 'test',
							GOOGLE_CLIENT_ID: 'test-client-id'
						}
					},
					cookies: createMockCookies('invalid.jwt.token')
				} as unknown as Parameters<typeof GET>[0]);

				expect(true).toBe(false); // Should throw redirect
			} catch (redirect: any) {
				// Should redirect to Google OAuth (invalid SSO)
				expect(redirect.status).toBe(302);
				expect(redirect.location).toContain('accounts.google.com');
			}
		});

		it('should proceed to OAuth when no SSO cookie present', async () => {
			const url = new URL(
				'http://localhost/auth?vault_id=testorg&callback=https://testorg.polyphony.uk/auth/callback'
			);

			try {
				await GET({
					url,
					platform: {
						env: {
							DB: createMockDb(),
							API_KEY: 'test',
							GOOGLE_CLIENT_ID: 'test-client-id'
						}
					},
					cookies: createMockCookies(undefined)
				} as unknown as Parameters<typeof GET>[0]);

				expect(true).toBe(false); // Should throw redirect
			} catch (redirect: any) {
				// Should redirect to Google OAuth
				expect(redirect.status).toBe(302);
				expect(redirect.location).toContain('accounts.google.com');
			}
		});
	});
});
