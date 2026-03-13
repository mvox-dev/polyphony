<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { EventType, PlannedStatus } from '$lib/types';
	import { getLocale } from '$lib/utils/locale';
	import { formatDateTimeComponents } from '$lib/utils/formatters';
	import { getEventTypeBadgeClass } from '$lib/utils/badges';
	import Card from '$lib/components/Card.svelte';
	import SeasonNavigation from '$lib/components/SeasonNavigation.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	// Filter state
	let selectedFilter = $state<EventType | 'all'>('all');

	// RSVP state
	let updatingRsvp = $state<Record<string, boolean>>({});

	// Create local reactive copy of events for RSVP updates
	let events = $state(untrack(() => data.events));
	
	// Sync with server data when it changes (e.g., season navigation)
	$effect(() => {
		events = data.events;
	});

	// Filtered events based on selected type
	let filteredEvents = $derived(
		selectedFilter === 'all'
			? events
			: events.filter((e) => e.event_type === selectedFilter)
	);

	// Get the locale for date formatting
	let locale = $derived(getLocale(data.locale));

	// Get RSVP button styles
	function getRsvpButtonStyle(currentStatus: PlannedStatus | null, buttonStatus: PlannedStatus): string {
		if (currentStatus === buttonStatus) {
			switch (buttonStatus) {
				case 'yes':
					return 'bg-green-600 text-white border-green-700';
				case 'no':
					return 'bg-red-600 text-white border-red-700';
				case 'maybe':
					return 'bg-yellow-600 text-white border-yellow-700';
				case 'late':
					return 'bg-orange-600 text-white border-orange-700';
			}
		}
		return 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';
	}

	// Update RSVP
	function updateRsvp(eventId: string, status: PlannedStatus) {
		return async (e: MouseEvent) => {
			e.stopPropagation();
			
			updatingRsvp[eventId] = true;

			try {
				const response = await fetch(`/api/events/${eventId}/participation`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status })
				});

				if (!response.ok) {
					const errorData = await response.json() as { message?: string };
					throw new Error(errorData.message || m.event_rsvp_update_failed());
				}

				// Update local state
				events = events.map((event) => {
					if (event.id === eventId) {
						return { ...event, myRsvp: status };
					}
					return event;
				});
			} catch (err) {
				console.error('Failed to update RSVP:', err);
				alert(m.event_rsvp_update_failed_alert());
			} finally {
				updatingRsvp[eventId] = false;
			}
		};
	}

</script>

