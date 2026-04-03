import { redirect, error, type RequestEvent } from '@sveltejs/kit';
import { acceptInvite } from '$lib/server/db/invites';

export async function load({ url, platform, cookies }: RequestEvent) {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const token = url.searchParams.get('token');
	if (!token) {
		throw error(400, 'Invalid invitation link');
	}

	// Validate token and check expiration
	// Note: Production schema doesn't have status/roles columns
	const invite = await db
		.prepare(
			`SELECT id, roster_member_id, expires_at
			 FROM invites
			 WHERE token = ?`
		)
		.bind(token)
		.first<{
			id: string;
			roster_member_id: string;
			expires_at: string;
		}>();

	if (!invite) {
		throw redirect(302, cookies.get('member_id') ? '/' : '/login');
	}

	const now = new Date();
	const expiresAt = new Date(invite.expires_at);
	if (now > expiresAt) {
		throw error(400, 'This invitation has expired');
	}

	// Check if roster member is already registered
	const rosterMember = await db
		.prepare('SELECT email_id FROM members WHERE id = ?')
		.bind(invite.roster_member_id)
		.first<{ email_id: string | null }>();

	if (rosterMember?.email_id) {
		throw redirect(302, cookies.get('member_id') ? '/' : '/login');
	}

	// If user is already authenticated, accept the invite directly (#310).
	// This handles the cross-org case where SSO auto-auth resolves the member
	// but the page would otherwise bounce through /login unnecessarily.
	const memberId = cookies.get('member_id');
	if (memberId) {
		const member = await db
			.prepare('SELECT email_id FROM members WHERE id = ?')
			.bind(memberId)
			.first<{ email_id: string | null }>();

		if (member?.email_id) {
			const result = await acceptInvite(db, token, member.email_id);
			if (result.success) {
				throw redirect(302, '/');
			}
			// If acceptance failed, fall through to login flow
		}
	}

	// Redirect to login page with invite token
	// Login page will set cookie and pass through whichever auth method user chooses
	throw redirect(302, `/login?invite=${encodeURIComponent(token)}`);
}
