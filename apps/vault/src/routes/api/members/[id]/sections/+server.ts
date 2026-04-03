// API endpoint for managing member sections
// POST: Add a section to a member
// DELETE: Remove a section from a member

import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { z } from "zod";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  getMemberById,
  addMemberSection,
  removeMemberSection,
} from "$lib/server/db/members";

// Validation schemas
const sectionSchema = z.object({
  sectionId: z.string().min(1, "Section ID is required"),
  isPrimary: z.boolean().optional().default(false),
});

const deleteSectionSchema = z.object({
  sectionId: z.string().min(1, "Section ID is required"),
});

export async function POST(event: RequestEvent) {
  const { params, request, platform, cookies, locals } = event;

  // Check database availability
  if (!platform?.env?.DB) {
    return json({ message: "Database not available" }, { status: 500 });
  }

  const db = platform.env.DB;
  const memberId = params.id!;
  const orgId = locals.org?.id;

  if (!orgId) {
    throw error(500, "Organization context not available");
  }

  // Authentication & Authorization
  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );
  await assertAdmin(currentMember);

  // Parse and validate request body
  const body = await request.json();
  const validation = sectionSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, "Invalid request: " + validation.error.message);
  }

  const { sectionId, isPrimary } = validation.data;

  // Check if member exists
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!member) {
    throw error(404, "Member not found");
  }

  // Add section to member (with org validation)
  await addMemberSection(
    db,
    memberId,
    sectionId,
    isPrimary,
    currentMember.id,
    locals.org.id,
  );

  return json({
    message: "Section added successfully",
    memberId,
    sectionId,
    isPrimary,
  });
}

export async function DELETE(event: RequestEvent) {
  const { params, request, platform, cookies, locals } = event;

  // Check database availability
  if (!platform?.env?.DB) {
    throw error(500, "Database not available");
  }

  const db = platform.env.DB;
  const memberId = params.id!;

  // Authentication & Authorization
  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );
  await assertAdmin(currentMember);

  // Parse and validate request body
  const body = await request.json();
  const validation = deleteSectionSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, "Invalid request: " + validation.error.message);
  }

  const { sectionId } = validation.data;

  // Check if member exists
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!member) {
    throw error(404, "Member not found");
  }

  // Remove section from member
  const removed = await removeMemberSection(db, memberId, sectionId);

  if (!removed) {
    throw error(404, "Section not assigned to this member");
  }

  return json({
    message: "Section removed successfully",
    memberId,
    sectionId,
  });
}
