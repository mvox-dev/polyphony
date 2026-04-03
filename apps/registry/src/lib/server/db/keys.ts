// Signing key database operations
import { nanoid } from 'nanoid';

interface KeyInput {
	public_key: string;
	private_key: string;
}

interface SigningKey {
	id: string;
	algorithm: string;
	public_key: string;
	private_key: string;
	created_at: string;
	revoked_at: string | null;
}

export async function storeKey(db: D1Database, input: KeyInput): Promise<SigningKey> {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.prepare(
			'INSERT INTO signing_keys (id, algorithm, public_key, private_key, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)'
		)
		.bind(id, 'EdDSA', input.public_key, input.private_key, now)
		.run();

	return {
		id,
		algorithm: 'EdDSA',
		public_key: input.public_key,
		private_key: input.private_key,
		created_at: now,
		revoked_at: null
	};
}

export async function getActiveKey(db: D1Database): Promise<SigningKey | null> {
	const result = await db
		.prepare('SELECT * FROM signing_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1')
		.first<SigningKey>();

	return result || null;
}

export async function revokeKey(db: D1Database, id: string): Promise<void> {
	const now = new Date().toISOString();

	await db.prepare('UPDATE signing_keys SET revoked_at = ? WHERE id = ?').bind(now, id).run();
}
