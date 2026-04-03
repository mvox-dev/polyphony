<script lang="ts">
	import type { Voice, Section } from '$lib/types';
	import { VoiceBadge, SectionBadge } from '$lib/components/badges';
	import { isExpired } from '$lib/utils/formatters';
	import * as m from '$lib/paraglide/messages.js';

	export interface Invite {
		id: string;
		/** roster_member_id — the member this invite is for */
		rosterId: string;
		name: string;
		expiresAt: string;
		invitedBy: string;
		inviteLink: string;
		voices?: Voice[];
		sections?: Section[];
	}

	interface Props {
		invites: Invite[];
		onRevoke: (inviteId: string, name: string) => Promise<void>;
		onRenew: (inviteId: string, name: string) => Promise<void>;
		onCopyLink: (link: string, name: string) => Promise<void>;
		revokingInvite: string | null;
		renewingInvite: string | null;
	}

	let {
		invites = $bindable(),
		onRevoke,
		onRenew,
		onCopyLink,
		revokingInvite,
		renewingInvite
	}: Props = $props();
</script>

{#if invites.length > 0}
	<div class="mb-8">
		<h2 class="mb-4 text-xl font-semibold text-gray-700">
			{m.invites_pending_title({ count: String(invites.length) })}
		</h2>
		<div class="space-y-3">
			{#each invites as invite (invite.id)}
				{@const expired = isExpired(invite.expiresAt)}
				<div class="flex items-center justify-between rounded-lg border p-4 {expired ? 'border-red-200 bg-red-50 opacity-75' : 'border-amber-200 bg-amber-50'}">
					<div class="flex-1">
						<div class="flex items-center gap-3">
							<span class="font-medium">{invite.name}</span>
							{#if expired}
								<span class="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
									{m.invites_expired_badge()}
								</span>
							{/if}

							<!-- Voice badges -->
							{#if invite.voices && invite.voices.length > 0}
								<div class="flex gap-1">
									{#each invite.voices as voice, index}
										<VoiceBadge {voice} isPrimary={index === 0} />
									{/each}
								</div>
							{/if}

							<!-- Section badges -->
							{#if invite.sections && invite.sections.length > 0}
								<div class="flex gap-1">
									{#each invite.sections as section, index}
										<SectionBadge {section} isPrimary={index === 0} />
									{/each}
								</div>
							{/if}
						</div>
						<p class="mt-1 text-sm {expired ? 'text-gray-600' : 'text-gray-500'}">
							{m.invites_invited_by({ name: invite.invitedBy })} ·
							{#if expired}
								{m.invites_expired_date({ date: new Date(invite.expiresAt).toLocaleDateString() })}
							{:else}
								{m.invites_expires_date({ date: new Date(invite.expiresAt).toLocaleDateString() })}
							{/if}
						</p>
					</div>
					<div class="flex items-center gap-2">
						<button
							onclick={() => onCopyLink(invite.inviteLink, invite.name)}
							class="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50"
							title={m.invites_copy_link_title()}
						>
							{m.invites_copy_link()}
						</button>
						{#if expired}
							<button
								onclick={() => onRenew(invite.id, invite.name)}
								disabled={renewingInvite === invite.id}
								class="rounded px-3 py-1 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
								title={m.invites_renew_title()}
							>
								{renewingInvite === invite.id ? m.invites_renewing() : m.invites_renew()}
							</button>
						{/if}
						<button
							onclick={() => onRevoke(invite.id, invite.name)}
							disabled={revokingInvite === invite.id}
							class="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
							title={m.invites_revoke_title()}
						>
							{revokingInvite === invite.id ? m.invites_revoking() : m.invites_revoke()}
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
