<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const snapshot = $derived(data.snapshot);
	const activity = $derived(data.activity);
	const history = $derived(data.history ?? []);
	const activityHistory = $derived(data.activityHistory ?? []);

	// Parse events_today from JSON string
	const events = $derived.by(() => {
		if (!snapshot?.events_today) return { rehearsal: 0, concert: 0, retreat: 0, festival: 0 };
		try {
			return typeof snapshot.events_today === 'string'
				? JSON.parse(snapshot.events_today)
				: snapshot.events_today;
		} catch {
			return { rehearsal: 0, concert: 0, retreat: 0, festival: 0 };
		}
	});

	// Format file size for display
	function formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
	}

	// Build sparkline SVG path from history data
	function sparklinePath(values: number[], width: number, height: number): string {
		if (values.length < 2) return '';
		const max = Math.max(...values, 1);
		const step = width / (values.length - 1);
		return values
			.map((v, i) => {
				const x = i * step;
				const y = height - (v / max) * height;
				return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}

	// Aggregate activity history by date for the chart
	const dailyAuthCounts = $derived.by(() => {
		const byDate = new Map<string, number>();
		for (const row of activityHistory) {
			byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.count);
		}
		return Array.from(byDate.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, count]) => count);
	});

	const memberHistory = $derived(history.map((h: any) => h.member_count));
	const worksHistory = $derived(history.map((h: any) => h.works_count));

	const eventItems = $derived([
		{ label: m.dashboard_event_rehearsals(), count: events.rehearsal, color: 'blue' },
		{ label: m.dashboard_event_concerts(), count: events.concert, color: 'purple' },
		{ label: m.dashboard_event_retreats(), count: events.retreat, color: 'emerald' },
		{ label: m.dashboard_event_festivals(), count: events.festival, color: 'amber' }
	]);

	const authItems = $derived([
		{ label: m.dashboard_auth_oauth_started(), key: 'oauth_initiated', color: 'indigo' },
		{ label: m.dashboard_auth_sso_fast_path(), key: 'sso_fast_path', color: 'emerald' },
		{ label: m.dashboard_auth_oauth_completed(), key: 'oauth_completed', color: 'blue' },
		{ label: m.dashboard_auth_email_sent(), key: 'email_auth_sent', color: 'amber' },
		{ label: m.dashboard_auth_email_verified(), key: 'email_auth_verified', color: 'purple' }
	]);
</script>

<svelte:head>
	<title>{m.dashboard_page_title()}</title>
	<meta name="description" content={m.dashboard_page_description()} />
</svelte:head>

