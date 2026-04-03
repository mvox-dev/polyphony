// OAuth initiation endpoint
// GET /auth?vault_id=xxx&callback=https://vault.../callback
/// <reference types="@cloudflare/workers-types" />
import { json, redirect } from '@sveltejs/kit';
import { signToken, verifyToken } from '@polyphony/shared/crypto';
import { nanoid } from 'nanoid';
import type { Cookies } from '@sveltejs/kit';
import { jwkToPem } from '$lib/crypto/jwk';

interface CloudflarePlatform {
	env: { DB: D1Database; API_KEY: string; GOOGLE_CLIENT_ID: string };
}

// Allowed callback URL domains (zero-storage: no vault table lookup)
const ALLOWED_CALLBACK_DOMAINS = [
	'polyphony.uk', // Production vaults
	'localhost:5174', // Development
	'localhost:5173' // Alternative dev port
];

/** Validate callback URL is on allowed domain */
function isCallbackAllowed(callbackUrl: string): boolean {
	try {
		const url = new URL(callbackUrl);
		const host = url.host; // includes port if present

		return ALLOWED_CALLBACK_DOMAINS.some((domain) => {
			if (host === domain) return true;
			if (host.endsWith(`.${domain}`)) return true;
			return false;
		});
	} catch {
		return false;
	}
}

export const GET = async ({
	url,
	platform,
	cookies
}: {
	url: URL;
	platform?: CloudflarePlatform;
	cookies?: Cookies;
}) => {
	if (!platform) throw new Error('Platform not available');

	const vaultId = url.searchParams.get('vault_id');
	const callbackUrl = url.searchParams.get('callback');

	// Validate required parameters
	if (!vaultId) {
		return json({ error: 'Missing vault_id parameter' }, { status: 400 });
	}

	if (!callbackUrl) {
		return json({ error: 'Missing callback parameter' }, { status: 400 });
	}

	// Validate callback URL is on an allowed domain (zero-storage: no vault table)
	if (!isCallbackAllowed(callbackUrl)) {
		return json({ error: 'Invalid callback URL' }, { status: 400 });
	}

	// Check for existing SSO session
	const ssoCookie = cookies?.get('polyphony_sso');
	if (ssoCookie) {
		try {
			// Fetch active signing key for verification
			const signingKey = await platform.env.DB.prepare(
				'SELECT id, private_key, public_key FROM signing_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'
			).first<{ id: string; private_key: string; public_key: string }>();

			if (signingKey) {
				// Convert JWK public key to PEM for verification
				const publicKeyPem = jwkToPem(JSON.parse(signingKey.public_key));
				const ssoPayload = await verifyToken(ssoCookie, publicKeyPem);

				// Validate SSO-specific claims
				if (ssoPayload.aud !== 'polyphony-sso') {
					throw new Error('Invalid SSO token audience');
				}

				// Valid SSO - issue vault JWT directly
				const vaultToken = await signToken(
					{
						iss: 'https://polyphony.uk',
						sub: ssoPayload.email,
						aud: vaultId,
						nonce: nanoid(),
						email: ssoPayload.email,
						name: ssoPayload.name,
						picture: ssoPayload.picture
					},
					signingKey.private_key
				);

				const callback = new URL(callbackUrl);
				callback.searchParams.set('token', vaultToken);
				return new Response(null, {
					status: 302,
					headers: { Location: callback.toString() }
				});
			}
		} catch {
			// Invalid/expired SSO cookie - proceed to OAuth
		}
	}

	// Build Google OAuth URL
	const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	googleAuthUrl.searchParams.set('client_id', platform.env.GOOGLE_CLIENT_ID);
	googleAuthUrl.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
	googleAuthUrl.searchParams.set('response_type', 'code');
	googleAuthUrl.searchParams.set('scope', 'openid email profile');
	googleAuthUrl.searchParams.set('state', JSON.stringify({ vaultId, callbackUrl }));

	return redirect(302, googleAuthUrl.toString());
};
