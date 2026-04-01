// Server hooks for subdomain-based organization routing
// Implements #165 - Schema V2 multi-organization support
// Implements #188 - i18n Paraglide integration
// Implements #231 - Org context validation for protected API routes

import { error, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getOrganizationBySubdomain } from '$lib/server/db/organizations';
import { resolvePreferences } from '$lib/server/i18n/preferences';
import { locales } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';

// Development fallback subdomain (for localhost:5173 without subdomain)
const DEV_SUBDOMAIN = 'crede';

// Subdomains to skip (not organization routing)
const SKIP_SUBDOMAINS = new Set(['www', 'api', 'static', 'vault']);

/**
 * Extract the subdomain from a hostname
 * Returns null for skipped subdomains
 */
export function extractSubdomain(hostname: string): string | null {
	// Handle localhost variants
	if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
		// Pure localhost without subdomain → use dev fallback
		return DEV_SUBDOMAIN;
	}

	if (hostname.endsWith('.localhost') || hostname.includes('.localhost:')) {
		// Subdomain.localhost format (e.g., crede.localhost:5173)
		const subdomain = hostname.split('.')[0];
		if (SKIP_SUBDOMAINS.has(subdomain)) {
			return null;
		}
		return subdomain;
	}

	// Production hostname (e.g., crede.polyphony.uk)
	const parts = hostname.split('.');
	if (parts.length < 2) {
		// No subdomain in hostname
		return DEV_SUBDOMAIN;
	}

	const subdomain = parts[0];
	if (SKIP_SUBDOMAINS.has(subdomain)) {
		return null;
	}

	return subdomain;
}

// Organization routing handle
const orgHandle: Handle = async ({ event, resolve }) => {
	const db = event.platform?.env?.DB;
	if (!db) {
		// Dev mode without wrangler - skip org routing
		// This allows running basic tests without DB
		return resolve(event);
	}

	// Extract subdomain from hostname
	const hostname = event.url.hostname;
	const subdomain = extractSubdomain(hostname);

	// Skip non-org subdomains (www, api, static)
	if (subdomain === null) {
		return resolve(event);
	}

	// Lookup organization by subdomain
	const org = await getOrganizationBySubdomain(db, subdomain);
	if (!org) {
		return new Response(`Organization "${subdomain}" not found`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' }
		});
	}

	// Set organization in locals for all routes
	event.locals.org = org;

	return resolve(event);
};

/**
 * Check if a path is a public or auth route that doesn't require org context.
 * Public API routes are used by Registry (no subdomain context).
 * Auth routes handle OAuth redirects before org context is established.
 */
export function isPublicOrAuthRoute(pathname: string): boolean {
	return (
		pathname.startsWith('/api/public/') ||
		pathname.startsWith('/api/auth/') ||
		pathname.startsWith('/api/internal/')
	);
}

// Org context guard - validates org context exists for protected API routes (#231)
// Runs after orgHandle to catch cases where org resolution silently failed
const orgContextGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	if (path.startsWith('/api/') && !isPublicOrAuthRoute(path) && !event.locals.org) {
		throw error(500, 'Internal error: Missing organization context');
	}

	return resolve(event);
};

