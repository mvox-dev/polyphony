<script lang="ts">
	import type { EventRepertoire, Work, Edition, EventRepertoireWork } from '$lib/types';
	import Card from '$lib/components/Card.svelte';
	import { toast } from '$lib/stores/toast';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		eventId: string;
		repertoire: EventRepertoire;
		availableWorks: Work[];
		workEditionsMap: Record<string, Edition[]>;
		seasonWorkIds: Set<string>;
		canManage: boolean;
		onUpdate?: () => void;
	}

	let {
		eventId,
		repertoire = $bindable(),
		availableWorks = $bindable(),
		workEditionsMap,
		seasonWorkIds,
		canManage,
		onUpdate
	}: Props = $props();

	// Local state
	let selectedWorkId = $state('');
	let addingWork = $state(false);
	let removingWorkId = $state<string | null>(null);
	let expandedWorkId = $state<string | null>(null);
	let addingEditionToWorkId = $state<string | null>(null);
	let selectedEditionId = $state('');
	let removingEditionId = $state<string | null>(null);

	// Group available works: season works first, then others
	let groupedAvailableWorks = $derived(() => {
		const inSeason = availableWorks.filter((w) => seasonWorkIds.has(w.id));
		const other = availableWorks.filter((w) => !seasonWorkIds.has(w.id));
		return { inSeason, other };
	});

	async function addWork() {
		if (!selectedWorkId || addingWork) return;

		addingWork = true;

		try {
			const response = await fetch(`/api/events/${eventId}/works`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workId: selectedWorkId })
			});

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message || 'Failed to add work');
			}

			const newEventWork = (await response.json()) as { id: string };

			// Find work from available works
			const work = availableWorks.find((w) => w.id === selectedWorkId);
			if (work) {
				repertoire = {
					...repertoire,
					works: [
						...repertoire.works,
						{
							eventWorkId: newEventWork.id,
							work,
							displayOrder: repertoire.works.length + 1,
							notes: null,
							editions: []
						}
					]
				};

				// Remove from available
				availableWorks = availableWorks.filter((w) => w.id !== selectedWorkId);
			}

			selectedWorkId = '';
			onUpdate?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to add work');
		} finally {
			addingWork = false;
		}
	}

	async function removeWork(eventWorkId: string, work: Work) {
		if (!confirm(m.repertoire_remove_confirm({ name: work.title }))) return;

		removingWorkId = eventWorkId;

		try {
			const response = await fetch(`/api/events/${eventId}/works/${eventWorkId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message || 'Failed to remove work');
			}

			// Update local state
			repertoire = {
				...repertoire,
				works: repertoire.works.filter((w) => w.eventWorkId !== eventWorkId)
			};

			// Add back to available
			availableWorks = [...availableWorks, work];
			onUpdate?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove work');
		} finally {
			removingWorkId = null;
		}
	}

	function toggleWork(eventWorkId: string) {
		expandedWorkId = expandedWorkId === eventWorkId ? null : eventWorkId;
	}

	function getAvailableEditions(workId: string, existingEditionIds: string[]): Edition[] {
		const editions = workEditionsMap[workId] || [];
		return editions.filter((e) => !existingEditionIds.includes(e.id));
	}

	async function addEdition(eventWorkId: string, workId: string) {
		if (!selectedEditionId) return;

		addingEditionToWorkId = eventWorkId;

		try {
			const response = await fetch(`/api/events/${eventId}/works/${eventWorkId}/editions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ editionId: selectedEditionId })
			});

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message || 'Failed to add edition');
			}

			const newWorkEdition = (await response.json()) as { id: string };

			// Find edition
			const edition = workEditionsMap[workId]?.find((e) => e.id === selectedEditionId);
			if (edition) {
				repertoire = {
					...repertoire,
					works: repertoire.works.map((w) => {
						if (w.eventWorkId !== eventWorkId) return w;
						const isFirst = w.editions.length === 0;
						return {
							...w,
							editions: [
								...w.editions,
								{
									workEditionId: newWorkEdition.id,
									edition,
									isPrimary: isFirst,
									notes: null
								}
							]
						};
					})
				};
			}

			selectedEditionId = '';
			onUpdate?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to add edition');
		} finally {
			addingEditionToWorkId = null;
		}
	}

	async function removeEdition(eventWorkId: string, workEditionId: string) {
		removingEditionId = workEditionId;

		try {
			const response = await fetch(
				`/api/events/${eventId}/works/${eventWorkId}/editions/${workEditionId}`,
				{ method: 'DELETE' }
			);

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message || 'Failed to remove edition');
			}

			repertoire = {
				...repertoire,
				works: repertoire.works.map((w) => {
					if (w.eventWorkId !== eventWorkId) return w;
					return {
						...w,
						editions: w.editions.filter((e) => e.workEditionId !== workEditionId)
					};
				})
			};
			onUpdate?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove edition');
		} finally {
			removingEditionId = null;
		}
	}

	async function setPrimaryEdition(eventWorkId: string, workEditionId: string) {
		try {
			const response = await fetch(
				`/api/events/${eventId}/works/${eventWorkId}/editions/${workEditionId}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ isPrimary: true })
				}
			);

			if (!response.ok) {
				const errData = (await response.json()) as { message?: string };
				throw new Error(errData.message || 'Failed to set primary edition');
			}

			repertoire = {
				...repertoire,
				works: repertoire.works.map((w) => {
					if (w.eventWorkId !== eventWorkId) return w;
					return {
						...w,
						editions: w.editions.map((e) => ({
							...e,
							isPrimary: e.workEditionId === workEditionId
						}))
					};
				})
			};
			onUpdate?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to set primary edition');
		}
	}
</script>

<Card padding="lg" class="mb-8">
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-2xl font-semibold">{m.repertoire_title()}</h2>
		{#if repertoire.works.length > 0}
			<span class="text-sm text-gray-500">
				{repertoire.works.length} {repertoire.works.length !== 1 ? m.repertoire_works_count_plural() : m.repertoire_works_count_singular()}
			</span>
		{/if}
	</div>

	<!-- Works List -->
	{#if repertoire.works.length === 0}
		<div class="py-8 text-center text-gray-500">
			<p>{m.repertoire_empty()}</p>
			{#if canManage}
				<p class="mt-2 text-sm">{m.repertoire_empty_help()}</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			{#each repertoire.works as repWork, index (repWork.eventWorkId)}
				{@const isExpanded = expandedWorkId === repWork.eventWorkId}
				{@const existingEditionIds = repWork.editions.map((e) => e.edition.id)}
				{@const availableEditions = getAvailableEditions(repWork.work.id, existingEditionIds)}

				<div class="rounded-lg border border-gray-200 bg-gray-50">
					<!-- Work Header -->
					<div class="flex items-center gap-3 p-4">
						<!-- Position -->
						<div class="shrink-0 text-2xl font-bold text-gray-400">
							{index + 1}
						</div>

						<!-- Work Details -->
						<button
							class="flex-1 text-left"
							onclick={() => toggleWork(repWork.eventWorkId)}
						>
							<h3 class="font-semibold text-gray-900">
								{repWork.work.title}
								{#if seasonWorkIds.has(repWork.work.id)}
									<span
										class="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700"
										title={m.repertoire_from_season_group()}
									>
										{m.repertoire_from_season()}
									</span>
								{/if}
							</h3>
							{#if repWork.work.composer}
								<p class="text-sm text-gray-600">{repWork.work.composer}</p>
							{/if}
							{#if repWork.editions.length > 0}
								<p class="mt-1 text-xs text-gray-500">
									{repWork.editions.length} {repWork.editions.length !== 1 ? m.repertoire_editions_count_plural() : m.repertoire_editions_count_singular()}
									{#if repWork.editions.find((e) => e.isPrimary)}
										{m.repertoire_primary_label()} {repWork.editions.find((e) => e.isPrimary)?.edition.name}
									{/if}
								</p>
							{/if}
						</button>

						<!-- Expand/Collapse Icon -->
						<button
							onclick={() => toggleWork(repWork.eventWorkId)}
							class="rounded p-1 text-gray-500 hover:bg-gray-200"
							title={isExpanded ? m.repertoire_collapse() : m.repertoire_expand()}
						>
							<svg
								class="h-5 w-5 transition-transform {isExpanded ? 'rotate-180' : ''}"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>

						<!-- Remove Button -->
						{#if canManage}
							<button
								onclick={() => removeWork(repWork.eventWorkId, repWork.work)}
								disabled={removingWorkId === repWork.eventWorkId}
								class="rounded p-1 text-red-600 hover:bg-red-100 disabled:opacity-50"
								title={m.repertoire_remove_from_repertoire()}
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						{/if}
					</div>

					<!-- Expanded: Editions Management -->
					{#if isExpanded}
						<div class="border-t border-gray-200 bg-white p-4">
							<h4 class="mb-3 text-sm font-medium text-gray-700">{m.repertoire_editions()}</h4>

							<!-- Existing Editions -->
							{#if repWork.editions.length === 0}
								<p class="mb-3 text-sm text-gray-500">{m.repertoire_no_editions()}</p>
							{:else}
								<div class="mb-4 space-y-2">
									{#each repWork.editions as edItem (edItem.workEditionId)}
										<div
											class="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2"
										>
											<!-- Primary Star -->
											<button
												onclick={() =>
													setPrimaryEdition(repWork.eventWorkId, edItem.workEditionId)}
												class="shrink-0 {edItem.isPrimary
													? 'text-yellow-500'
													: 'text-gray-300 hover:text-yellow-400'}"
												title={edItem.isPrimary ? m.repertoire_primary_edition() : m.repertoire_set_primary()}
												disabled={edItem.isPrimary}
											>
												<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
													<path
														d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
													/>
												</svg>
											</button>

											<!-- Edition Info -->
											<div class="flex-1">
												<span class="font-medium">{edItem.edition.name}</span>
												{#if edItem.edition.publisher}
													<span class="text-sm text-gray-500">
														({edItem.edition.publisher})
													</span>
												{/if}
											</div>

											<!-- Remove Edition -->
											{#if canManage}
												<button
													onclick={() =>
														removeEdition(repWork.eventWorkId, edItem.workEditionId)}
													disabled={removingEditionId === edItem.workEditionId}
													class="rounded p-1 text-red-600 hover:bg-red-100 disabled:opacity-50"
													title={m.repertoire_remove_edition()}
												>
													<svg
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M6 18L18 6M6 6l12 12"
														/>
													</svg>
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							<!-- Add Edition -->
							{#if canManage && availableEditions.length > 0}
								<div class="flex gap-2">
									<select
										bind:value={selectedEditionId}
										class="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
									>
										<option value="">{m.repertoire_select_edition()}</option>
										{#each availableEditions as ed (ed.id)}
											<option value={ed.id}>
												{ed.name}
												{ed.publisher ? `(${ed.publisher})` : ''}
											</option>
										{/each}
									</select>
									<button
										onclick={() => addEdition(repWork.eventWorkId, repWork.work.id)}
										disabled={!selectedEditionId || addingEditionToWorkId === repWork.eventWorkId}
										class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
									>
										{addingEditionToWorkId === repWork.eventWorkId ? m.repertoire_adding() : m.actions_add()}
									</button>
								</div>
							{:else if canManage}
								<p class="text-sm text-gray-500">
									{#if !workEditionsMap[repWork.work.id] || workEditionsMap[repWork.work.id].length === 0}
										{m.repertoire_no_editions_available()}
										<a href="/works/{repWork.work.id}" class="text-blue-600 hover:underline">
											{m.repertoire_add_editions_link()}
										</a>
									{:else}
										{m.repertoire_all_editions_added()}
									{/if}
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Add Work to Repertoire -->
	{#if canManage}
		<div class="mt-6 border-t border-gray-200 pt-6">
			<h3 class="mb-3 text-lg font-semibold">{m.repertoire_add_work()}</h3>

			{#if availableWorks.length === 0}
				<p class="text-sm text-gray-500">
					{m.repertoire_all_works_added()}
					<a href="/works" class="text-blue-600 hover:underline">{m.repertoire_create_work_link()}</a>
				</p>
			{:else}
				<div class="flex gap-2">
					<select
						bind:value={selectedWorkId}
						class="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
					>
						<option value="">{m.repertoire_select_work()}</option>
						{#if groupedAvailableWorks().inSeason.length > 0}
							<optgroup label={m.repertoire_from_season_group()}>
								{#each groupedAvailableWorks().inSeason as work (work.id)}
									<option value={work.id}>
										{work.title}{work.composer ? ` - ${work.composer}` : ''}
									</option>
								{/each}
							</optgroup>
						{/if}
						{#if groupedAvailableWorks().other.length > 0}
							<optgroup label={m.repertoire_other_works_group()}>
								{#each groupedAvailableWorks().other as work (work.id)}
									<option value={work.id}>
										{work.title}{work.composer ? ` - ${work.composer}` : ''}
									</option>
								{/each}
							</optgroup>
						{/if}
					</select>
					<button
						onclick={addWork}
						disabled={!selectedWorkId || addingWork}
						class="rounded-lg bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
					>
						{addingWork ? m.repertoire_adding() : m.actions_add()}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</Card>
