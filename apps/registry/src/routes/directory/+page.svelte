<script lang="ts">
	// Vault directory - lists registered choirs
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Choir Directory | Polyphony</title>
	<meta name="description" content="Browse choirs and ensembles using Polyphony." />
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
		<h1 class="text-3xl font-bold text-slate-900 mb-2">Choir Directory</h1>
		<p class="text-slate-600 mb-8">Choirs and ensembles using Polyphony.</p>

		{#if data.organizations.length === 0}
			<!-- Empty State -->
			<div class="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-100">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400"
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
							d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-semibold text-slate-900 mb-2">No choirs yet</h2>
				<p class="text-slate-600 max-w-md mx-auto">
					Be the first to <a
						href="/deploy"
						class="text-indigo-600 hover:text-indigo-700 font-medium">create a Vault</a
					> for your choir.
				</p>
			</div>
		{:else}
			<!-- Vault List -->
			<div class="grid gap-4">
				{#each data.organizations as vault}
					<a
						href={vault.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-indigo-200"
					>
						<div class="flex items-center justify-between">
							<div>
								<h2
									class="text-lg font-semibold text-slate-900 group-hover:text-indigo-600 transition"
								>
									{vault.name}
								</h2>
								<p class="text-sm text-slate-500 mt-1">
									{vault.subdomain}.polyphony.uk
								</p>
							</div>
							<div
								class="flex items-center gap-2 text-slate-400 group-hover:text-indigo-600 transition"
							>
								<span class="text-sm">Visit</span>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</div>
						</div>
					</a>
				{/each}
			</div>

			<p class="mt-8 text-center text-sm text-slate-400">
				{data.organizations.length}
				{data.organizations.length === 1 ? 'choir' : 'choirs'} registered
			</p>
		{/if}
	</main>
</div>
