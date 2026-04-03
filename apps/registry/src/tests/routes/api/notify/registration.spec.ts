// Tests for POST /api/notify/registration endpoint
// Issue #202 - Admin notification for new organization registrations
// TDD: Tests written first

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, OPTIONS } from '../../../../routes/api/notify/registration/+server';

// Mock the email service
vi.mock('../../../../lib/server/email', () => ({
	sendAdminNotification: vi.fn().mockResolvedValue({ success: true, emailId: 'email_123' })
}));

import { sendAdminNotification } from '../../../../lib/server/email';

interface ApiResponse {
	success: boolean;
	message?: string;
	error?: string;
	emailId?: string;
}

interface RegistrationPayload {
	orgName?: string;
	subdomain?: string;
	contactEmail?: string;
	memberName?: string;
	memberEmail?: string;
	orgId?: string;
	apiKey?: string;
}

function createMockRequest(body: RegistrationPayload): Request {
	return new Request('http://localhost/api/notify/registration', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

const validPayload: RegistrationPayload = {
	orgName: 'City Chamber Choir',
	subdomain: 'citychamber',
	contactEmail: 'admin@citychoir.org',
	memberName: 'John Director',
	memberEmail: 'john@example.com',
	orgId: 'org_abc123',
	apiKey: 'test-notify-key'
};

describe('POST /api/notify/registration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('CORS', () => {
		it('should handle OPTIONS preflight request', async () => {
			const response = await OPTIONS({} as Parameters<typeof OPTIONS>[0]);

			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		});

		it('should include CORS headers in POST response', async () => {
			const response = await POST({
				request: createMockRequest(validPayload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});

	describe('Authentication', () => {
		it('should reject missing API key', async () => {
			const payload = { ...validPayload };
			delete payload.apiKey;

			const response = await POST({
				request: createMockRequest(payload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(401);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('API key');
		});

		it('should reject invalid API key', async () => {
			const response = await POST({
				request: createMockRequest({ ...validPayload, apiKey: 'wrong-key' }),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(401);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('Invalid');
		});
	});

	describe('Validation', () => {
		it('should reject missing orgName', async () => {
			const payload = { ...validPayload };
			delete payload.orgName;

			const response = await POST({
				request: createMockRequest(payload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('orgName');
		});

		it('should reject missing subdomain', async () => {
			const payload = { ...validPayload };
			delete payload.subdomain;

			const response = await POST({
				request: createMockRequest(payload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('subdomain');
		});

		it('should reject invalid JSON', async () => {
			const request = new Request('http://localhost/api/notify/registration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json'
			});

			const response = await POST({
				request,
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(400);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('JSON');
		});
	});

	describe('Email sending', () => {
		it('should send notification email with all fields', async () => {
			const response = await POST({
				request: createMockRequest(validPayload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(200);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(true);

			expect(sendAdminNotification).toHaveBeenCalledOnce();
			expect(sendAdminNotification).toHaveBeenCalledWith('test-key', 'admin@polyphony.uk', {
				orgName: 'City Chamber Choir',
				subdomain: 'citychamber',
				contactEmail: 'admin@citychoir.org',
				memberName: 'John Director',
				memberEmail: 'john@example.com',
				orgId: 'org_abc123'
			});
		});

		it('should return 500 if email service unavailable', async () => {
			const response = await POST({
				request: createMockRequest(validPayload),
				platform: {
					env: {
						// Missing RESEND_API_KEY
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(500);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('Email service');
		});

		it('should return 500 if admin email not configured', async () => {
			const response = await POST({
				request: createMockRequest(validPayload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						// Missing ADMIN_EMAIL
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(500);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('Admin email');
		});

		it('should handle email sending failure gracefully', async () => {
			vi.mocked(sendAdminNotification).mockResolvedValueOnce({
				success: false,
				error: 'Resend API error'
			});

			const response = await POST({
				request: createMockRequest(validPayload),
				platform: {
					env: {
						RESEND_API_KEY: 'test-key',
						ADMIN_EMAIL: 'admin@polyphony.uk',
						NOTIFY_API_KEY: 'test-notify-key'
					}
				}
			} as unknown as Parameters<typeof POST>[0]);

			expect(response.status).toBe(500);
			const data = (await response.json()) as ApiResponse;
			expect(data.success).toBe(false);
			expect(data.error).toContain('Failed to send');
		});
	});
});
