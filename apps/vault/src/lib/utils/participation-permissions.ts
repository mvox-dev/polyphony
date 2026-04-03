import { isPast } from "$lib/utils/formatters";

export interface CanEditCellParams {
  memberId: string;
  eventDate: string;
  type: "rsvp" | "attendance";
  currentMemberId: string;
  canManageParticipation: boolean;
  trustIndividualResponsibility: boolean;
}

/**
 * Determine whether the current user can edit a participation cell.
 *
 * Rules:
 * - Attendance: past events only. Managers always. Own record if trust enabled.
 * - RSVP: own future always. Own past if trust enabled. Managers can edit anyone.
 */
export function canEditCell(params: CanEditCellParams): boolean {
  const {
    memberId,
    eventDate,
    type,
    currentMemberId,
    canManageParticipation,
    trustIndividualResponsibility,
  } = params;
  const eventIsPast = isPast(eventDate);
  const isOwnRecord = memberId === currentMemberId;

  if (type === "attendance") {
    if (!eventIsPast) return false;
    if (canManageParticipation) return true;
    if (isOwnRecord && trustIndividualResponsibility) return true;
    return false;
  }

  // RSVP
  if (isOwnRecord && !eventIsPast) return true;
  if (isOwnRecord && eventIsPast && trustIndividualResponsibility) return true;
  if (canManageParticipation) return true;
  return false;
}
