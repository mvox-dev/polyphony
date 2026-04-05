<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	const vaultUrl = $derived(`https://${data.subdomain}.polyphony.uk`);
</script>

<svelte:head>
	<title>{m.success_page_title()}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
	<div class="max-w-md w-full text-center">
		<div class="bg-white rounded-xl shadow-sm p-8">
			<!-- Success Icon -->
			<div
				class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
			>
				<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
					></path>
				</svg>
			</div>

			<h1 class="text-2xl font-bold text-gray-900 mb-2">{m.success_heading()}</h1>
			<p class="text-gray-600 mb-6">
				{m.success_org_created()}
			</p>

			<!-- Vault URL Preview -->
			<div class="bg-gray-50 rounded-lg p-4 mb-6">
				<p class="text-sm text-gray-500 mb-1">{m.success_org_url_label()}</p>
				<a
					href={vaultUrl}
					class="text-lg font-mono text-blue-600 hover:underline"
					target="_blank"
					rel="noopener noreferrer"
				>
					{vaultUrl}
				</a>
				<p class="text-xs text-gray-400 mt-2">
					{m.success_ssl_notice()}
				</p>
			</div>

			<!-- Next Steps -->
			<div class="text-left bg-blue-50 rounded-lg p-4 mb-6">
				<h2 class="font-semibold text-blue-900 mb-3">{m.success_next_steps_heading()}</h2>
				<ol class="space-y-2 text-sm text-blue-800">
					<li class="flex items-start gap-2">
						<span class="font-semibold">1.</span>
						<span>{m.success_next_steps_1()}</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="font-semibold">2.</span>
						<span>{m.success_next_steps_2()}</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="font-semibold">3.</span>
						<span>{m.success_next_steps_3()}</span>
					</li>
				</ol>
			</div>

			<a href="/" class="inline-block py-2 px-6 text-blue-600 hover:text-blue-800 font-medium">
				{m.common_back_home()}
			</a>
		</div>
	</div>
</div>
