<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { PlannedStatus, ActualStatus } from '$lib/types';
	import { getLocale } from '$lib/utils/locale';
	import { formatDateShort, formatTime, isPast } from '$lib/utils/formatters';
	import { getInitials } from '$lib/utils/initials';
	import Card from '$lib/components/Card.svelte';
	import { SectionBadge } from '$lib/components/badges';
	import SeasonNavigation from '$lib/components/SeasonNavigation.svelte';
	import { canEditCell } from '$lib/utils/participation-permissions';
	import { shouldHeaderStick } from '$lib/utils/sticky-header';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	// Get the locale for date formatting
	let locale = $derived(getLocale(data.locale));

	// Reactive copy of data for local updates
	let roster = $state(untrack(() => data.roster));
	let sections = $state(untrack(() => data.sections));
	let filters = $state(untrack(() => data.filters));

	// Filter state
	let selectedSectionId = $state(untrack(() => filters.sectionId ?? ''));

	// Popup state
	let activePopup = $state<{ memberId: string; eventId: string; type: 'rsvp' | 'attendance' } | null>(null);
	let popupPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let updating = $state(false);

	// --- Experimental: scroll-driven column shrinking (Issue #244) ---
	const FULL_WIDTH = 150;
	const MIN_WIDTH = 44;
	const FADE_DISTANCE = 50; // Scroll distance over which fade occurs
	const SCROLL_THRESHOLD = 2; // Minimum scroll to trigger shrinking (ignore layout quirks)

	let scrollContainer: HTMLElement | undefined = $state();
	let headerScrollEl: HTMLElement | undefined = $state();
	let scrollLeft = $state(0);
	let isScrollable = $derived(scrollContainer ? scrollContainer.scrollWidth > scrollContainer.clientWidth : false);
	let isActuallyScrolled = $derived(scrollLeft > SCROLL_THRESHOLD);
	let columnWidth = $derived(isScrollable && isActuallyScrolled ? Math.max(MIN_WIDTH, FULL_WIDTH - scrollLeft) : FULL_WIDTH);
	let fullNameOpacity = $derived(Math.max(0, 1 - scrollLeft / FADE_DISTANCE));
	let initialsOpacity = $derived(Math.min(1, scrollLeft / FADE_DISTANCE));
	let gridColumns = $derived(`${columnWidth}px repeat(${roster.events.length}, minmax(100px, 1fr))`);

	function handleScroll(e: Event) {
		scrollLeft = (e.target as HTMLElement).scrollLeft;
		if (headerScrollEl) headerScrollEl.scrollLeft = scrollLeft;
	}

	// --- End experimental column shrinking ---

	// --- Smart unstick header row (Issue #247) ---
	const UNSTICK_THRESHOLD = 100;

	let headerShouldStick = $state(true);

	function handleWindowScroll() {
		if (!scrollContainer) return;
		const gridBottom = scrollContainer.getBoundingClientRect().bottom;
		headerShouldStick = shouldHeaderStick(gridBottom, UNSTICK_THRESHOLD);
	}
	// --- End smart unstick ---

	// Watch for data changes (e.g., on navigation) and update local state
	$effect(() => {
		roster = data.roster;
		sections = data.sections;
		filters = data.filters;
	});

	// Reactive section stats - recalculates when roster changes
	let sectionStats = $derived.by(() => {
		const stats: Record<string, {
			sectionName: string;
			sectionAbbr: string;
			displayOrder: number;
			memberCount: number;
			eventCount: number;
			pastEventCount: number;
			rsvpYes: number;
			rsvpNo: number;
			rsvpMaybe: number;
			rsvpLate: number;
			rsvpResponded: number;
			attPresent: number;
			attAbsent: number;
			attLate: number;
			attRecorded: number;
		}> = {};

		const now = new Date();

		for (const member of roster.members) {
			if (!member.primarySection) continue;

			const sectionId = member.primarySection.id;

			if (!stats[sectionId]) {
				stats[sectionId] = {
					sectionName: member.primarySection.name,
					sectionAbbr: member.primarySection.abbreviation,
					displayOrder: member.primarySection.displayOrder,
					memberCount: 0,
					eventCount: roster.events.length,
					pastEventCount: roster.events.filter(e => new Date(e.date) < now).length,
					rsvpYes: 0,
					rsvpNo: 0,
					rsvpMaybe: 0,
					rsvpLate: 0,
					rsvpResponded: 0,
					attPresent: 0,
					attAbsent: 0,
					attLate: 0,
					attRecorded: 0
				};
			}

			stats[sectionId].memberCount++;

			for (const event of roster.events) {
				const participation = event.participation.get(member.id)!;
				const isPast = new Date(event.date) < now;

				const plannedStatus = participation.plannedStatus;
				if (plannedStatus === 'yes') stats[sectionId].rsvpYes++;
				else if (plannedStatus === 'no') stats[sectionId].rsvpNo++;
				else if (plannedStatus === 'maybe') stats[sectionId].rsvpMaybe++;
				else if (plannedStatus === 'late') stats[sectionId].rsvpLate++;
				if (plannedStatus !== null) stats[sectionId].rsvpResponded++;

				if (isPast) {
					const actualStatus = participation.actualStatus;
					if (actualStatus === 'present') stats[sectionId].attPresent++;
					else if (actualStatus === 'absent') stats[sectionId].attAbsent++;
					else if (actualStatus === 'late') stats[sectionId].attLate++;
					if (actualStatus !== null) stats[sectionId].attRecorded++;
				}
			}
		}

		return stats;
	});

	function canEditCellFor(memberId: string, eventDate: string, type: 'rsvp' | 'attendance'): boolean {
		return canEditCell({
			memberId,
			eventDate,
			type,
			currentMemberId: data.currentMemberId,
			canManageParticipation: data.canManageParticipation,
			trustIndividualResponsibility: data.trustIndividualResponsibility
		});
	}

	function openPopup(
		e: MouseEvent,
		memberId: string,
		eventId: string,
		type: 'rsvp' | 'attendance'
	) {
		const rect = (e.target as HTMLElement).getBoundingClientRect();
		popupPosition = {
			x: rect.left + rect.width / 2,
			y: rect.bottom + 4
		};
		activePopup = { memberId, eventId, type };
	}

	function closePopup() {
		activePopup = null;
	}

	async function updateStatus(status: PlannedStatus | ActualStatus | null) {
		if (!activePopup || updating) return;

		updating = true;
		const { memberId, eventId, type } = activePopup;

		try {
			const body: Record<string, unknown> = { eventId, memberId };
			if (type === 'rsvp') {
				body.plannedStatus = status;
			} else {
				body.actualStatus = status;
			}

			const response = await fetch('/api/participation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message ?? 'Failed to update');
			}

			roster = {
				...roster,
				events: roster.events.map(event => {
					if (event.id !== eventId) return event;

					const newParticipation = new Map(event.participation);
					const current = newParticipation.get(memberId) ?? {
						plannedStatus: null,
						actualStatus: null,
						recordedAt: null
					};

					if (type === 'rsvp') {
						newParticipation.set(memberId, {
							...current,
							plannedStatus: status as PlannedStatus | null
						});
					} else {
						newParticipation.set(memberId, {
							...current,
							actualStatus: status as ActualStatus | null,
							recordedAt: new Date().toISOString()
						});
					}

					return { ...event, participation: newParticipation };
				})
			};

			closePopup();
		} catch (err) {
			console.error('Failed to update participation:', err);
			alert(err instanceof Error ? err.message : 'Failed to update');
		} finally {
			updating = false;
		}
	}

	function getRsvpClass(plannedStatus: PlannedStatus | null): string {
		if (plannedStatus === 'yes') return 'status-yes';
		if (plannedStatus === 'no') return 'status-no';
		if (plannedStatus === 'maybe') return 'status-maybe';
		if (plannedStatus === 'late') return 'status-late';
		return 'status-none';
	}

	function getAttendanceClass(actualStatus: ActualStatus | null): string {
		if (actualStatus === 'present') return 'status-yes';
		if (actualStatus === 'absent') return 'status-no';
		if (actualStatus === 'late') return 'status-late';
		return 'status-none';
	}

	function getRsvpText(plannedStatus: PlannedStatus | null): string {
		if (plannedStatus === 'yes') return '✓';
		if (plannedStatus === 'no') return '✗';
		if (plannedStatus === 'maybe') return '?';
		if (plannedStatus === 'late') return '⏰';
		return '·';
	}

	function getAttendanceText(actualStatus: ActualStatus | null): string {
		if (actualStatus === 'present') return '✓';
		if (actualStatus === 'absent') return '✗';
		if (actualStatus === 'late') return '⏰';
		return '·';
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (data.season) params.set('seasonId', data.season.id);
		if (selectedSectionId) params.set('sectionId', selectedSectionId);

		goto(`/events/roster?${params.toString()}`);
	}

	let csvExportUrl = $derived(() => {
		const params = new URLSearchParams();
		if (filters.start) params.set('start', filters.start);
		if (filters.end) params.set('end', filters.end);
		if (filters.sectionId) params.set('sectionId', filters.sectionId);
		params.set('format', 'csv');
		return `/api/events/roster?${params.toString()}`;
	});

	function navigateToEvent(eventId: string) {
		window.location.href = `/events/${eventId}`;
	}
