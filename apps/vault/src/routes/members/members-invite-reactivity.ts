// Utility for deriving pendingInviteLinks from the reactive invites array.
// Fixes issue #258: revoking/renewing an invite must update the member list
// immediately without a page refresh.
//
// TODO: implement buildPendingInviteLinks and export InviteForLinkMap type.
// This stub exists so tests can be collected — they will all fail until implemented.

export interface InviteForLinkMap {
  /** The invite row id */
  id: string;
  /** The roster member this invite is addressed to */
  rosterId: string;
  /** Full invite URL including token */
  inviteLink: string;
}

/**
 * Derive a pendingInviteLinks map from the reactive invites array.
 * Returns a Record<rosterId, inviteLink> that MemberListCard uses to decide
 * whether to show the blue "Pending invite" box or the amber "No invite sent" box.
 */
export function buildPendingInviteLinks(
  invites: ReadonlyArray<InviteForLinkMap>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const invite of invites) {
    result[invite.rosterId] = invite.inviteLink;
  }
  return result;
}
