// POST /api/members/invite - Create a new member invitation
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedMember, assertAdmin } from '$lib/server/auth/middleware';
import { parseBody, createInviteSchema } from '$lib/server/validation/schemas';

export const POST: RequestHandler = async ({ request, platform, cookies, locals }) => {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	// Auth: get member and check admin role
	const member = await getAuthenticatedMember(db, cookies, locals.org.id);
	assertAdmin(member);

	const orgId = locals.org.id;

	// Validate request body with Zod
	const body = await parseBody(request, createInviteSchema);

	try {
		// Import createInvite from DB operations
		const { createInvite } = await import('$lib/server/db/invites');

		// Create invite linked to roster member
		const invite = await createInvite(db, {
			orgId,
			rosterMemberId: body.rosterMemberId,
			emailHint: body.emailHint,
			invited_by: member.id
		});

		// Build invitation link
		const inviteLink = `${request.url.replace('/api/members/invite', '/invite/accept')}?token=${invite.token}`;

		return json(
			{
				id: invite.id,
				roster_member_id: invite.roster_member_id,
				roster_member_name: invite.roster_member_name,
				voices: invite.voices,
				sections: invite.sections,
				inviteLink,
				message: `Invitation created for ${invite.roster_member_name}.`
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Failed to create invite:', err);
		throw error(500, err instanceof Error ? err.message : 'Failed to create invite');
	}
};
