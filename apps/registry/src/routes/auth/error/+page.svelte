<script lang="ts">
	import { page } from '$app/stores';

	const message = $derived($page.url.searchParams.get('message') || 'Something went wrong');
	const callback = $derived($page.url.searchParams.get('callback') || '');

	// Extract vault login URL from callback (e.g., /api/auth/callback → /login)
	const retryUrl = $derived(() => {
		if (!callback) return '/';
		try {
			const url = new URL(callback);
			// Replace /api/auth/callback with /login
			return url.origin + '/login';
		} catch {
			return '/';
		}
	});
</script>

<svelte:head>
	<title>Sign In Failed | Polyphony</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-md text-center">
		<div class="mb-6">
			<svg
				class="mx-auto h-16 w-16 text-red-500"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
		</div>

		<h1 class="mb-2 text-2xl font-bold text-gray-900">Sign In Failed</h1>

		<p class="mb-6 text-gray-600">{message}</p>

		<div class="space-y-3">
			{#if callback}
				<a
					href={retryUrl()}
					class="inline-block w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
				>
					Try Again
				</a>
			{:else}
				<p class="text-sm text-gray-500">Please return to the vault login page and try again.</p>
			{/if}
		</div>

		<p class="mt-8 text-sm text-gray-400">
			If this problem persists, contact your vault administrator.
		</p>
	</div>
</div>
