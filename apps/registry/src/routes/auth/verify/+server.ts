// Email verification endpoint
// GET /auth/verify?code=ABC123&email=user@example.com
// Issue #156

import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyCode } from '$lib/server/auth-codes';
import { signToken } from '@polyphony/shared/crypto';
import { nanoid } from 'nanoid';

interface CloudflarePlatform {
	env: {
		DB: D1Database;
	};
}

/** Get active signing key from database */
async function getSigningKey(db: D1Database): Promise<string> {
	const key = await db
		.prepare(
			'SELECT private_key FROM signing_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'
		)
		.first<{ private_key: string }>();
	if (!key) throw error(500, 'Authentication service misconfigured');
	return key.private_key;
}

/** Create signed JWT for verified user */
async function createAuthToken(db: D1Database, email: string, vaultId: string): Promise<string> {
	const privateKey = await getSigningKey(db);
	return signToken(
		{ iss: 'https://polyphony.uk', sub: email, aud: vaultId, nonce: nanoid(), email },
		privateKey
	);
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = (platform as CloudflarePlatform | undefined)?.env?.DB;
	if (!db) throw error(500, 'Database unavailable');

	const code = url.searchParams.get('code');
	const email = url.searchParams.get('email');
	if (!code || !email)
		throw redirect(303, `/auth/error?message=${encodeURIComponent('Missing code or email')}`);

	const result = await verifyCode(db, code, email);
	if (!result.success) {
		const params = new URLSearchParams({ message: result.error || 'Verification failed' });
		if (result.callbackUrl) params.set('callback', result.callbackUrl);
		throw redirect(303, `/auth/error?${params.toString()}`);
	}

	const token = await createAuthToken(db, result.email!, result.vaultId!);
	const callbackUrl = new URL(result.callbackUrl!);
	callbackUrl.searchParams.set('token', token);
	throw redirect(303, callbackUrl.toString());
};
