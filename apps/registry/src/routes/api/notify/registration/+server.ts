// Admin notification endpoint for new organization registrations
// POST /api/notify/registration
// Issue #202 - Called by Vault when new org is registered

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendAdminNotification, type RegistrationNotificationData } from '$lib/server/email';

interface CloudflarePlatform {
	env: {
		RESEND_API_KEY?: string;
		ADMIN_EMAIL?: string;
		NOTIFY_API_KEY?: string;
	};
}

interface NotificationRequest extends RegistrationNotificationData {
	apiKey: string;
}

// CORS headers for cross-origin requests from vaults
const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function corsJson(data: unknown, init?: ResponseInit) {
	return json(data, {
		...init,
		headers: { ...CORS_HEADERS, ...init?.headers }
	});
}

// Handle preflight requests
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
};

const REQUIRED_FIELDS = [
	'orgName',
	'subdomain',
	'contactEmail',
	'memberName',
	'memberEmail',
	'orgId'
] as const;

function validateRequest(body: unknown): { data?: NotificationRequest; error?: string } {
	const req = body as Partial<NotificationRequest>;

	if (!req.apiKey || typeof req.apiKey !== 'string') {
		return { error: 'Missing API key' };
	}

	for (const field of REQUIRED_FIELDS) {
		if (!req[field] || typeof req[field] !== 'string') {
			return { error: `Missing required field: ${field}` };
		}
	}

	return { data: req as NotificationRequest };
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = (platform as CloudflarePlatform | undefined)?.env;

	// Check service configuration
	if (!env?.RESEND_API_KEY) {
		return corsJson({ success: false, error: 'Email service unavailable' }, { status: 500 });
	}
	if (!env.ADMIN_EMAIL) {
		return corsJson({ success: false, error: 'Admin email not configured' }, { status: 500 });
	}
	if (!env.NOTIFY_API_KEY) {
		return corsJson(
			{ success: false, error: 'Notification service not configured' },
			{ status: 500 }
		);
	}

	// Parse request body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return corsJson({ success: false, error: 'Invalid JSON' }, { status: 400 });
	}

	// Validate request
	const validation = validateRequest(body);
	if (validation.error) {
		// Check if it's an auth error
		if (validation.error.includes('API key')) {
			return corsJson({ success: false, error: validation.error }, { status: 401 });
		}
		return corsJson({ success: false, error: validation.error }, { status: 400 });
	}

	const { apiKey, orgName, subdomain, contactEmail, memberName, memberEmail, orgId } =
		validation.data!;

	// Verify API key
	if (apiKey !== env.NOTIFY_API_KEY) {
		return corsJson({ success: false, error: 'Invalid API key' }, { status: 401 });
	}

	// Send notification email
	const result = await sendAdminNotification(env.RESEND_API_KEY, env.ADMIN_EMAIL, {
		orgName,
		subdomain,
		contactEmail,
		memberName,
		memberEmail,
		orgId
	});

	if (!result.success) {
		return corsJson(
			{ success: false, error: 'Failed to send notification email' },
			{ status: 500 }
		);
	}

	return corsJson({ success: true, emailId: result.emailId });
};
