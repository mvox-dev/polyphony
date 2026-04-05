// Mock for $lib/paraglide/runtime — used when Paraglide build artifacts are absent

export const baseLocale = 'en';
export const locales = ['en', 'et', 'lv', 'uk'] as const;
export const cookieName = 'PARAGLIDE_LOCALE';

export function getLocale(): string {
	return baseLocale;
}

export function setLocale(_locale: string): void {
	// no-op in tests
}
