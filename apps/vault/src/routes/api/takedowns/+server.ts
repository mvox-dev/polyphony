// GET /api/takedowns - Admin-only list of takedown requests (org-scoped)
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTakedownRequests } from '$lib/server/db/takedowns';
import { getAuthenticatedMember, assertAdmin } from '$lib/server/auth/middleware';

export const GET: RequestHandler = async ({ url, platform, cookies, locals }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const member = await getAuthenticatedMember(db, cookies, locals.org.id);
	assertAdmin(member);

	const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
	const takedowns = await listTakedownRequests(db, locals.org.id, status || undefined);

	return json({ takedowns });
};