<div class="min-h-screen bg-linear-to-b from-slate-50 to-white">
	<!-- Header -->
	<header class="mx-auto max-w-5xl px-6 pt-12 pb-8">
		<div class="flex items-center gap-3">
			<a
				href="/"
				class="text-slate-400 hover:text-indigo-600 transition"
				aria-label={m.common_back_home_aria()}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
				</svg>
			</a>
			<h1 class="text-3xl font-bold text-slate-900">{m.dashboard_heading()}</h1>
		</div>
		<p class="mt-2 text-slate-500">{m.dashboard_subtitle()}</p>
	</header>

	<main class="mx-auto max-w-5xl px-6 pb-16">
		{#if !snapshot && !activity}
			<!-- No data available -->
			<div class="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-100">
				<p class="text-slate-500">
					{m.dashboard_no_data()}
				</p>
			</div>
		{:else}
			<!-- Vault Stats Cards -->
			{#if snapshot}
				<section class="mb-8">
					<h2 class="mb-4 text-lg font-semibold text-slate-700">
						{m.dashboard_section_overview()}
					</h2>
					<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<!-- Organizations -->
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm text-slate-500">{m.dashboard_stat_organizations()}</p>
									<p class="mt-1 text-2xl font-bold text-slate-900">{snapshot.org_count}</p>
								</div>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
										/>
									</svg>
								</div>
							</div>
						</div>

						<!-- Members -->
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm text-slate-500">{m.dashboard_stat_members()}</p>
									<p class="mt-1 text-2xl font-bold text-slate-900">{snapshot.member_count}</p>
								</div>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
										/>
									</svg>
								</div>
							</div>
							{#if memberHistory.length > 1}
								<svg class="mt-3 h-8 w-full" viewBox="0 0 200 32" preserveAspectRatio="none">
									<path
										d={sparklinePath(memberHistory, 200, 32)}
										fill="none"
										stroke="#10b981"
										stroke-width="2"
									/>
								</svg>
							{/if}
						</div>

						<!-- Works -->
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm text-slate-500">{m.dashboard_stat_works()}</p>
									<p class="mt-1 text-2xl font-bold text-slate-900">{snapshot.works_count}</p>
								</div>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
										/>
									</svg>
								</div>
							</div>
							{#if worksHistory.length > 1}
								<svg class="mt-3 h-8 w-full" viewBox="0 0 200 32" preserveAspectRatio="none">
									<path
										d={sparklinePath(worksHistory, 200, 32)}
										fill="none"
										stroke="#f59e0b"
										stroke-width="2"
									/>
								</svg>
							{/if}
						</div>

						<!-- Library Size -->
						<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm text-slate-500">{m.dashboard_stat_library_size()}</p>
									<p class="mt-1 text-2xl font-bold text-slate-900">
										{formatSize(snapshot.total_file_size)}
									</p>
								</div>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
										/>
									</svg>
								</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Today's Events -->
				{#if events.rehearsal || events.concert || events.retreat || events.festival}
					<section class="mb-8">
						<h2 class="mb-4 text-lg font-semibold text-slate-700">
							{m.dashboard_section_events()}
						</h2>
						<div class="grid gap-3 sm:grid-cols-4">
							{#each eventItems as item}
								{#if item.count > 0}
									<div class="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
										<span class="text-sm text-slate-500">{item.label}</span>
										<span class="ml-2 text-lg font-semibold text-slate-900">{item.count}</span>
									</div>
								{/if}
							{/each}
						</div>
					</section>
				{/if}
			{/if}

			<!-- Auth Activity -->
			{#if activity}
				<section class="mb-8">
					<h2 class="mb-4 text-lg font-semibold text-slate-700">
						{m.dashboard_section_auth_activity()}
					</h2>
					<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{#each authItems as item}
							<div
								class="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 text-center"
							>
								<p class="text-xs text-slate-400">{item.label}</p>
								<p class="mt-1 text-xl font-bold text-slate-900">
									{(activity as Record<string, number>)[item.key] ?? 0}
								</p>
							</div>
						{/each}
					</div>

					<!-- Auth activity sparkline -->
					{#if dailyAuthCounts.length > 1}
						<div class="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
							<p class="mb-2 text-sm text-slate-500">{m.dashboard_auth_sparkline_label()}</p>
							<svg class="h-16 w-full" viewBox="0 0 400 64" preserveAspectRatio="none">
								<path
									d={sparklinePath(dailyAuthCounts, 400, 64)}
									fill="none"
									stroke="#6366f1"
									stroke-width="2"
								/>
							</svg>
						</div>
					{/if}
				</section>
			{/if}
		{/if}
	</main>

	<!-- Footer -->
	<footer class="border-t border-slate-100 bg-slate-50 py-6">
		<div class="mx-auto max-w-5xl px-6 text-center">
			<p class="text-xs text-slate-400">
				<a href="/" class="hover:text-indigo-600">Home</a>
				<span class="mx-2">&middot;</span>
				<a href="/directory" class="hover:text-indigo-600">Directory</a>
				<span class="mx-2">&middot;</span>
				<a href="https://github.com/mitselek/polyphony" class="hover:text-indigo-600">GitHub</a>
			</p>
		</div>
	</footer>
</div>
