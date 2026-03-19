// Mock for $lib/paraglide/server — used when Paraglide build artifacts are absent

export function paraglideMiddleware(
	_request: Request,
	callback: (args: { request: Request; locale: string }) => Response | Promise<Response>
): Response | Promise<Response> {
	return callback({ request: _request, locale: 'en' });
}
