// API endpoint for managing member voices
// PUT - Replace all voices (richer permissions)
// POST - Add voice to member
// DELETE - Remove voice from member
import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getAuthenticatedMember, assertAdmin } from '$lib/server/auth/middleware';
import { getMemberById, addMemberVoice, removeMemberVoice, setMemberVoices } from '$lib/server/db/members';
import { hasRole } from '$lib/server/auth/permissions';
import { z } from 'zod';

const voiceSchema = z.object({
	voiceId: z.string().min(1),
	isPrimary: z.boolean().optional().default(false)
});

const deleteVoiceSchema = z.object({
	voiceId: z.string().min(1)
});

/**
 * POST /api/members/[id]/voices
 * Add a voice to a member
 */
export async function POST(event: RequestEvent) {
	const { params, request, platform, cookies, locals } = event;
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const memberId = params.id;
	if (!memberId) {
		throw error(400, 'Member ID is required');
	}

	// Auth: require admin role
	const currentMember = await getAuthenticatedMember(db, cookies, locals.org.id);
	assertAdmin(currentMember);

	// Validate request body
	const body = await request.json();
	const parsed = voiceSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid request body: ' + parsed.error.message);
	}

	const { voiceId, isPrimary } = parsed.data;

	// Verify member exists
	const member = await getMemberById(db, memberId, locals.org.id);
	if (!member) {
		throw error(404, 'Member not found');
	}

	// Add voice
	await addMemberVoice(db, memberId, voiceId, isPrimary, currentMember.id);

	return json({
		message: 'Voice added successfully',
		memberId,
		voiceId,
		isPrimary
	});
}

/**
 * DELETE /api/members/[id]/voices
 * Remove a voice from a member
 */
export async function DELETE(event: RequestEvent) {
	const { params, request, platform, cookies, locals } = event;
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const memberId = params.id;
	if (!memberId) {
		throw error(400, 'Member ID is required');
	}

	// Auth: require admin role
	const currentMember = await getAuthenticatedMember(db, cookies, locals.org.id);
	assertAdmin(currentMember);

	// Validate request body
	const body = await request.json();
	const parsed = deleteVoiceSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid request body: ' + parsed.error.message);
	}

	const { voiceId } = parsed.data;

	// Verify member exists
	const member = await getMemberById(db, memberId, locals.org.id);
	if (!member) {
		throw error(404, 'Member not found');
	}

	// Remove voice
	const removed = await removeMemberVoice(db, memberId, voiceId);
	if (!removed) {
		throw error(404, 'Voice not assigned to this member');
	}

	return json({
		message: 'Voice removed successfully',
		memberId,
		voiceId
	});
}

const putVoiceSchema = z.object({
	voiceIds: z.array(z.string())
});

/**
 * PUT /api/members/[id]/voices
 * Replace all voices for a member.
 * Permissions: owner/admin/conductor = any member, section_leader = section overlap, self = own.
 */
export async function PUT(event: RequestEvent) {
	const { params, request, platform, cookies, locals } = event;
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const targetMemberId = params.id;
	if (!targetMemberId) {
		throw error(400, 'Member ID is required');
	}

	const orgId = locals.org.id;

	// Auth
	const currentMember = await getAuthenticatedMember(db, cookies, orgId);

	// Validate request body
	const body = await request.json();
	const parsed = putVoiceSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid request body: voiceIds must be an array of strings');
	}

	const { voiceIds } = parsed.data;

	// Verify target member exists
	const targetMember = await getMemberById(db, targetMemberId, orgId);
	if (!targetMember) {
		throw error(404, 'Member not found');
	}

	// Permission check
	const isSelf = currentMember.id === targetMemberId;
	const isAdminOrOwner = hasRole(currentMember, 'admin', String(orgId)) || hasRole(currentMember, 'owner', String(orgId));
	const isConductor = hasRole(currentMember, 'conductor', String(orgId));
	const isSectionLeader = hasRole(currentMember, 'section_leader', String(orgId));

	if (!isSelf && !isAdminOrOwner && !isConductor) {
		if (isSectionLeader) {
			// Check section overlap between current member and target
			const currentSectionIds = new Set(currentMember.sections.map(s => s.id));
			const hasOverlap = targetMember.sections.some(s => currentSectionIds.has(s.id));
			if (!hasOverlap) {
				throw error(403, 'Section leader can only edit members in their section');
			}
		} else {
			throw error(403, 'Insufficient permissions to edit member voices');
		}
	}

	await setMemberVoices(db, targetMemberId, voiceIds, currentMember.id);

	return json({ message: 'Voices updated successfully', memberId: targetMemberId, voiceIds });
}
