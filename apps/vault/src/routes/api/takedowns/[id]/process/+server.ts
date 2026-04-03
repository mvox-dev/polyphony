// POST /api/takedowns/[id]/process - Admin-only process takedown request (org-scoped)
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processTakedown, getTakedownById } from '$lib/server/db/takedowns';
import { getAuthenticatedMember, assertAdmin } from '$lib/server/auth/middleware';

interface ProcessRequest {
	action: 'approve' | 'reject';
	notes?: string;
}

export const POST: RequestHandler = async ({ request, params, platform, cookies, locals }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const member = await getAuthenticatedMember(db, cookies, locals.org.id);
	assertAdmin(member);

	try {
		// Verify takedown exists and belongs to this org before processing
		const takedown = await getTakedownById(db, params.id);
		if (!takedown || takedown.org_id !== locals.org.id) {
			throw error(404, 'Takedown request not found');
		}

		const body = await request.json() as ProcessRequest;

		if (body.action !== 'approve' && body.action !== 'reject') {
			throw error(400, 'action must be "approve" or "reject"');
		}

		const status = body.action === 'approve' ? 'approved' : 'rejected';
		const result = await processTakedown(db, {
			takedownId: params.id,
			orgId: locals.org.id,
			status,
			processedBy: member.id,
			notes: body.notes || ''
		});

		if (!result.success) {
			throw error(404, result.error || 'Takedown request not found');
		}

		return json({
			success: true,
			message: `Takedown request ${body.action}d successfully`
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Process takedown error:', err);
		throw error(500, 'Internal server error');
	}
};