// SSO auto-auth handle (#256) - auto-redirects to auth when SSO cookie is present
// but no session exists on the current subdomain. Enables seamless org switching.
export const ssoHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	// Never intercept auth routes (would cause redirect loops)
	if (path.startsWith('/api/auth/')) {
		return resolve(event);
	}

	// Already authenticated on this subdomain — nothing to do
	if (event.cookies.get('member_id')) {
		return resolve(event);
	}

	// No SSO cookie — no cross-subdomain session to leverage
	const ssoCookie = event.cookies.get('polyphony_sso');
	if (!ssoCookie) {
		return resolve(event);
	}

	// Loop guard: if SSO was already attempted, don't retry
	if (event.url.searchParams.get('sso_attempted') === '1' || event.cookies.get('sso_attempted')) {
		return resolve(event);
	}

	// Set loop guard cookie before redirecting — prevents infinite redirect
	// if the user has SSO but is not a member of this org
	event.cookies.set('sso_attempted', '1', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: 60
	});

	// #301: Preserve invite token before SSO redirect loses it.
	// When visiting /invite/accept?token=xxx, the token must survive the
	// auth redirect loop. Store it in the same cookie the /login page uses.
	if (path === '/invite/accept') {
		const inviteToken = event.url.searchParams.get('token');
		if (inviteToken) {
			event.cookies.set('pending_invite', inviteToken, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 60 * 10 // 10 minutes
			});
		}
	}

	// Auto-redirect through auth flow with return_to so user lands on intended page
	const returnTo = event.url.pathname + event.url.search;
	const loginUrl = `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
	return new Response(null, {
		status: 302,
		headers: { location: loginUrl }
	});
};

// Request logging handle — lightweight console.log for wrangler tail observability
const requestLogHandle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	// Skip static assets
	if (pathname.startsWith('/_app/') || pathname.startsWith('/favicon')) {
		return resolve(event);
	}

	const memberId = event.cookies.get('member_id');
	const org = event.locals.org;
	let who = 'anon';

	if (memberId) {
		const db = event.platform?.env?.DB;
		if (db) {
			const row = await db
				.prepare('SELECT name FROM members WHERE id = ?')
				.bind(memberId)
				.first<{ name: string }>();
			who = row?.name ?? `id:${memberId}`;
		}
	}

	console.log(`[REQ] ${event.request.method} ${pathname} — ${who} — org:${org?.subdomain ?? 'none'}`);
	return resolve(event);
};

// Locale resolution handle - syncs DB language preference with Paraglide cookie
// Runs after orgHandle (org is resolved) and before paraglideHandle
const localeHandle: Handle = async ({ event, resolve }) => {
	const db = event.platform?.env?.DB;
	const org = event.locals.org;
	if (!db || !org) {
		return resolve(event);
	}

	// Check if user already has a PARAGLIDE_LOCALE cookie set
	const existingCookie = event.cookies.get('PARAGLIDE_LOCALE');
	if (existingCookie && (locales as readonly string[]).includes(existingCookie)) {
		return resolve(event);
	}

	// Resolve effective language from member prefs → org settings → system default
	const memberId = event.cookies.get('member_id') ?? null;
	const prefs = await resolvePreferences(db, memberId, org.id);

	// Only inject if language is a valid Paraglide locale
	if (prefs.language && (locales as readonly string[]).includes(prefs.language)) {
		// Set the cookie for Paraglide to pick up (and for future requests)
		event.cookies.set('PARAGLIDE_LOCALE', prefs.language, {
			path: '/',
			maxAge: 60 * 60 * 24 * 400,
			httpOnly: false,
			sameSite: 'lax'
		});

		// Also inject into the request headers so paraglideMiddleware sees it
		// on this same request (cookie.set only affects the response).
		// Cloudflare Workers have immutable request headers, so we must
		// create a new Request object with the updated cookie header.
		const cookieHeader = event.request.headers.get('cookie') ?? '';
		const updatedCookies = cookieHeader
			? `${cookieHeader}; PARAGLIDE_LOCALE=${prefs.language}`
			: `PARAGLIDE_LOCALE=${prefs.language}`;
		const newHeaders = new Headers(event.request.headers);
		newHeaders.set('cookie', updatedCookies);
		event.request = new Request(event.request.url, {
			method: event.request.method,
			headers: newHeaders,
			body: event.request.body,
			redirect: event.request.redirect
		});
	}

	return resolve(event);
};

// Paraglide i18n handle - transforms page with locale
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

// Chain handles: org routing → org context guard → SSO auto-auth → request log → locale resolution → paraglide i18n
export const handle: Handle = sequence(orgHandle, orgContextGuard, ssoHandle, requestLogHandle, localeHandle, paraglideHandle);
