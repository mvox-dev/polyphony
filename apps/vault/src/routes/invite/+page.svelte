<script lang="ts">
	import type { PageData } from './$types';
	import { toast } from '$lib/stores/toast';
	import { VoiceBadge, SectionBadge } from '$lib/components/badges';
	import InviteLinkCard from '$lib/components/InviteLinkCard.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	// Roster member mode: inviting an existing roster-only member
	// Use $derived for reactive access when data changes (e.g., navigation)
	let rosterMember = $derived(data.rosterMember);

	// Form state
	let isSubmitting = $state(false);
	let success = $state('');
	let inviteLink = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!rosterMember) {
			toast.error(m.invite_error_required_member());
			return;
		}

		isSubmitting = true;
		success = '';
		inviteLink = '';

		try {
			const response = await fetch('/api/members/invite', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					rosterMemberId: rosterMember.id
				})
			});

			if (!response.ok) {
				const respData = (await response.json()) as { message?: string };
				throw new Error(respData.message ?? m.invite_error_send_failed());
			}

			const result = (await response.json()) as { inviteLink: string };
			inviteLink = result.inviteLink;
			success = m.invite_success_message({ name: rosterMember.name });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.invite_error_send_failed());
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>{m.invite_title()} | Polyphony Vault</title>
</svelte:head>

<div class="container mx-auto max-w-xl px-4 py-8">
	<div class="mb-8">
		<a href="/members" class="text-blue-600 hover:underline">{m.invite_back_to_members()}</a>
	</div>

	<h1 class="mb-6 text-3xl font-bold">{m.invite_title()}</h1>

	{#if !rosterMember}
		<!-- No roster member selected - show instructions -->
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-6">
			<h2 class="mb-2 text-lg font-semibold text-amber-800">{m.invite_no_member_title()}</h2>
			<p class="mb-4 text-amber-700">
				{m.invite_no_member_instructions()}
			</p>
			<ol class="mb-4 list-inside list-decimal space-y-2 text-amber-700">
				<li><a href="/members/add-roster" class="underline">{m.invite_step_1()}</a></li>
				<li>{m.invite_step_2()}</li>
				<li>{m.invite_step_3()}</li>
			</ol>
			<a
				href="/members/add-roster"
				class="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
			>
				{m.invite_add_roster_member()}
			</a>
		</div>
	{:else if data.pendingInviteLink}
		<!-- Member already has a pending invite - show copy link -->
		<div class="rounded-lg bg-white p-6 shadow-md">
			<div class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
				<h2 class="text-lg font-semibold">{rosterMember.name}</h2>
				<div class="mt-2 flex flex-wrap gap-2">
					{#if rosterMember.voices.length > 0}
						{#each rosterMember.voices as voice, index}
							<VoiceBadge {voice} isPrimary={index === 0} />
						{/each}
					{/if}
					{#if rosterMember.sections.length > 0}
						{#each rosterMember.sections as section, index}
							<SectionBadge {section} isPrimary={index === 0} />
						{/each}
					{/if}
				</div>
			</div>

			<InviteLinkCard 
				inviteLink={data.pendingInviteLink}
				memberName={rosterMember.name}
				variant="info"
			/>

			<div class="mt-4 text-center">
				<a href="/members" class="text-blue-600 hover:underline">{m.invite_back_to_members()}</a>
			</div>
		</div>
	{:else}
		<!-- Inviting a roster member -->
		<div class="rounded-lg bg-white p-6 shadow-md">
			{#if success}
				<InviteLinkCard 
					{inviteLink}
					memberName={rosterMember.name}
					variant="success"
				/>
			{:else}
				<div class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
					<h2 class="text-lg font-semibold">{rosterMember.name}</h2>
					<div class="mt-2 flex flex-wrap gap-2">
						{#if rosterMember.voices.length > 0}
							{#each rosterMember.voices as voice, index}
								<VoiceBadge {voice} isPrimary={index === 0} />
							{/each}
						{/if}
						{#if rosterMember.sections.length > 0}
							{#each rosterMember.sections as section, index}
								<SectionBadge {section} isPrimary={index === 0} />
							{/each}
						{/if}
					</div>
				</div>

				<form onsubmit={handleSubmit} class="space-y-4">
					<div>
						<p class="mb-2 block text-sm font-medium text-gray-700">
							{m.invite_roles_legend()}
						</p>
						<div class="flex flex-wrap gap-2">
							{#if rosterMember.roles.length > 0}
								{#each rosterMember.roles as role}
									<span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
										{m[`roles_${role}`]()}
									</span>
								{/each}
							{:else}
								<span class="text-sm text-gray-500">{m.member_no_roles()}</span>
							{/if}
						</div>
					</div>

					<button
						type="submit"
						disabled={isSubmitting}
						class="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-300"
					>
						{#if isSubmitting}
							{m.invite_sending()}
						{:else}
							{m.invite_send_invitation()}
						{/if}
					</button>
				</form>

				<div class="mt-6 border-t pt-4 text-sm text-gray-500">
					<p>
						{m.invite_link_info({ name: rosterMember.name })}
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
