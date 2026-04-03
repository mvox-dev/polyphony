// Email service using Resend API
// Issue #156 - Email Authentication

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface SendMagicLinkParams {
	to: string;
	code: string;
	verifyUrl: string;
	vaultName: string;
}

export interface SendEmailResult {
	success: boolean;
	error?: string;
}

/** Escape HTML special characters to prevent XSS */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/** Generate the magic link email HTML */
function buildMagicLinkHtml(params: SendMagicLinkParams): string {
	const { code, verifyUrl, vaultName } = params;
	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f9fafb">
<div style="max-width:480px;margin:0 auto;padding:40px 20px">
<div style="background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<h2 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827">Sign in to ${escapeHtml(vaultName)}</h2>
<p style="margin:0 0 24px;color:#6b7280;line-height:1.5">Click the button below to sign in to your choir vault:</p>
<div style="margin:0 0 24px;text-align:center"><a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">Sign In Now</a></div>
<p style="margin:0 0 16px;color:#6b7280;line-height:1.5">Or enter this code manually:</p>
<div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px"><span style="font-size:36px;font-weight:bold;letter-spacing:6px;font-family:'SF Mono',Monaco,'Courier New',monospace;color:#111827">${code}</span></div>
<p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.5">This link expires in 10 minutes. If you didn't request this email, you can safely ignore it.</p>
</div>
<p style="margin:24px 0 0;text-align:center;font-size:12px;color:#9ca3af">Polyphony - Choir Music Library</p>
</div></body></html>`;
}

/**
 * Send a magic link email via Resend API
 */
export async function sendMagicLink(
	apiKey: string,
	params: SendMagicLinkParams
): Promise<SendEmailResult> {
	const html = buildMagicLinkHtml(params);

	try {
		const response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: 'Polyphony <noreply@scoreinstitute.eu>',
				to: [params.to],
				subject: `Sign in to ${params.vaultName}`,
				html
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Resend API error:', response.status, errorBody);
			return { success: false, error: `Email service error: ${response.status}` };
		}
		return { success: true };
	} catch (err) {
		console.error('Resend API exception:', err);
		return { success: false, error: 'Failed to send email' };
	}
}

// =============================================================================
// Admin Notification Emails (Issue #202)
// =============================================================================

export interface RegistrationNotificationData {
	orgName: string;
	subdomain: string;
	contactEmail: string;
	memberName: string;
	memberEmail: string;
	orgId: string;
}

export interface AdminNotificationResult {
	success: boolean;
	emailId?: string;
	error?: string;
}

/**
 * Send admin notification email for new organization registration
 */
export async function sendAdminNotification(
	apiKey: string,
	adminEmail: string,
	data: RegistrationNotificationData
): Promise<AdminNotificationResult> {
	const subject = `New Polyphony Registration: ${data.orgName}`;

	const text = `New organization registered:

Name: ${data.orgName}
Subdomain: ${data.subdomain}.polyphony.uk
Contact: ${data.contactEmail}
Registered by: ${data.memberName} (${data.memberEmail})
Org ID: ${data.orgId}

ACTION REQUIRED:
1. Add custom domain in Cloudflare Pages
2. Update organization status to 'active'
`;

	try {
		const response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from: 'Polyphony <noreply@scoreinstitute.eu>',
				to: [adminEmail],
				subject,
				text
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Resend API error (admin notification):', response.status, errorBody);
			return { success: false, error: `Email service error: ${response.status}` };
		}

		const result = (await response.json()) as { id: string };
		return { success: true, emailId: result.id };
	} catch (err) {
		console.error('Resend API exception (admin notification):', err);
		return { success: false, error: 'Failed to send email' };
	}
}
