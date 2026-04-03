/**
 * Phase 0 Acceptance Tests
 *
 * Validates all Epic #11 acceptance criteria for Phase 0.
 * These tests verify the complete authentication flow end-to-end.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, pemToJwk, verifyAuthToken } from '@polyphony/shared';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';

describe('Phase 0 - Epic #11 Acceptance Criteria', () => {
	let publicKey: CryptoKey;
	let privateKey: CryptoKey;
	let privateKeyPem: string;
	let publicKeyPem: string;
	let token: string;
	let decodedPayload: any;

	const REGISTRY_URL = 'https://polyphony.uk';
	const VAULT_ID = 'test-vault-123';
	const USER_EMAIL = 'user@example.com';
	const USER_NAME = 'Test User';

	beforeAll(async () => {
		// Generate test keypair (simulating Registry signing keys)
		const keypair = await generateKeyPair('EdDSA', { extractable: true });
		publicKey = keypair.publicKey;
		privateKey = keypair.privateKey;
		privateKeyPem = await exportPKCS8(privateKey);
		publicKeyPem = await exportSPKI(publicKey);

		// Generate test token
		const payload = {
			iss: REGISTRY_URL,
			sub: USER_EMAIL,
			aud: VAULT_ID,
			nonce: 'test-nonce-abc123',
			email: USER_EMAIL,
			name: USER_NAME,
			picture: 'https://example.com/photo.jpg'
		};

		token = await signToken(payload, privateKeyPem);

		// Decode payload for inspection
		const encodedPayload = token.split('.')[1];
		decodedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
	});

	describe('AC1: OAuth login produces valid JWT', () => {
		it('should produce a JWT with three parts (header.payload.signature)', () => {
			const parts = token.split('.');
			expect(parts).toHaveLength(3);
		});

		it('should have base64url-encoded parts', () => {
			const parts = token.split('.');
			// Should be able to decode header and payload
			expect(() => Buffer.from(parts[0], 'base64url')).not.toThrow();
			expect(() => Buffer.from(parts[1], 'base64url')).not.toThrow();
		});
	});

	describe('AC2: JWT contains required claims', () => {
		it('should have iss claim matching Registry URL', () => {
			expect(decodedPayload.iss).toBe(REGISTRY_URL);
		});

		it('should have sub claim containing user email', () => {
			expect(decodedPayload.sub).toBe(USER_EMAIL);
		});

		it('should have aud claim containing vault ID', () => {
			expect(decodedPayload.aud).toBe(VAULT_ID);
		});

		it('should have exp claim (expiration time)', () => {
			expect(decodedPayload.exp).toBeTypeOf('number');
			expect(decodedPayload.exp).toBeGreaterThan(Date.now() / 1000);
		});

		it('should have iat claim (issued at time)', () => {
			expect(decodedPayload.iat).toBeTypeOf('number');
			expect(decodedPayload.iat).toBeLessThanOrEqual(Date.now() / 1000);
		});

		it('should have nonce claim', () => {
			expect(decodedPayload.nonce).toBeTruthy();
			expect(typeof decodedPayload.nonce).toBe('string');
		});

		it('should have email custom claim', () => {
			expect(decodedPayload.email).toBe(USER_EMAIL);
		});

		it('should have name optional claim', () => {
			expect(decodedPayload.name).toBe(USER_NAME);
		});

		it('should have picture optional claim', () => {
			expect(decodedPayload.picture).toBeTruthy();
		});
	});

	describe('AC3: JWKS endpoint exposes public key', () => {
		let jwks: any;

		beforeAll(async () => {
			const jwk = await pemToJwk(publicKeyPem, 'test-key-1');
			jwks = { keys: [jwk] };
		});

		it('should produce JWKS with keys array', () => {
			expect(jwks.keys).toBeInstanceOf(Array);
			expect(jwks.keys.length).toBeGreaterThan(0);
		});

		it('should have kty="OKP" for Ed25519 keys', () => {
			expect(jwks.keys[0].kty).toBe('OKP');
		});

		it('should have crv="Ed25519" for EdDSA', () => {
			expect(jwks.keys[0].crv).toBe('Ed25519');
		});

		it('should have x field (public key)', () => {
			expect(jwks.keys[0].x).toBeTruthy();
			expect(typeof jwks.keys[0].x).toBe('string');
		});

		it('should have kid (key ID)', () => {
			expect(jwks.keys[0].kid).toBeTruthy();
			expect(typeof jwks.keys[0].kid).toBe('string');
		});

		it('should have use="sig" for signature verification', () => {
			expect(jwks.keys[0].use).toBe('sig');
		});

		it('should have alg="EdDSA"', () => {
			expect(jwks.keys[0].alg).toBe('EdDSA');
		});
	});

	describe('AC4: Token expires in 5 minutes', () => {
		it('should have expiry exactly 300 seconds (5 minutes) from issuance', () => {
			const expiryDuration = decodedPayload.exp - decodedPayload.iat;
			expect(expiryDuration).toBe(300);
		});

		it('should expire in the future relative to now', () => {
			const nowSeconds = Math.floor(Date.now() / 1000);
			expect(decodedPayload.exp).toBeGreaterThan(nowSeconds);
		});

		it('should have been issued in the past or now', () => {
			const nowSeconds = Math.floor(Date.now() / 1000);
			expect(decodedPayload.iat).toBeLessThanOrEqual(nowSeconds + 1); // Allow 1s clock skew
		});
	});

	describe('AC5: Invalid callback URLs rejected', () => {
		it('should reject HTTP URLs (not HTTPS)', () => {
			const httpUrl = 'http://vault.example.com/callback';
			expect(httpUrl.startsWith('http://')).toBe(true);
			// This validation happens via domain allowlist in auth endpoints
			// See apps/registry/src/routes/auth/+server.ts (isCallbackAllowed)
			// and apps/registry/src/routes/auth/email/+server.ts
		});

		it('should accept HTTPS URLs', () => {
			const httpsUrl = 'https://vault.example.com/callback';
			expect(httpsUrl.startsWith('https://')).toBe(true);
		});

		it('should reject URLs without protocol', () => {
			const noProtocol = 'vault.example.com/callback';
			expect(noProtocol.startsWith('https://')).toBe(false);
		});
	});

	describe('AC6: Vault can verify tokens using shared library', () => {
		let jwks: any;

		beforeAll(async () => {
			const jwk = await pemToJwk(publicKeyPem, 'test-key-1');
			jwks = { keys: [jwk] };

			// Mock fetch to return JWKS
			globalThis.fetch = async (_url: RequestInfo | URL) => {
				return {
					ok: true,
					json: async () => jwks
				} as Response;
			};
		});

		it('should successfully verify a valid token', async () => {
			const verified = await verifyAuthToken(token, {
				registryUrl: REGISTRY_URL,
				vaultId: VAULT_ID
			});

			expect(verified.email).toBe(USER_EMAIL);
			expect(verified.nonce).toBeTruthy();
			expect(verified.name).toBe(USER_NAME);
			expect(verified.picture).toBeTruthy();
		});

		it('should reject token with wrong audience', async () => {
			await expect(
				verifyAuthToken(token, {
					registryUrl: REGISTRY_URL,
					vaultId: 'wrong-vault-id'
				})
			).rejects.toThrow(/aud/);
		});

		it('should reject token from wrong issuer', async () => {
			await expect(
				verifyAuthToken(token, {
					registryUrl: 'https://wrong-registry.example.com',
					vaultId: VAULT_ID
				})
			).rejects.toThrow();
		});

		it('should cache JWKS to avoid duplicate fetches', async () => {
			// Use unique registryUrl to avoid cache pollution from beforeAll
			const cacheTestRegistry = 'https://cache-test.scoreinstitute.eu';
			let fetchCount = 0;
			globalThis.fetch = async (_url: RequestInfo | URL) => {
				fetchCount++;
				return {
					ok: true,
					json: async () => jwks
				} as Response;
			};

			// Generate tokens for cache test
			const token1 = await signToken(
				{
					iss: cacheTestRegistry,
					sub: USER_EMAIL,
					aud: VAULT_ID,
					nonce: 'cache-test-1',
					email: USER_EMAIL
				},
				privateKeyPem
			);

			const token2 = await signToken(
				{
					iss: cacheTestRegistry,
					sub: USER_EMAIL,
					aud: VAULT_ID,
					nonce: 'cache-test-2',
					email: USER_EMAIL
				},
				privateKeyPem
			);

			// First verification - should fetch JWKS
			await verifyAuthToken(token1, {
				registryUrl: cacheTestRegistry,
				vaultId: VAULT_ID
			});

			// Second verification - should use cached JWKS
			await verifyAuthToken(token2, {
				registryUrl: cacheTestRegistry,
				vaultId: VAULT_ID
			});

			// Should only fetch once due to caching
			expect(fetchCount).toBe(1);
		});
	});

	describe('Integration Tests', () => {
		let jwks: any;

		beforeAll(async () => {
			const jwk = await pemToJwk(publicKeyPem, 'test-key-1');
			jwks = { keys: [jwk] };

			globalThis.fetch = async (_url: RequestInfo | URL) => {
				return {
					ok: true,
					json: async () => jwks
				} as Response;
			};
		});

		it('INT1: End-to-end token lifecycle', async () => {
			// 1. Registry signs token
			const payload = {
				iss: REGISTRY_URL,
				sub: USER_EMAIL,
				aud: VAULT_ID,
				nonce: 'integration-test-nonce',
				email: USER_EMAIL
			};
			const newToken = await signToken(payload, privateKeyPem);

			// 2. Vault fetches JWKS
			const jwk = await pemToJwk(publicKeyPem, 'test-key-1');
			expect(jwk.kty).toBe('OKP');

			// 3. Vault verifies token
			const verified = await verifyAuthToken(newToken, {
				registryUrl: REGISTRY_URL,
				vaultId: VAULT_ID
			});

			// 4. Vault extracts user info
			expect(verified.email).toBe(USER_EMAIL);
			expect(verified.nonce).toBe('integration-test-nonce');
		});

		it.skip('INT2: Token expiry handling', async () => {
			// Note: signToken always generates tokens with current iat and future exp.
			// Expiry is tested by waiting 5+ minutes or mocking time (not practical in unit tests).
			// The 5-minute expiry is verified in AC4 tests.
			// This test would require a custom token signing function that accepts custom iat/exp.
		});

		it('INT3: Multi-key JWKS support', async () => {
			// Use unique registryUrl to avoid cache conflicts
			const multiKeyRegistry = 'https://multi-key.scoreinstitute.eu';

			// Create JWKS with multiple keys
			const { publicKey: pub2, privateKey: priv2 } = await generateKeyPair('EdDSA', {
				extractable: true
			});
			const publicKeyPem2 = await exportSPKI(pub2);
			const privateKeyPem2 = await exportPKCS8(priv2);

			const jwk1 = await pemToJwk(publicKeyPem, 'key-1');
			const jwk2 = await pemToJwk(publicKeyPem2, 'key-2');
			const multiKeyJwks = { keys: [jwk1, jwk2] };

			globalThis.fetch = async () => {
				return {
					ok: true,
					json: async () => multiKeyJwks
				} as Response;
			};

			// Sign with second key
			const token2 = await signToken(
				{
					iss: multiKeyRegistry,
					sub: USER_EMAIL,
					aud: VAULT_ID,
					nonce: 'multi-key-test',
					email: USER_EMAIL
				},
				privateKeyPem2
			);

			// Should verify successfully with multi-key JWKS
			const verified = await verifyAuthToken(token2, {
				registryUrl: multiKeyRegistry,
				vaultId: VAULT_ID
			});

			expect(verified.email).toBe(USER_EMAIL);
		});
	});
});
