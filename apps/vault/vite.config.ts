import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'path';

export default defineConfig(({ mode }) => ({
	// In test mode, use minimal svelte plugin for component tests
	// In dev/build mode, use full sveltekit with tailwind and paraglide
	plugins: mode === 'test' 
		? [svelte({ hot: false })] 
		: [
				tailwindcss(),
				sveltekit(),
				paraglideVitePlugin({
					project: './project.inlang',
					outdir: './src/lib/paraglide',
					strategy: ['cookie', 'baseLocale'],  // Cookie-based, not URL-based
					disableAsyncLocalStorage: true  // CRITICAL for Cloudflare Workers
				})
			],
	resolve: {
		alias: [
			// In test mode, mock Paraglide build artifacts (gitignored, may not exist in clean checkout).
			// These MUST come before the $lib alias so they match first.
			...(mode === 'test' ? [
				{ find: '$lib/paraglide/runtime.js', replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-runtime.ts') },
				{ find: '$lib/paraglide/runtime', replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-runtime.ts') },
				{ find: '$lib/paraglide/server.js', replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-server.ts') },
				{ find: '$lib/paraglide/server', replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-server.ts') },
			] : []),
			{ find: '$lib', replacement: path.resolve(__dirname, './src/lib') },
		],
		// Force client-side Svelte in test environment
		conditions: mode === 'test' ? ['browser'] : undefined
	},
	test: {
		include: ['src/**/*.spec.ts'],
		// Default to node for fast unit tests
		// Component tests use @vitest-environment comment or file pattern
		environment: 'node',
		pool: 'forks',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json'],
			reportsDirectory: './coverage',
			include: ['src/lib/**/*.ts'],
			exclude: [
				'src/**/*.spec.ts',
				'src/**/*.d.ts',
				'src/lib/types.ts'
			]
		}
	}
}));
