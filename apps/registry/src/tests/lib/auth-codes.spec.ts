// Tests for auth code generation and verification
// Issue #156

import { describe, it, expect, beforeEach } from 'vitest';
import { generateCode, createAuthCode, verifyCode } from '../../lib/server/auth-codes';

// Mock D1 database for testing
function createMockDb() {
	const emailAuthCodes = new Map<
		string,
		{
			id: string;
			email: string;
			code: string;
			vault_id: string;
			callback_url: string;
			expires_at: string;
			used_at: string | null;
		}
	>();

	const rateLimits = new Map<string, { attempts: number; window_start: string }>();

	return {
		_codes: emailAuthCodes,
		_limits: rateLimits,

		prepare: (sql: string) => {
			return {
				bind: (...args: unknown[]) => {
					// Rate limit queries
					if (sql.includes('FROM email_rate_limits')) {
						const email = (args[0] as string).toLowerCase();
						return {
							first: async () => rateLimits.get(email) || null
						};
					}

					// Rate limit insert
					if (sql.includes('INSERT INTO email_rate_limits')) {
						const email = (args[0] as string).toLowerCase();
						// Store without trailing Z (like SQLite datetime('now'))
						rateLimits.set(email, {
							attempts: 1,
							window_start: new Date().toISOString().replace('Z', '')
						});
						return { run: async () => ({}) };
					}

					// Rate limit update
					if (sql.includes('UPDATE email_rate_limits') && sql.includes('attempts = 1')) {
						const email = (args[0] as string).toLowerCase();
						rateLimits.set(email, {
							attempts: 1,
							window_start: new Date().toISOString().replace('Z', '')
						});
						return { run: async () => ({}) };
					}

					if (sql.includes('UPDATE email_rate_limits') && sql.includes('attempts + 1')) {
						const email = (args[0] as string).toLowerCase();
						const current = rateLimits.get(email);
						if (current) {
							current.attempts++;
						}
						return { run: async () => ({}) };
					}

					// Auth code insert
					if (sql.includes('INSERT INTO email_auth_codes')) {
						const [id, email, code, vaultId, callbackUrl, expiresAt] = args as string[];
						emailAuthCodes.set(code, {
							id,
							email: email.toLowerCase(),
							code,
							vault_id: vaultId,
							callback_url: callbackUrl,
							expires_at: expiresAt,
							used_at: null
						});
						return { run: async () => ({}) };
					}

					// Auth code lookup
					if (sql.includes('FROM email_auth_codes') && sql.includes('WHERE code')) {
						const [code, email] = args as string[];
						const record = emailAuthCodes.get(code.toUpperCase());
						if (record && record.email === email.toLowerCase()) {
							return { first: async () => record };
						}
						return { first: async () => null };
					}

					// Mark code as used
					if (sql.includes('UPDATE email_auth_codes SET used_at')) {
						const id = args[0] as string;
						for (const record of emailAuthCodes.values()) {
							if (record.id === id) {
								record.used_at = new Date().toISOString();
							}
						}
						return { run: async () => ({}) };
					}

					return {
						first: async () => null,
						run: async () => ({})
					};
				}
			};
		}
	} as unknown as D1Database & {
		_codes: Map<string, unknown>;
		_limits: Map<string, { attempts: number; window_start: string }>;
	};
}

describe('generateCode', () => {
	it('should generate a 6-character code', () => {
		const code = generateCode();
		expect(code).toHaveLength(6);
	});

	it('should only contain uppercase alphanumeric characters', () => {
		for (let i = 0; i < 100; i++) {
			const code = generateCode();
			expect(code).toMatch(/^[A-Z0-9]+$/);
		}
	});

	it('should not contain confusing characters (0, O, 1, I, L)', () => {
		for (let i = 0; i < 100; i++) {
			const code = generateCode();
			expect(code).not.toMatch(/[0OIL1]/);
		}
	});

	it('should generate unique codes', () => {
		const codes = new Set<string>();
		for (let i = 0; i < 100; i++) {
			codes.add(generateCode());
		}
		// With 6 chars from 30+ char alphabet, collisions should be extremely rare
		expect(codes.size).toBeGreaterThan(95);
	});
});

describe('createAuthCode', () => {
	let mockDb: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		mockDb = createMockDb();
	});

	it('should create a valid auth code', async () => {
		const result = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		expect(result.success).toBe(true);
		expect(result.code).toBeDefined();
		expect(result.code).toHaveLength(6);
		expect(result.error).toBeUndefined();
	});

	it('should normalize email to lowercase', async () => {
		const result = await createAuthCode(
			mockDb,
			'USER@EXAMPLE.COM',
			'vault-123',
			'https://vault.example.com/callback'
		);

		expect(result.success).toBe(true);
		expect(mockDb._limits.has('user@example.com')).toBe(true);
	});

	it('should enforce rate limiting after 3 attempts', async () => {
		// First 3 attempts should succeed
		for (let i = 0; i < 3; i++) {
			const result = await createAuthCode(
				mockDb,
				'user@example.com',
				'vault-123',
				'https://vault.example.com/callback'
			);
			expect(result.success).toBe(true);
		}

		// 4th attempt should fail
		const result = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('Too many attempts');
	});
});

describe('verifyCode', () => {
	let mockDb: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		mockDb = createMockDb();
	});

	it('should verify a valid code', async () => {
		// Create a code first
		const createResult = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		// Verify it
		const verifyResult = await verifyCode(mockDb, createResult.code!, 'user@example.com');

		expect(verifyResult.success).toBe(true);
		expect(verifyResult.email).toBe('user@example.com');
		expect(verifyResult.vaultId).toBe('vault-123');
		expect(verifyResult.callbackUrl).toBe('https://vault.example.com/callback');
	});

	it('should reject invalid code', async () => {
		const result = await verifyCode(mockDb, 'INVALID', 'user@example.com');

		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid code');
	});

	it('should reject code with wrong email', async () => {
		// Create a code
		const createResult = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		// Try to verify with different email
		const result = await verifyCode(mockDb, createResult.code!, 'other@example.com');

		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid code');
	});

	it('should reject already used code', async () => {
		// Create and verify a code
		const createResult = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		await verifyCode(mockDb, createResult.code!, 'user@example.com');

		// Try to use again
		const result = await verifyCode(mockDb, createResult.code!, 'user@example.com');

		expect(result.success).toBe(false);
		expect(result.error).toBe('Code already used');
	});

	it('should reject expired code', async () => {
		// Create a code
		const createResult = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		// Manually expire the code
		const code = mockDb._codes.get(createResult.code!) as { expires_at: string };
		code.expires_at = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

		// Try to verify
		const result = await verifyCode(mockDb, createResult.code!, 'user@example.com');

		expect(result.success).toBe(false);
		expect(result.error).toBe('Code expired');
	});

	it('should normalize code to uppercase', async () => {
		const createResult = await createAuthCode(
			mockDb,
			'user@example.com',
			'vault-123',
			'https://vault.example.com/callback'
		);

		// Verify with lowercase code
		const result = await verifyCode(mockDb, createResult.code!.toLowerCase(), 'user@example.com');

		expect(result.success).toBe(true);
	});
});
