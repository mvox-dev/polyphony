// Auth code generation and verification
// Issue #156 - Email Authentication

const CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Exclude 0/O, 1/I/L
const CODE_EXPIRY_MINUTES = 10;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Generate a random 6-character verification code */
export function generateCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	return Array.from(bytes)
		.map((b) => CODE_CHARS[b % CODE_CHARS.length])
		.join('');
}

export interface CreateCodeResult {
	success: boolean;
	code?: string;
	error?: string;
}

interface RateLimitRecord {
	attempts: number;
	window_start: string;
}

/** Check rate limit and return error message if exceeded */
async function checkRateLimit(db: D1Database, email: string): Promise<string | null> {
	const record = await db
		.prepare('SELECT attempts, window_start FROM email_rate_limits WHERE email = ?')
		.bind(email)
		.first<RateLimitRecord>();

	if (!record) return null;

	const windowEnd = new Date(record.window_start + 'Z').getTime() + RATE_LIMIT_WINDOW_MS;
	const now = Date.now();

	if (now < windowEnd && record.attempts >= RATE_LIMIT_MAX) {
		const minutesLeft = Math.ceil((windowEnd - now) / 60000);
		return `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`;
	}
	return null;
}

/** Update or create rate limit record */
async function updateRateLimit(db: D1Database, email: string): Promise<void> {
	const record = await db
		.prepare('SELECT attempts, window_start FROM email_rate_limits WHERE email = ?')
		.bind(email)
		.first<RateLimitRecord>();

	if (!record) {
		await db
			.prepare(
				"INSERT INTO email_rate_limits (email, attempts, window_start) VALUES (?, 1, datetime('now'))"
			)
			.bind(email)
			.run();
		return;
	}

	const windowEnd = new Date(record.window_start + 'Z').getTime() + RATE_LIMIT_WINDOW_MS;
	if (Date.now() >= windowEnd) {
		await db
			.prepare(
				"UPDATE email_rate_limits SET attempts = 1, window_start = datetime('now') WHERE email = ?"
			)
			.bind(email)
			.run();
	} else {
		await db
			.prepare('UPDATE email_rate_limits SET attempts = attempts + 1 WHERE email = ?')
			.bind(email)
			.run();
	}
}

/** Store a new auth code in the database */
async function storeAuthCode(
	db: D1Database,
	email: string,
	code: string,
	vaultId: string,
	callbackUrl: string
): Promise<void> {
	const id = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
	await db
		.prepare(
			`INSERT INTO email_auth_codes (id, email, code, vault_id, callback_url, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, email, code, vaultId, callbackUrl, expiresAt)
		.run();
}

/** Create a new auth code for email verification (with rate limiting) */
export async function createAuthCode(
	db: D1Database,
	email: string,
	vaultId: string,
	callbackUrl: string
): Promise<CreateCodeResult> {
	const normalizedEmail = email.toLowerCase().trim();

	const rateLimitError = await checkRateLimit(db, normalizedEmail);
	if (rateLimitError) return { success: false, error: rateLimitError };

	await updateRateLimit(db, normalizedEmail);
	const code = generateCode();
	await storeAuthCode(db, normalizedEmail, code, vaultId, callbackUrl);

	return { success: true, code };
}

export interface VerifyCodeResult {
	success: boolean;
	email?: string;
	vaultId?: string;
	callbackUrl?: string;
	error?: string;
}

/**
 * Verify an auth code and return the associated data
 * Codes are single-use and expire after 10 minutes
 */
export async function verifyCode(
	db: D1Database,
	code: string,
	email: string
): Promise<VerifyCodeResult> {
	const normalizedEmail = email.toLowerCase().trim();
	const normalizedCode = code.toUpperCase().trim();

	const record = await db
		.prepare(
			`SELECT id, email, vault_id, callback_url, expires_at, used_at
       FROM email_auth_codes
       WHERE code = ? AND email = ?`
		)
		.bind(normalizedCode, normalizedEmail)
		.first<{
			id: string;
			email: string;
			vault_id: string;
			callback_url: string;
			expires_at: string;
			used_at: string | null;
		}>();

	if (!record) {
		return { success: false, error: 'Invalid code' };
	}

	if (record.used_at) {
		return { success: false, error: 'Code already used' };
	}

	const expiresAt = new Date(record.expires_at);
	if (expiresAt < new Date()) {
		return { success: false, error: 'Code expired' };
	}

	// Mark code as used
	await db
		.prepare("UPDATE email_auth_codes SET used_at = datetime('now') WHERE id = ?")
		.bind(record.id)
		.run();

	return {
		success: true,
		email: record.email,
		vaultId: record.vault_id,
		callbackUrl: record.callback_url
	};
}

/**
 * Clean up expired codes and old rate limit records
 * Call periodically (e.g., via scheduled worker)
 */
export async function cleanupExpiredRecords(
	db: D1Database
): Promise<{ codes: number; limits: number }> {
	// Delete expired codes older than 24 hours
	const codesResult = await db
		.prepare("DELETE FROM email_auth_codes WHERE expires_at < datetime('now', '-24 hours')")
		.run();

	// Delete rate limit records older than 24 hours
	const limitsResult = await db
		.prepare("DELETE FROM email_rate_limits WHERE window_start < datetime('now', '-24 hours')")
		.run();

	return {
		codes: codesResult.meta.changes ?? 0,
		limits: limitsResult.meta.changes ?? 0
	};
}
