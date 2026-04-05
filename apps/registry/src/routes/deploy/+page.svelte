<script lang="ts">
	// Deploy a new Vault - one-click Cloudflare deployment
	import * as m from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.deploy_page_title()}</title>
	<meta name="description" content={m.deploy_page_description()} />
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<header class="bg-white border-b border-slate-100">
		<div class="mx-auto max-w-5xl px-6 py-4">
			<a href="/" class="flex items-center gap-2 text-slate-900 hover:text-indigo-600 transition">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
					/>
				</svg>
				<span class="font-semibold">Polyphony</span>
			</a>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-12">
		<h1 class="text-3xl font-bold text-slate-900 mb-2">{m.deploy_heading()}</h1>
		<p class="text-slate-600 mb-8">{m.deploy_subtitle()}</p>

		<!-- Coming Soon -->
		<div class="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-100">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h2 class="text-xl font-semibold text-slate-900 mb-2">{m.deploy_coming_soon_heading()}</h2>
			<p class="text-slate-600 max-w-md mx-auto mb-6">
				{m.deploy_coming_soon_desc()}
			</p>
			<a
				href="https://github.com/mitselek/polyphony"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-white hover:bg-slate-800 transition"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
					/>
				</svg>
				{m.deploy_view_github()}
			</a>
		</div>

		<!-- What You Get -->
		<section class="mt-12">
			<h2 class="text-xl font-semibold text-slate-900 mb-6">{m.deploy_whats_included()}</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
					<h3 class="font-medium text-slate-900 mb-1">{m.deploy_feature_scores_title()}</h3>
					<p class="text-sm text-slate-600">
						{m.deploy_feature_scores_desc()}
					</p>
				</div>
				<div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
					<h3 class="font-medium text-slate-900 mb-1">{m.deploy_feature_members_title()}</h3>
					<p class="text-sm text-slate-600">
						{m.deploy_feature_members_desc()}
					</p>
				</div>
				<div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
					<h3 class="font-medium text-slate-900 mb-1">{m.deploy_feature_events_title()}</h3>
					<p class="text-sm text-slate-600">
						{m.deploy_feature_events_desc()}
					</p>
				</div>
				<div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
					<h3 class="font-medium text-slate-900 mb-1">{m.deploy_feature_privacy_title()}</h3>
					<p class="text-sm text-slate-600">
						{m.deploy_feature_privacy_desc()}
					</p>
				</div>
			</div>
		</section>
	</main>
</div>
