// Tests for GET /auth/verify endpoint
// Issue #156

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../../routes/auth/verify/+server';

// Mock the auth codes module
vi.mock('$lib/server/auth-codes', () => ({
	verifyCode: vi.fn()
}));

// Mock the JWT signing
vi.mock('@polyphony/shared/crypto', () => ({
	signToken: vi.fn().mockResolvedValue('mock-jwt-token')
}));

// Mock nanoid
vi.mock('nanoid', () => ({
	nanoid: vi.fn().mockReturnValue('mock-nonce-123')
}));

import { verifyCode } from '$lib/server/auth-codes';
import { signToken } from '@polyphony/shared/crypto';

interface RedirectError {
	status: number;
	location: string;
}

function createMockDb(signingKey?: string) {
	return {
		prepare: () => ({
			bind: () => ({
				first: async () => (signingKey ? { private_key: signingKey } : null)
			}),
			// Some queries use .first() directly without .bind()
			first: async () => (signingKey ? { private_key: signingKey } : null)
		})
	} as unknown as D1Database;
}

describe('GET /auth/verify', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should redirect to error page when code is missing', async () => {
		const url = new URL('http://localhost/auth/verify?email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			expect(redirect.status).toBe(303);
			expect(redirect.location).toContain('/auth/error');
			expect(redirect.location).toContain('Missing');
		}
	});

	it('should redirect to error page when email is missing', async () => {
		const url = new URL('http://localhost/auth/verify?code=ABC123');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			expect(redirect.status).toBe(303);
			expect(redirect.location).toContain('/auth/error');
		}
	});

	it('should redirect to error page for invalid code', async () => {
		vi.mocked(verifyCode).mockResolvedValue({
			success: false,
			error: 'Invalid code'
		});

		const url = new URL('http://localhost/auth/verify?code=INVALID&email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			expect(redirect.status).toBe(303);
			expect(redirect.location).toContain('/auth/error');
			expect(redirect.location).toContain('Invalid');
		}
	});

	it('should redirect to error page for expired code', async () => {
		vi.mocked(verifyCode).mockResolvedValue({
			success: false,
			error: 'Code expired'
		});

		const url = new URL('http://localhost/auth/verify?code=ABC123&email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			expect(redirect.location).toContain('expired');
		}
	});

	it('should redirect to error page for used code', async () => {
		vi.mocked(verifyCode).mockResolvedValue({
			success: false,
			error: 'Code already used'
		});

		const url = new URL('http://localhost/auth/verify?code=ABC123&email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			// SvelteKit uses + for spaces in query params
			expect(redirect.location).toContain('already+used');
		}
	});

	it('should sign JWT and redirect to vault callback on success', async () => {
		vi.mocked(verifyCode).mockResolvedValue({
			success: true,
			email: 'user@example.com',
			vaultId: 'vault-123',
			callbackUrl: 'https://vault.example.com/api/auth/callback'
		});

		const url = new URL('http://localhost/auth/verify?code=ABC123&email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-signing-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
			expect.fail('Should have thrown a redirect');
		} catch (e: unknown) {
			const redirect = e as RedirectError;
			expect(redirect.status).toBe(303);

			// Check redirect is to vault callback with token
			const redirectUrl = new URL(redirect.location);
			expect(redirectUrl.origin).toBe('https://vault.example.com');
			expect(redirectUrl.pathname).toBe('/api/auth/callback');
			expect(redirectUrl.searchParams.get('token')).toBe('mock-jwt-token');
		}
	});

	it('should sign JWT with correct claims', async () => {
		vi.mocked(verifyCode).mockResolvedValue({
			success: true,
			email: 'user@example.com',
			vaultId: 'vault-123',
			callbackUrl: 'https://vault.example.com/api/auth/callback'
		});

		const url = new URL('http://localhost/auth/verify?code=ABC123&email=user@example.com');

		try {
			await GET({
				url,
				platform: {
					env: {
						DB: createMockDb('test-signing-key')
					}
				}
			} as unknown as Parameters<typeof GET>[0]);
		} catch {
			// Expected redirect
		}

		// Verify signToken was called with correct claims
		expect(signToken).toHaveBeenCalledWith(
			expect.objectContaining({
				iss: 'https://polyphony.uk',
				sub: 'user@example.com',
				aud: 'vault-123',
				email: 'user@example.com',
				nonce: 'mock-nonce-123'
			}),
			'test-signing-key'
		);

		// Should NOT include name/picture for email auth
		const tokenPayload = vi.mocked(signToken).mock.calls[0][0];
		expect(tokenPayload).not.toHaveProperty('name');
		expect(tokenPayload).not.toHaveProperty('picture');
	});
});