</script>

<!-- Close popup when clicking outside + track vertical scroll for header unstick -->
<svelte:window
	onclick={(e) => {
		if (activePopup && !(e.target as HTMLElement).closest('.participation-popup, .participation-cell')) {
			closePopup();
		}
	}}
	onscroll={handleWindowScroll}
/>

<svelte:head>
	<title>{m.roster_title()} | Polyphony Vault</title>
</svelte:head>

<div class="container mx-auto max-w-full px-4 py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">{m.roster_title()}</h1>
		<div class="mt-2 flex items-center gap-4">
			<p class="text-gray-600">{m.roster_description()}</p>
			<a href="/events/roster/classic" class="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap">
				{m.roster_classic_link()}
			</a>
		</div>
	</div>

	<!-- Season Navigation -->
	{#if data.season}
		<SeasonNavigation
			currentSeasonName={data.season.name}
			prev={data.seasonNav.prev}
			next={data.seasonNav.next}
			basePath="/events/roster"
			paramName="seasonId"
		/>
	{:else}
		<Card class="mb-6">
			<p class="text-gray-500">{m.no_active_season()}</p>
		</Card>
	{/if}

	<!-- Filter Controls -->
	<Card class="mb-6">
		<div class="flex flex-wrap items-end gap-4">
			<div class="flex-1 min-w-50">
				<label for="section-filter" class="block text-sm font-medium text-gray-700 mb-1">
					{m.roster_section_filter_label()}
				</label>
				<select
					id="section-filter"
					bind:value={selectedSectionId}
					onchange={applyFilters}
					class="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
				>
					<option value="">{m.roster_section_filter_all()}</option>
					{#each sections as section}
						<option value={section.id}>{section.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<a
					href={csvExportUrl()}
					class="inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition hover:bg-gray-50"
					download="roster.csv"
				>
					{m.roster_export_csv_btn()}
				</a>
			</div>
		</div>
	</Card>

	<!-- Roster Table -->
	{#if roster.events.length === 0}
		<Card padding="lg" class="text-center">
			<p class="text-gray-500">{m.roster_no_events()}</p>
		</Card>
	{:else if roster.members.length === 0}
		<Card padding="lg" class="text-center">
			<p class="text-gray-500">{m.roster_no_members()}</p>
		</Card>
	{:else}
		<!-- Header band: sticky when content extends below viewport, static otherwise (#247) -->
		<div
			class="{headerShouldStick ? 'sticky top-0 z-40 shadow-md' : 'z-40'} rounded-t-lg border-t border-x border-gray-200 bg-white"
			bind:this={headerScrollEl}
		>
					<div
						class="grid"
						style="grid-template-columns: {gridColumns}; min-width: min-content;"
					>
						<div
							class="sticky left-0 z-30 border-r-2 border-b-2 border-gray-300 bg-white px-2 py-3 text-center text-sm font-semibold text-gray-700 overflow-hidden"
							style="width: {columnWidth}px;"
						>
							{m.roster_table_name_header()}
						</div>

						{#each roster.events as event}
							<div
								class="border-r border-b-2 border-gray-300 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition"
								onclick={() => navigateToEvent(event.id)}
								title={m.event_col_click_to_view()}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && navigateToEvent(event.id)}
							>
								<div class="flex flex-col gap-0.5">
									<span class="font-semibold">{event.name}</span>
									<span class="text-gray-500">{formatDateShort(event.date, locale)}</span>
									<span class="text-gray-400">{formatTime(event.date, locale)}</span>
								</div>
							</div>
						{/each}
					</div>
		</div>

		<!-- Body band: horizontally scrollable -->
		<div
			class="rounded-b-lg border-x border-b border-gray-200 bg-white shadow-sm"
			style="overflow-x: auto; overflow-y: hidden;"
			bind:this={scrollContainer}
			onscroll={handleScroll}
		>
				<div
					class="grid"
					style="grid-template-columns: {gridColumns}; min-width: min-content;"
				>
				<!-- Member Rows -->
				{#each roster.members as member, index}
					{@const prevMember = index > 0 ? roster.members[index - 1] : null}
					{@const currentSectionId = member.primarySection?.id}
					{@const prevSectionId = prevMember?.primarySection?.id}
					{@const isNewSection = index === 0 || currentSectionId !== prevSectionId}

					{#if isNewSection && index > 0}
						<!-- Section Separator -->
						<div class="h-2 bg-gray-50" style="grid-column: 1 / -1;"></div>
					{/if}

					<!-- Member Name Cell (sticky first column) -->
					<div
						class="group sticky left-0 z-20 border-r-2 border-b border-gray-300 bg-white p-0 overflow-hidden hover:bg-gray-50"
						style="width: {columnWidth}px;"
					>
						<a
							href="/members/{member.id}"
							class="relative flex items-center px-2 py-3 hover:bg-blue-50"
							title={member.nickname || member.name}
						>
							<!-- Left side: full name + badge, fades out & scrolls out -->
							<div
								class="absolute left-2 flex items-center gap-2 transition-opacity duration-200"
								style="opacity: {fullNameOpacity}"
							>
								{#if isNewSection && member.primarySection}
									<SectionBadge section={member.primarySection} class="shrink-0" />
								{/if}
								<span class="text-sm font-medium text-gray-900 hover:text-blue-600 whitespace-nowrap">
									{member.nickname || member.name}
								</span>
							</div>

							<!-- Right side: initials, fades in & stays visible -->
							<span
								class="ml-auto text-right text-sm font-medium text-gray-900 hover:text-blue-600 transition-opacity duration-200"
								style="opacity: {initialsOpacity}"
							>
								{getInitials(member.nickname || member.name)}
							</span>
						</a>
					</div>

					<!-- Event Participation Cells -->
					{#each roster.events as event}
						{@const participationMap = event.participation}
						{@const status = participationMap.get(member.id)}
						{@const eventIsPast = isPast(event.date)}
						{@const canEditRsvp = canEditCellFor(member.id, event.date, 'rsvp')}
						{@const canEditAtt = canEditCellFor(member.id, event.date, 'attendance')}

						<div
							class="border-r border-b border-gray-200 group-hover:bg-gray-50 p-0 text-center text-sm"
							title="{member.name}{member.nickname ? ' (' + member.nickname + ')' : ''} - {event.name}"
						>
							{#if eventIsPast}
								<div class="flex mx-1 my-1 rounded-full overflow-hidden border border-gray-300">
									<button
										class="participation-cell flex-1 px-2 py-1 {getRsvpClass(status?.plannedStatus ?? null)} {canEditRsvp ? 'cursor-pointer hover:brightness-95' : 'cursor-default opacity-60'}"
										onclick={(e) => canEditRsvp && openPopup(e, member.id, event.id, 'rsvp')}
										disabled={!canEditRsvp}
										title="{m.roster_rsvp_label()}: {status?.plannedStatus ?? m.roster_rsvp_none()}"
									>
										{getRsvpText(status?.plannedStatus ?? null)}
									</button>
									<div class="w-px bg-gray-300"></div>
									<button
										class="participation-cell flex-1 px-2 py-1 {getAttendanceClass(status?.actualStatus ?? null)} {canEditAtt ? 'cursor-pointer hover:brightness-95' : 'cursor-default opacity-60'}"
										onclick={(e) => canEditAtt && openPopup(e, member.id, event.id, 'attendance')}
										disabled={!canEditAtt}
										title="{m.roster_attendance_label()}: {status?.actualStatus ?? m.roster_attendance_not_recorded()}"
									>
										{getAttendanceText(status?.actualStatus ?? null)}
									</button>
								</div>
							{:else}
								<div class="mx-1 my-1">
									<button
										class="participation-cell w-full rounded-full px-3 py-1 border border-gray-300 {getRsvpClass(status?.plannedStatus ?? null)} {canEditRsvp ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}"
										onclick={(e) => canEditRsvp && openPopup(e, member.id, event.id, 'rsvp')}
										disabled={!canEditRsvp}
										title="{m.roster_rsvp_label()}: {status?.plannedStatus ?? m.roster_rsvp_none()}"
									>
										{getRsvpText(status?.plannedStatus ?? null)}
									</button>
								</div>
							{/if}
						</div>
					{/each}
				{/each}
				</div>
		</div>

		<!-- Summary Stats -->
		<div class="mt-4 space-y-4">
			<Card>
				<div class="flex gap-6 text-sm text-gray-600">
					<div>
						<span class="font-medium">{m.roster_stats_events()}</span>
						{roster.summary.totalEvents}
					</div>
					<div>
						<span class="font-medium">{m.roster_stats_members()}</span>
						{roster.summary.totalMembers}
					</div>
					<div>
						<span class="font-medium">{m.roster_stats_attendance()}</span>
						{roster.summary.averageAttendance.toFixed(1)}%
					</div>
				</div>
			</Card>

			{#if Object.keys(sectionStats).length > 0}
				<Card>
					<h3 class="text-sm font-semibold text-gray-700 mb-3">{m.roster_section_breakdown_title()}</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{#each Object.entries(sectionStats).sort((a, b) => a[1].displayOrder - b[1].displayOrder) as [sectionId, stats]}
							{@const rsvpOpportunities = stats.memberCount * stats.eventCount}
							{@const attOpportunities = stats.memberCount * stats.pastEventCount}
							<div class="rounded border border-gray-200 bg-gray-50 p-3">
								<div class="flex items-center justify-between mb-2">
									<span class="font-medium text-gray-700">{stats.sectionName}</span>
									<span class="text-xs text-gray-500">{m.roster_section_singers_count({ count: stats.memberCount })}</span>
								</div>
								<div class="space-y-2 text-xs">
									<div>
										<div class="flex justify-between text-gray-600 mb-1">
											<span>{m.roster_rsvp_label()}</span>
											<span class="font-medium">
												{rsvpOpportunities > 0 ? ((stats.rsvpResponded / rsvpOpportunities) * 100).toFixed(0) : 0}%
											</span>
										</div>
										<div class="h-5 bg-gray-200 rounded-sm overflow-hidden flex" title={m.roster_rsvp_bar_tooltip({ yes: stats.rsvpYes, no: stats.rsvpNo, maybe: stats.rsvpMaybe, late: stats.rsvpLate, none: rsvpOpportunities - stats.rsvpResponded })}>
											{#if rsvpOpportunities > 0}
												<div class="h-full bg-green-500 transition-all" style="width: {(stats.rsvpYes / rsvpOpportunities) * 100}%"></div>
												<div class="h-full bg-red-500 transition-all" style="width: {(stats.rsvpNo / rsvpOpportunities) * 100}%"></div>
												<div class="h-full bg-yellow-500 transition-all" style="width: {(stats.rsvpMaybe / rsvpOpportunities) * 100}%"></div>
												<div class="h-full bg-orange-400 transition-all" style="width: {(stats.rsvpLate / rsvpOpportunities) * 100}%"></div>
											{/if}
										</div>
									</div>

									{#if stats.pastEventCount > 0}
										<div>
											<div class="flex justify-between text-gray-600 mb-1">
												<span>{m.roster_attendance_label()}</span>
												<span class="font-medium">
													{attOpportunities > 0 ? ((stats.attRecorded / attOpportunities) * 100).toFixed(0) : 0}%
												</span>
											</div>
											<div class="h-5 bg-gray-200 rounded-sm overflow-hidden flex" title={m.roster_attendance_bar_tooltip({ present: stats.attPresent, late: stats.attLate, absent: stats.attAbsent, none: attOpportunities - stats.attRecorded })}>
												{#if attOpportunities > 0}
													<div class="h-full bg-green-500 transition-all" style="width: {(stats.attPresent / attOpportunities) * 100}%"></div>
													<div class="h-full bg-orange-400 transition-all" style="width: {(stats.attLate / attOpportunities) * 100}%"></div>
													<div class="h-full bg-red-500 transition-all" style="width: {(stats.attAbsent / attOpportunities) * 100}%"></div>
												{/if}
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- RSVP/Attendance Popup -->
	{#if activePopup}
		<div
			class="participation-popup fixed z-50 rounded-lg border border-gray-200 bg-white shadow-lg"
			style="left: {popupPosition.x}px; top: {popupPosition.y}px; transform: translateX(-50%);"
		>
			{#if activePopup.type === 'rsvp'}
				<div class="p-2">
					<div class="text-xs text-gray-500 text-center mb-2 font-medium">{m.roster_rsvp_label()}</div>
					<div class="grid grid-cols-2 gap-1">
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-green-100'} bg-green-50 text-green-700"
							onclick={() => updateStatus('yes')}
							disabled={updating}
							title={m.roster_rsvp_yes_title()}
						>
							✓
						</button>
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-red-100'} bg-red-50 text-red-700"
							onclick={() => updateStatus('no')}
							disabled={updating}
							title={m.roster_rsvp_no_title()}
						>
							✗
						</button>
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-orange-100'} bg-orange-50 text-orange-700"
							onclick={() => updateStatus('late')}
							disabled={updating}
							title={m.roster_rsvp_late_title()}
						>
							⏰
						</button>
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-yellow-100'} bg-yellow-50 text-yellow-700"
							onclick={() => updateStatus('maybe')}
							disabled={updating}
							title={m.roster_rsvp_maybe_title()}
						>
							?
						</button>
					</div>
					<button
						class="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 py-1"
						onclick={() => updateStatus(null)}
						disabled={updating}
					>
						{m.roster_rsvp_clear()}
					</button>
				</div>
			{:else}
				<div class="p-2">
					<div class="text-xs text-gray-500 text-center mb-2 font-medium">{m.roster_attendance_label()}</div>
					<div class="grid grid-cols-2 gap-1">
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-green-100'} bg-green-50 text-green-700"
							onclick={() => updateStatus('present')}
							disabled={updating}
							title={m.roster_attendance_present_title()}
						>
							✓
						</button>
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-red-100'} bg-red-50 text-red-700"
							onclick={() => updateStatus('absent')}
							disabled={updating}
							title={m.roster_attendance_absent_title()}
						>
							✗
						</button>
						<button
							class="flex items-center justify-center w-10 h-10 rounded text-lg transition {updating ? 'opacity-50' : 'hover:bg-orange-100'} bg-orange-50 text-orange-700"
							onclick={() => updateStatus('late')}
							disabled={updating}
							title={m.roster_attendance_late_title()}
						>
							⏰
						</button>
						<div class="w-10 h-10"></div>
					</div>
					<button
						class="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 py-1"
						onclick={() => updateStatus(null)}
						disabled={updating}
					>
						{m.roster_attendance_clear()}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.status-yes {
		background-color: #d1fae5;
		color: #065f46;
	}

	.status-no {
		background-color: #fee2e2;
		color: #991b1b;
	}

	.status-maybe {
		background-color: #fef3c7;
		color: #92400e;
	}

	.status-late {
		background-color: #fed7aa;
		color: #9a3412;
	}

	.status-none {
		background-color: #f3f4f6;
		color: #6b7280;
	}

	/* Sticky column shadow */
	.sticky.left-0 {
		box-shadow: 2px 0 4px -2px rgba(0, 0, 0, 0.1);
	}
</style>
