// Shared types for the vault application
// These types are used across both server and client code

import type { OrgId } from "@polyphony/shared";

// All assignable roles - single source of truth
// Database CHECK constraint must be kept in sync manually (migrations)
export const ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "librarian",
  "conductor",
  "section_leader",
] as const;
export type Role = (typeof ASSIGNABLE_ROLES)[number];

// Event types - single source of truth
// Database CHECK constraint must be kept in sync manually (migrations)
export const EVENT_TYPES = [
  "rehearsal",
  "concert",
  "retreat",
  "festival",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ============================================================================
// ORGANIZATIONS SYSTEM (Schema V2)
// ============================================================================

export type OrganizationType = "umbrella" | "collective";

/**
 * Organization: A choir or umbrella entity
 * - collective: Regular choir (most common)
 * - umbrella: Organization that contains other organizations
 */
export interface Organization {
  id: OrgId;
  name: string;
  subdomain: string;
  type: OrganizationType;
  contactEmail: string;
  createdAt: string;
  // i18n preferences (Epic #183)
  language: string | null; // ISO 639-1: 'et', 'en'
  locale: string | null; // BCP 47: 'et-EE', 'en-US'
  timezone: string | null; // IANA: 'Europe/Tallinn'
  trustIndividualResponsibility: boolean; // Issue #240: delegate RSVP/attendance to members
}

/**
 * Input for creating a new organization
 */
export interface CreateOrganizationInput {
  name: string;
  subdomain: string;
  type: OrganizationType;
  contactEmail: string;
}

/**
 * Input for updating an organization
 */
export interface UpdateOrganizationInput {
  name?: string;
  contactEmail?: string;
  // i18n preferences (Epic #183)
  language?: string | null;
  locale?: string | null;
  timezone?: string | null;
  // Issue #240: Trust Individual Responsibility
  trustIndividualResponsibility?: boolean;
}

// ============================================================================
// MEMBER PREFERENCES (Epic #183 - i18n)
// ============================================================================

/**
 * Member i18n preferences (overrides organization defaults)
 */
export interface MemberPreferences {
  memberId: string;
  language: string | null;
  locale: string | null;
  timezone: string | null;
  updatedAt: string;
}

/**
 * Input for updating member preferences
 */
export interface UpdateMemberPreferencesInput {
  language?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

// ============================================================================
// MEMBER ORGANIZATIONS SYSTEM (Schema V2)
// ============================================================================

/**
 * Member-Organization relationship (junction table)
 * Links a global member identity to an organization with org-specific data
 */
export interface MemberOrganization {
  memberId: string;
  orgId: string;
  nickname: string | null; // Org-specific display name
  invitedBy: string | null;
  joinedAt: string;
}

/**
 * Lightweight org summary for org switcher UI
 * Only the fields needed to render a link to another org
 */
export interface OrgSummary {
  id: string;
  name: string;
  subdomain: string;
}

/**
 * Input for adding a member to an organization
 */
export interface AddMemberToOrgInput {
  memberId: string;
  orgId: string;
  nickname?: string;
  invitedBy?: string;
}

// ============================================================================
// AFFILIATIONS SYSTEM (Schema V2 - Issue #164)
// ============================================================================

/**
 * Affiliation: Relationship between collective and umbrella organizations
 * Tracks history (leftAt = null means active)
 */
export interface Affiliation {
  id: string;
  collectiveId: string;
  umbrellaId: string;
  joinedAt: string;
  leftAt: string | null; // null = active
}

/**
 * Input for creating a new affiliation
 */
export interface CreateAffiliationInput {
  collectiveId: string;
  umbrellaId: string;
}

// ============================================================================
// MEMBER SYSTEM
// ============================================================================

/**
 * Full member record from database
 * Canonical definition - used throughout the vault application
 */
export interface Member {
  id: string;
  name: string;
  nickname: string | null;
  email_id: string | null; // OAuth identity
  email_contact: string | null; // Contact preference
  roles: Role[]; // Aggregate roles (multi-role system)
  voices: Voice[];
  sections: Section[];
  invited_by: string | null;
  joined_at: string;
  orgRoles?: Record<string, Role[]>; // Org-specific roles (Schema V2)
}

/**
 * Minimal member context for permission checks
 * Used by hasPermission(), hasRole(), requireRole()
 */
export type MemberAuthContext = Pick<
  Member,
  "id" | "roles" | "email_id" | "orgRoles"
>;

// ============================================================================
// VOICES & SECTIONS SYSTEM
// ============================================================================

/**
 * Voice: Vocal capability (what you CAN sing)
 * Example: Thomas can sing Tenor OR Baritone
 */
export interface Voice {
  id: string;
  name: string;
  abbreviation: string;
  category: "vocal" | "instrumental";
  rangeGroup: string | null;
  displayOrder: number;
  isActive: boolean;
}

/**
 * Section: Performance assignment (where you DO sing)
 * Example: Thomas performs in Tenor 2
 * Sections are per-organization (Schema V2)
 */
export interface Section {
  id: string;
  orgId: string; // Schema V2: sections are per-organization
  name: string;
  abbreviation: string;
  parentSectionId: string | null;
  displayOrder: number;
  isActive: boolean;
}

/**
 * Member voice assignment (junction table)
 */
export interface MemberVoice {
  memberId: string;
  voiceId: string;
  isPrimary: boolean;
  assignedAt: string;
  assignedBy: string | null;
  notes: string | null;
}

/**
 * Member section assignment (junction table)
 */
export interface MemberSection {
  memberId: string;
  sectionId: string;
  isPrimary: boolean;
  joinedAt: string;
  assignedBy: string | null;
  notes: string | null;
}

/**
 * Invite voice assignment (junction table)
 */
export interface InviteVoice {
  inviteId: string;
  voiceId: string;
  isPrimary: boolean;
}

/**
 * Invite section assignment (junction table)
 */
export interface InviteSection {
  inviteId: string;
  sectionId: string;
  isPrimary: boolean;
}

/**
 * Input for creating a new voice
 */
export interface CreateVoiceInput {
  orgId: string; // Schema V2: required
  name: string;
  abbreviation: string;
  category: "vocal" | "instrumental";
  rangeGroup?: string;
  displayOrder: number;
  isActive?: boolean;
}

/**
 * Input for creating a new section
 */
export interface CreateSectionInput {
  orgId: string; // Schema V2: required
  name: string;
  abbreviation: string;
  parentSectionId?: string;
  displayOrder: number;
  isActive?: boolean;
}

// ============================================================================
// PARTICIPATION SYSTEM
// ============================================================================

export type PlannedStatus = "yes" | "no" | "maybe" | "late";
export type ActualStatus = "present" | "absent" | "late";

/**
 * Participation record for an event
 */
export interface Participation {
  id: string;
  memberId: string;
  eventId: string;

  // RSVP (member sets)
  plannedStatus: PlannedStatus | null;
  plannedAt: string | null;
  plannedNotes: string | null;

  // Actual attendance (conductor records)
  actualStatus: ActualStatus | null;
  recordedAt: string | null;
  recordedBy: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating participation record
 */
export interface CreateParticipationInput {
  memberId: string;
  eventId: string;
  plannedStatus?: PlannedStatus;
  plannedNotes?: string;
}

/**
 * Input for updating participation (RSVP or recording attendance)
 * Use null to clear a status, undefined to leave unchanged
 */
export interface UpdateParticipationInput {
  plannedStatus?: PlannedStatus | null;
  plannedNotes?: string | null;
  actualStatus?: ActualStatus | null;
  recordedBy?: string;
}

/**
 * Summary statistics for an event
 */
export interface ParticipationSummary {
  eventId: string;
  totalMembers: number;

  // Planned counts
  plannedYes: number;
  plannedNo: number;
  plannedMaybe: number;
  plannedLate: number;
  noResponse: number;

  // Actual counts (if event is past)
  actualPresent: number;
  actualAbsent: number;
  actualLate: number;
  notRecorded: number;
}

// ============================================================================
// ROSTER VIEW SYSTEM
// ============================================================================

/**
 * Complete roster view for display
 */
export interface RosterView {
  events: RosterEvent[];
  members: RosterMember[];
  summary: RosterSummary;
}

/**
 * Event with participation data
 */
export interface RosterEvent {
  id: string;
  name: string;
  date: string;
  type: EventType;
  participation: Map<string, ParticipationStatus>; // memberId -> status
}

/**
 * Member with section and voice info for roster
 */
export interface RosterMember {
  id: string;
  name: string;
  nickname: string | null; // Optional compact display name
  email: string | null; // OAuth email_id (null for roster-only members)
  primarySection: Section | null;
  allSections: Section[];
  primaryVoice: Voice | null;
}

/**
 * Participation status for a single member/event combo
 */
export interface ParticipationStatus {
  plannedStatus: PlannedStatus | null;
  actualStatus: ActualStatus | null;
  recordedAt: string | null;
}

/**
 * Summary statistics for roster view
 */
export interface RosterSummary {
  totalEvents: number;
  totalMembers: number;
  averageAttendance: number; // Percentage
  sectionStats: Record<string, SectionSummaryStats>; // sectionId -> stats
}

/**
 * Section-based summary statistics (Epic #73)
 */
export interface SectionSummaryStats {
  sectionName: string;
  sectionAbbr: string;
  total: number; // Total members in section
  yes: number; // Planned 'yes' across all upcoming events
  no: number;
  maybe: number;
  late: number;
  responded: number; // Total who responded (yes + no + maybe + late)
}

/**
 * Filters for roster view query
 */
export interface RosterViewFilters {
  orgId?: OrgId; // Filter by organization
  start?: string; // ISO datetime
  end?: string; // ISO datetime
  sectionId?: string; // Filter members by section
}

// ============================================================================
// SCORE LIBRARY SYSTEM (Epic #106)
// ============================================================================

/**
 * Work: Abstract composition (independent of specific publications)
 * Example: "Messiah" by Handel (may have many Editions)
 * Scoped per-organization (Schema V2)
 */
export interface Work {
  id: string;
  orgId: string;
  title: string;
  composer: string | null;
  lyricist: string | null;
  createdAt: string;
}

/**
 * Input for creating a new work
 */
export interface CreateWorkInput {
  orgId: string;
  title: string;
  composer?: string;
  lyricist?: string;
}

/**
 * Input for updating a work
 */
export interface UpdateWorkInput {
  title?: string;
  composer?: string | null;
  lyricist?: string | null;
}

// Edition type categories - single source of truth
// Database CHECK constraint must be kept in sync manually (migrations)
export const EDITION_TYPES = [
  "full_score",
  "vocal_score",
  "part",
  "reduction",
  "audio",
  "video",
  "supplementary",
] as const;
export type EditionType = (typeof EDITION_TYPES)[number];

// License types - single source of truth
// Database CHECK constraint must be kept in sync manually (migrations)
export const LICENSE_TYPES = ["public_domain", "licensed", "owned"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/**
 * Edition: Specific publication or arrangement of a work
 * Example: "Novello Vocal Score" of Messiah
 */
export interface Edition {
  id: string;
  workId: string;
  name: string;
  arranger: string | null;
  publisher: string | null;
  voicing: string | null;
  editionType: EditionType;
  licenseType: LicenseType;
  notes: string | null;
  externalUrl: string | null;
  fileKey: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileUploadedAt: string | null;
  fileUploadedBy: string | null;
  createdAt: string;
  // Joined data
  sectionIds?: string[];
}

/**
 * Input for creating a new edition
 */
export interface CreateEditionInput {
  workId: string;
  name: string;
  arranger?: string;
  publisher?: string;
  voicing?: string;
  editionType?: EditionType;
  licenseType?: LicenseType;
  notes?: string;
  externalUrl?: string;
  sectionIds?: string[];
}

/**
 * Input for updating an edition
 */
export interface UpdateEditionInput {
  name?: string;
  arranger?: string | null;
  publisher?: string | null;
  voicing?: string | null;
  editionType?: EditionType;
  licenseType?: LicenseType;
  notes?: string | null;
  externalUrl?: string | null;
  sectionIds?: string[];
}

// ============================================================================
// PHYSICAL COPIES SYSTEM (Epic #106 Phase B)
// ============================================================================

// Copy conditions - single source of truth
// Database CHECK constraint must be kept in sync manually (migrations)
export const COPY_CONDITIONS = ["good", "fair", "poor", "lost"] as const;
export type CopyCondition = (typeof COPY_CONDITIONS)[number];

/**
 * Physical copy of an edition (individual numbered copy)
 */
export interface PhysicalCopy {
  id: string;
  editionId: string;
  copyNumber: string;
  condition: CopyCondition;
  acquiredAt: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Input for creating a single physical copy
 */
export interface CreatePhysicalCopyInput {
  editionId: string;
  copyNumber: string;
  condition?: CopyCondition;
  acquiredAt?: string;
  notes?: string;
}

/**
 * Input for batch creating physical copies
 */
export interface BatchCreateCopiesInput {
  editionId: string;
  count: number;
  prefix?: string; // e.g., "M" → "M-01", "M-02", ...
  startNumber?: number; // Default 1
  condition?: CopyCondition;
  acquiredAt?: string;
}

/**
 * Input for updating a physical copy
 */
export interface UpdatePhysicalCopyInput {
  condition?: CopyCondition;
  notes?: string | null;
  acquiredAt?: string | null;
}

/**
 * Copy statistics for an edition
 */
export interface CopyStats {
  total: number;
  good: number;
  fair: number;
  poor: number;
  lost: number;
}

// ============================================================================
// SEASON REPERTOIRE SYSTEM (Epic #106 Phase C)
// ============================================================================

/**
 * Season repertoire work with editions
 * Used by API/UI to display a work in a season's repertoire
 */
export interface SeasonRepertoireWork {
  seasonWorkId: string; // season_works.id
  work: Work;
  displayOrder: number;
  notes: string | null;
  editions: SeasonRepertoireEdition[];
}

/**
 * Edition selected for a work in a season
 */
export interface SeasonRepertoireEdition {
  workEditionId: string; // season_work_editions.id
  edition: Edition;
  isPrimary: boolean;
  notes: string | null;
}

/**
 * Full season repertoire (works + editions tree)
 */
export interface SeasonRepertoire {
  seasonId: string;
  works: SeasonRepertoireWork[];
}

// ============================================================================
// EVENT REPERTOIRE SYSTEM (Issue #121)
// ============================================================================

/**
 * Event repertoire work with editions
 * Used by API/UI to display a work in an event's repertoire
 */
export interface EventRepertoireWork {
  eventWorkId: string; // event_works.id
  work: Work;
  displayOrder: number;
  notes: string | null;
  editions: EventRepertoireEdition[];
}

/**
 * Edition selected for a work in an event
 */
export interface EventRepertoireEdition {
  workEditionId: string; // event_work_editions.id
  edition: Edition;
  isPrimary: boolean;
  notes: string | null;
}

/**
 * Full event repertoire (works + editions tree)
 */
export interface EventRepertoire {
  eventId: string;
  works: EventRepertoireWork[];
}
