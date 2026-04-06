import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'path';

export default defineConfig(({ mode }) => ({
	plugins:
		mode === 'test'
			? [svelte({ hot: false })]
			: [
					tailwindcss(),
					sveltekit(),
					paraglideVitePlugin({
						project: './project.inlang',
						outdir: './src/lib/paraglide',
						strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
						disableAsyncLocalStorage: true
					})
				],
	resolve: {
		alias: [
			...(mode === 'test'
				? [
						{
							find: '$lib/paraglide/runtime.js',
							replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-runtime.ts')
						},
						{
							find: '$lib/paraglide/runtime',
							replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-runtime.ts')
						},
						{
							find: '$lib/paraglide/server.js',
							replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-server.ts')
						},
						{
							find: '$lib/paraglide/server',
							replacement: path.resolve(__dirname, './src/tests/mocks/paraglide-server.ts')
						}
					]
				: []),
			{ find: '$lib', replacement: path.resolve(__dirname, './src/lib') }
		],
		conditions: mode === 'test' ? ['browser'] : undefined
	},
	test: {
		include: ['src/**/*.spec.ts'],
		environment: 'node'
	}
}));