<svelte:head>
	<title>{m.events_title()} | Polyphony Vault</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h1 class="text-3xl font-bold">{m.events_title()}</h1>
			<div class="flex gap-3">
				<a
					href="/events/roster"
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					{m.events_view_roster_btn()}
				</a>
				{#if data.canCreate}
					<a
						href="/events/new"
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
					>
						{m.events_create_btn()}
					</a>
				{/if}
			</div>
		</div>
		<p class="mt-2 text-gray-600">
			{#if data.season}
				{data.season.name}
			{:else}
				{m.events_no_season()}
			{/if}
		</p>
	</div>

	<!-- Season Navigation -->
	{#if data.season}
		<SeasonNavigation
			currentSeasonName={data.season.name}
			prev={data.seasonNav.prev}
			next={data.seasonNav.next}
			basePath="/events"
		/>
	{/if}

	<!-- Filter Buttons -->
	<div class="mb-6 flex flex-wrap gap-2">
		<button
			onclick={() => (selectedFilter = 'all')}
			class="rounded-lg border px-4 py-2 text-sm transition {selectedFilter === 'all'
				? 'border-blue-500 bg-blue-50 text-blue-700'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			{m.events_filter_all()}
		</button>
		<button
			onclick={() => (selectedFilter = 'rehearsal')}
			class="rounded-lg border px-4 py-2 text-sm transition {selectedFilter === 'rehearsal'
				? 'border-blue-500 bg-blue-50 text-blue-700'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			{m.events_filter_rehearsals()}
		</button>
		<button
			onclick={() => (selectedFilter = 'concert')}
			class="rounded-lg border px-4 py-2 text-sm transition {selectedFilter === 'concert'
				? 'border-purple-500 bg-purple-50 text-purple-700'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			{m.events_filter_concerts()}
		</button>
		<button
			onclick={() => (selectedFilter = 'retreat')}
			class="rounded-lg border px-4 py-2 text-sm transition {selectedFilter === 'retreat'
				? 'border-green-500 bg-green-50 text-green-700'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			{m.events_filter_retreats()}
		</button>
		<button
			onclick={() => (selectedFilter = 'festival')}
			class="rounded-lg border px-4 py-2 text-sm transition {selectedFilter === 'festival'
				? 'border-orange-500 bg-orange-50 text-orange-700'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			{m.events_filter_festivals()}
		</button>
	</div>

	<!-- Events List -->
	{#if filteredEvents.length === 0}
		<div class="py-12 text-center">
			<div class="mx-auto mb-4 w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-gray-400">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
			</div>
			<p class="text-gray-500">
				{#if selectedFilter === 'all'}
					{m.events_empty()}
				{:else}
					{m.events_filter_empty({ type: selectedFilter })}
				{/if}
			</p>
			{#if data.canCreate}
				<a href="/events/new" class="mt-4 inline-block text-blue-600 hover:underline">
					{m.events_create_first()}
				</a>
			{/if}
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredEvents as event (event.id)}
				{@const { date, time } = formatDateTimeComponents(event.starts_at, locale)}
				<Card variant="clickable" href="/events/{event.id}" padding="lg">
					<!-- Event Type Badge -->
					<div class="mb-3">
						<span class="inline-block rounded-full border px-3 py-1 text-xs font-medium {getEventTypeBadgeClass(event.event_type)}">
							{{
							rehearsal: m.events_rehearsal(),
							concert: m.events_concert(),
							retreat: m.events_retreat(),
							festival: m.events_festival()
						}[event.event_type] ?? event.event_type}
						</span>
					</div>

					<!-- Title -->
					<h3 class="mb-2 text-lg font-semibold text-gray-900 group-hover:text-blue-600">
						{event.title}
					</h3>

					<!-- Date and Time -->
					<div class="mb-3 space-y-1 text-sm text-gray-600">
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
							</svg>
							<span>{date}</span>
						</div>
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span>{time}</span>
						</div>
					</div>

					<!-- Location (if provided) -->
					{#if event.location}
						<div class="mb-3 flex items-start gap-2 text-sm text-gray-600">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mt-0.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
							</svg>
							<span class="flex-1">{event.location}</span>
						</div>
					{/if}

					<!-- Description Preview (if provided) -->
					{#if event.description}
						<p class="text-sm text-gray-500 line-clamp-2 mb-4">
							{event.description}
						</p>
					{/if}

					<!-- RSVP Buttons -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}
					>
						{#if !event.rsvpLocked}
							<div class="border-t border-gray-200 pt-4">
								<p class="text-xs text-gray-500 mb-2">{m.events_rsvp_label()}</p>
								<div class="grid grid-cols-4 gap-2">
									<button
										onclick={updateRsvp(event.id, 'yes')}
										disabled={updatingRsvp[event.id]}
										class="rounded border px-2 py-1 text-xs font-medium transition {getRsvpButtonStyle(event.myRsvp, 'yes')} disabled:opacity-50"
										title={m.roster_rsvp_yes_title()}
									>
										{m.common_yes()}
									</button>
									<button
										onclick={updateRsvp(event.id, 'no')}
										disabled={updatingRsvp[event.id]}
										class="rounded border px-2 py-1 text-xs font-medium transition {getRsvpButtonStyle(event.myRsvp, 'no')} disabled:opacity-50"
										title={m.roster_rsvp_no_title()}
									>
										{m.common_no()}
									</button>
									<button
										onclick={updateRsvp(event.id, 'maybe')}
										disabled={updatingRsvp[event.id]}
										class="rounded border px-2 py-1 text-xs font-medium transition {getRsvpButtonStyle(event.myRsvp, 'maybe')} disabled:opacity-50"
										title={m.roster_rsvp_maybe_title()}
									>
										{m.roster_rsvp_maybe_title()}
									</button>
									<button
										onclick={updateRsvp(event.id, 'late')}
										disabled={updatingRsvp[event.id]}
										class="rounded border px-2 py-1 text-xs font-medium transition {getRsvpButtonStyle(event.myRsvp, 'late')} disabled:opacity-50"
										title={m.roster_rsvp_late_title()}
									>
										{m.event_rsvp_late()}
									</button>
								</div>
							</div>
						{:else}
							<div class="border-t border-gray-200 pt-4">
								<p class="text-xs text-gray-500 mb-2">{m.events_rsvp_label()} ({m.event_rsvp_locked_suffix()})</p>
								<div class="grid grid-cols-4 gap-2">
									<button
										disabled
										class="rounded border px-2 py-1 text-xs font-medium {getRsvpButtonStyle(event.myRsvp, 'yes')} opacity-60 cursor-default"
									>
										{m.common_yes()}
									</button>
									<button
										disabled
										class="rounded border px-2 py-1 text-xs font-medium {getRsvpButtonStyle(event.myRsvp, 'no')} opacity-60 cursor-default"
									>
										{m.common_no()}
									</button>
									<button
										disabled
										class="rounded border px-2 py-1 text-xs font-medium {getRsvpButtonStyle(event.myRsvp, 'maybe')} opacity-60 cursor-default"
									>
										{m.roster_rsvp_maybe_title()}
									</button>
									<button
										disabled
										class="rounded border px-2 py-1 text-xs font-medium {getRsvpButtonStyle(event.myRsvp, 'late')} opacity-60 cursor-default"
									>
										{m.event_rsvp_late()}
									</button>
								</div>
							</div>
						{/if}
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
