<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import PendingInvitesCard from '$lib/components/PendingInvitesCard.svelte';
	import MemberListCard from '$lib/components/MemberListCard.svelte';
	import type { Invite } from '$lib/components/PendingInvitesCard.svelte';
	import type { DisplayMember } from '$lib/components/MemberListCard.svelte';
	import type { Role } from '$lib/types';
	import { toast } from '$lib/stores/toast';
	import * as m from '$lib/paraglide/messages.js';
	import { buildPendingInviteLinks } from './members-invite-reactivity';

	let { data }: { data: PageData } = $props();

	// Make reactive copies of data for local updates
	let members = $state(untrack(() => data.members as DisplayMember[]));
	let invites = $state(untrack(() => data.invites as Invite[]));

	// Derived from invites so it updates instantly on revoke/renew (issue #258)
	let pendingInviteLinks = $derived(buildPendingInviteLinks(invites));
	
	// UI state
	let searchQuery = $state('');
	let updatingMember = $state<string | null>(null);
	let removingMember = $state<string | null>(null);
	let revokingInvite = $state<string | null>(null);
	let renewingInvite = $state<string | null>(null);

	// Watch for data changes (e.g., on navigation) and update local state
	$effect(() => {
		members = data.members as DisplayMember[];
		invites = data.invites as Invite[];
	});

	// Check for success message from query param
	$effect(() => {
		const addedName = $page.url.searchParams.get('added');
		if (addedName) {
			toast.success(m.members_toast_roster_added({ name: addedName }));
			// Remove query param from URL without reload
			const url = new URL($page.url);
			url.searchParams.delete('added');
			history.replaceState({}, '', url);
		}
	});

	// ============================================================================
	// INVITE OPERATIONS
	// ============================================================================

	async function revokeInvite(inviteId: string, name: string) {
		const confirmed = confirm(m.members_revoke_confirm({ name }));
		if (!confirmed) return;

		revokingInvite = inviteId;

		try {
			const response = await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_revoke_invite());
			}
			invites = invites.filter((inv) => inv.id !== inviteId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_revoke_invite());
		} finally {
			revokingInvite = null;
		}
	}

	async function renewInvite(inviteId: string, name: string) {
		renewingInvite = inviteId;

		try {
			const response = await fetch(`/api/invites/${inviteId}/renew`, { method: 'POST' });
			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_renew_invite());
			}
			
			// API returns raw DB format, transform to UI format
			const rawInvite = await response.json() as {
				id: string;
				roster_member_id: string;
				roster_member_name: string;
				expires_at: string;
				created_at: string;
				voices: typeof invites[0]['voices'];
				sections: typeof invites[0]['sections'];
			};

			// Find original to preserve inviteLink and invitedBy
			const original = invites.find((inv) => inv.id === inviteId);

			const renewedInvite: Invite = {
				id: rawInvite.id,
				rosterId: rawInvite.roster_member_id,
				name: rawInvite.roster_member_name,
				expiresAt: rawInvite.expires_at,
				invitedBy: original?.invitedBy ?? m.members_invited_by_unknown(),
				inviteLink: original?.inviteLink ?? '',
				voices: rawInvite.voices,
				sections: rawInvite.sections
			};
			
			invites = invites.map((inv) => (inv.id === inviteId ? renewedInvite : inv));
			toast.success(m.members_toast_invite_renewed({ name }));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_renew_invite());
		} finally {
			renewingInvite = null;
		}
	}

	async function copyInviteLink(link: string, name: string) {
		try {
			await navigator.clipboard.writeText(link);
			toast.success(m.members_toast_invite_link_copied({ name }));
		} catch {
			toast.error(m.members_error_copy_link({ name }));
		}
	}

	// ============================================================================
	// MEMBER OPERATIONS
	// ============================================================================

	async function toggleRole(memberId: string, role: Role) {
		const member = members.find((m) => m.id === memberId);
		if (!member) return;

		const hasRole = member.roles.includes(role);
		const action = hasRole ? 'remove' : 'add';

		// Prevent removing last owner
		if (role === 'owner' && hasRole) {
			const ownerCount = members.filter((m) => m.roles.includes('owner')).length;
			if (ownerCount <= 1) {
				toast.error(m.members_cannot_remove_last_owner());
				return;
			}
		}

		updatingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}/roles`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role, action })
			});

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_update_role());
			}

			members = members.map((m) =>
				m.id === memberId
					? {
							...m,
							roles: action === 'add'
								? [...m.roles, role]
								: m.roles.filter((r) => r !== role)
						}
					: m
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_update_role());
		} finally {
			updatingMember = null;
		}
	}

	async function addVoice(memberId: string, voiceId: string, isPrimary: boolean) {
		updatingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}/voices`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ voiceId, isPrimary })
			});

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_add_voice());
			}

			const voice = data.availableVoices.find((v: { id: string }) => v.id === voiceId);
			if (voice) {
				members = members.map((m) =>
					m.id === memberId
						? { ...m, voices: isPrimary ? [voice, ...m.voices] : [...m.voices, voice] }
						: m
				);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_add_voice());
		} finally {
			updatingMember = null;
		}
	}

	async function removeVoice(memberId: string, voiceId: string) {
		updatingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}/voices`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ voiceId })
			});

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_remove_voice());
			}

			members = members.map((m) =>
				m.id === memberId
					? { ...m, voices: m.voices.filter((v) => v.id !== voiceId) }
					: m
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_remove_voice());
		} finally {
			updatingMember = null;
		}
	}

	async function addSection(memberId: string, sectionId: string, isPrimary: boolean) {
		updatingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}/sections`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sectionId, isPrimary })
			});

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_add_section());
			}

			const section = data.availableSections.find((s: { id: string }) => s.id === sectionId);
			if (section) {
				members = members.map((m) =>
					m.id === memberId
						? { ...m, sections: isPrimary ? [section, ...m.sections] : [...m.sections, section] }
						: m
				);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_add_section());
		} finally {
			updatingMember = null;
		}
	}

	async function removeSection(memberId: string, sectionId: string) {
		updatingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}/sections`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sectionId })
			});

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_remove_section());
			}

			members = members.map((m) =>
				m.id === memberId
					? { ...m, sections: m.sections.filter((s) => s.id !== sectionId) }
					: m
			);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_remove_section());
		} finally {
			updatingMember = null;
		}
	}

	async function removeMember(memberId: string, memberName: string) {
		const confirmed = confirm(m.members_confirm_remove({ memberName }));

		if (!confirmed) return;

		removingMember = memberId;

		try {
			const response = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });

			if (!response.ok) {
				const result = (await response.json()) as { message?: string };
				throw new Error(result.message ?? m.members_error_remove_member());
			}

			members = members.filter((m) => m.id !== memberId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.members_error_remove_member());
		} finally {
			removingMember = null;
		}
	}
</script>

<svelte:head>
	<title>{m.members_manage_title()} | Polyphony Vault</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">{m.members_manage_title()}</h1>
			<p class="mt-2 text-gray-600">{m.members_description()}</p>
		</div>
		<div class="flex gap-3">
			<a
				href="/members/add-roster"
				class="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition hover:bg-blue-50"
			>
				{m.members_add_roster_btn()}
			</a>
			<a
				href="/invite"
				class="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
			>
				{m.members_invite_btn()}
			</a>
		</div>
	</div>

	<!-- Pending Invitations -->
	<PendingInvitesCard
		bind:invites
		onRevoke={revokeInvite}
		onRenew={renewInvite}
		onCopyLink={copyInviteLink}
		{revokingInvite}
		{renewingInvite}
	/>

	<!-- Search -->
	<div class="mb-6">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder={m.members_search_placeholder()}
			class="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
			aria-label={m.members_search_placeholder()}
		/>
	</div>

	<!-- Members List -->
	<MemberListCard
		bind:members
		currentUserId={data.currentUserId}
		isOwner={data.isOwner}
		isAdmin={data.isAdmin}
		availableVoices={data.availableVoices}
		availableSections={data.availableSections}
		pendingInviteLinks={pendingInviteLinks}
		{searchQuery}
		onToggleRole={toggleRole}
		onAddVoice={addVoice}
		onRemoveVoice={removeVoice}
		onAddSection={addSection}
		onRemoveSection={removeSection}
		onRemoveMember={removeMember}
		{updatingMember}
		{removingMember}
	/>
</div>
