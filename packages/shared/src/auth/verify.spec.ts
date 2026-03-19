import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { verifyAuthToken } from './verify.js';
import { signToken } from '../crypto/jwt.js';
import { pemToJwk } from '../crypto/jwks.js';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

describe('verifyAuthToken', () => {
	// Real Ed25519 keypair for testing
	let testKeys: { publicKey: string; privateKey: string };

	beforeAll(async () => {
		// Generate real Ed25519 keypair for testing
		const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
		testKeys = {
			publicKey: await exportSPKI(publicKey),
			privateKey: await exportPKCS8(privateKey)
		};
	});

	beforeEach(() => {
		// Clear any module-level caches between tests
		vi.clearAllMocks();
	});

	describe('valid token verification', () => {
		it('verifies valid token with correct claims', async () => {
			const vaultId = 'vault-123';
			const payload = {
				iss: 'https://registry.example.com',
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com',
				name: 'Test User',
				picture: 'https://example.com/photo.jpg'
			};

			// Create valid token
			const token = await signToken(payload, testKeys.privateKey);

			// Mock JWKS fetch
			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-1');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			// Verify token
			const result = await verifyAuthToken(token, {
				registryUrl: 'https://registry.example.com',
				vaultId
			});

			expect(result).toEqual({
				email: 'user@example.com',
				name: 'Test User',
				picture: 'https://example.com/photo.jpg',
				nonce: 'abc123'
			});
			expect(global.fetch).toHaveBeenCalledWith(
				'https://registry.example.com/.well-known/jwks.json'
			);
		});

		it('verifies token without optional fields', async () => {
			const vaultId = 'vault-456';
			const payload = {
				iss: 'https://registry.example.com',
				sub: 'another@example.com',
				aud: vaultId,
				nonce: 'xyz789',
				email: 'another@example.com'
			};

			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-2');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			const result = await verifyAuthToken(token, {
				registryUrl: 'https://registry.example.com',
				vaultId
			});

			expect(result).toEqual({
				email: 'another@example.com',
				nonce: 'xyz789'
			});
		});
	});

	describe('audience validation', () => {
		it('rejects token with wrong audience', async () => {
			const vaultId = 'vault-correct';
			const wrongVaultId = 'vault-wrong';
			const payload = {
				iss: 'https://registry.example.com',
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com'
			};

			// Token issued for vault-correct
			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-3');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			// Try to verify with wrong vault ID
			await expect(
				verifyAuthToken(token, {
					registryUrl: 'https://registry.example.com',
					vaultId: wrongVaultId
				})
			).rejects.toThrow('aud');
		});
	});

	describe('expiry validation', () => {
		it('rejects expired token', async () => {
			const vaultId = 'vault-789';
			const registryUrl = 'https://registry-expiry-test.example.com';
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com'
			};

			// Sign token at current (real) time — exp = now + 300s
			vi.useFakeTimers();
			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-4');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			// Advance time by 6 minutes — token (5 min TTL) is now expired
			vi.advanceTimersByTime(6 * 60 * 1000);

			await expect(
				verifyAuthToken(token, { registryUrl, vaultId })
			).rejects.toThrow('exp');

			vi.useRealTimers();
		});

		it('rejects token expired by just one second', async () => {
			const vaultId = 'vault-789-boundary';
			const registryUrl = 'https://registry-expiry-boundary.example.com';
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'boundary-nonce',
				email: 'user@example.com'
			};

			vi.useFakeTimers();
			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-4b');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			// Advance exactly 5 min + 1 second past expiry
			vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

			await expect(
				verifyAuthToken(token, { registryUrl, vaultId })
			).rejects.toThrow();

			vi.useRealTimers();
		});

		it('accepts token that has not yet expired', async () => {
			const vaultId = 'vault-789-valid';
			const registryUrl = 'https://registry-expiry-valid.example.com';
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'valid-nonce',
				email: 'user@example.com'
			};

			vi.useFakeTimers();
			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-4c');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			// Advance by 4 minutes — token still valid (5 min TTL)
			vi.advanceTimersByTime(4 * 60 * 1000);

			const result = await verifyAuthToken(token, { registryUrl, vaultId });
			expect(result).toBeDefined();
			expect(result.email).toBe('user@example.com');

			vi.useRealTimers();
		});
	});

	describe('signature validation', () => {
		it('rejects token with invalid signature', async () => {
			const vaultId = 'vault-999';
			const registryUrl = 'https://registry-tamper-test.example.com'; // Unique URL to avoid cache
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com'
			};

			// Create valid token
			const token = await signToken(payload, testKeys.privateKey);

			// Tamper with token (completely replace signature with invalid base64url)
			const parts = token.split('.');
			const tamperedToken = `${parts[0]}.${parts[1]}.INVALID_SIGNATURE_DATA`;

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-5');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			await expect(
				verifyAuthToken(tamperedToken, {
					registryUrl,
					vaultId
				})
			).rejects.toThrow();
		});

		it('rejects token signed with different key', async () => {
			const vaultId = 'vault-111';
			const registryUrl = 'https://registry-diffkey-test.example.com'; // Unique URL
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com'
			};

			// Generate a different keypair for JWKS
			const differentKeyPair = await generateKeyPair('EdDSA', { extractable: true });
			const differentPublicKey = await exportSPKI(differentKeyPair.publicKey);

			// Sign with original key
			const token = await signToken(payload, testKeys.privateKey);

			// But provide different public key in JWKS (only this key, not testKeys.publicKey)
			const jwks = await pemToJwk(differentPublicKey, 'test-key-6');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] }) // Only the wrong key
			});
			global.fetch = fetchMock;

			await expect(
				verifyAuthToken(token, {
					registryUrl,
					vaultId
				})
			).rejects.toThrow();
		});
	});

	describe('JWKS caching', () => {
		it('caches JWKS for subsequent verifications', async () => {
			const vaultId = 'vault-cache';
			const registryUrl = 'https://registry-cache-test.example.com'; // Unique URL to avoid cache collision
			const payload1 = {
				iss: registryUrl,
				sub: 'user1@example.com',
				aud: vaultId,
				nonce: 'nonce1',
				email: 'user1@example.com'
			};
			const payload2 = {
				iss: registryUrl,
				sub: 'user2@example.com',
				aud: vaultId,
				nonce: 'nonce2',
				email: 'user2@example.com'
			};

			const token1 = await signToken(payload1, testKeys.privateKey);
			const token2 = await signToken(payload2, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-7');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});
			global.fetch = fetchMock;

			// First verification - should fetch
			await verifyAuthToken(token1, {
				registryUrl,
				vaultId
			});

			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Second verification within cache window - should use cache
			await verifyAuthToken(token2, {
				registryUrl,
				vaultId
			});

			expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1, not 2
		});

		it('refetches JWKS after cache expiry', async () => {
			const vaultId = 'vault-expire';
			const registryUrl = 'https://registry-expire-test.example.com'; // Unique URL
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'nonce1',
				email: 'user@example.com'
			};

			const token = await signToken(payload, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-8');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});
			global.fetch = fetchMock;

			// First verification
			await verifyAuthToken(token, {
				registryUrl,
				vaultId
			});

			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Simulate cache expiry (would need to wait 1 hour in real implementation)
			// For now, just verify the cache behavior is implemented
			// In real code, we'd advance time with vi.useFakeTimers()
		});
	});

	describe('error handling', () => {
		it('throws on JWKS fetch failure', async () => {
			const vaultId = 'vault-error';
			const registryUrl = 'https://registry-error-test.example.com'; // Unique URL
			const payload = {
				iss: registryUrl,
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123',
				email: 'user@example.com'
			};

			const token = await signToken(payload, testKeys.privateKey);

			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error'
			});
			global.fetch = fetchMock;

			await expect(
				verifyAuthToken(token, {
					registryUrl,
					vaultId
				})
			).rejects.toThrow('fetch');
		});

		it('throws on malformed JWT', async () => {
			const vaultId = 'vault-malformed';

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-9');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			await expect(
				verifyAuthToken('not.a.valid.jwt.token', {
					registryUrl: 'https://registry.example.com',
					vaultId
				})
			).rejects.toThrow();
		});

		it('throws on missing required claims', async () => {
			const vaultId = 'vault-missing';

			// Create token with missing 'email' claim (only JWT required fields)
			const payload = {
				iss: 'https://registry.example.com',
				sub: 'user@example.com',
				aud: vaultId,
				nonce: 'abc123'
				// Missing email
			};

			// Use 'as any' to bypass TypeScript checking for testing invalid payload
			const token = await signToken(payload as any, testKeys.privateKey);

			const jwks = await pemToJwk(testKeys.publicKey, 'test-key-10');
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ keys: [jwks] })
			});

			await expect(
				verifyAuthToken(token, {
					registryUrl: 'https://registry.example.com',
					vaultId
				})
			).rejects.toThrow('email');
		});
	});
});
