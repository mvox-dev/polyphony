// Centralized badge styling utilities
// Issue #143 - DRY: Extract shared utilities

import type { Role, EventType, LicenseType } from "$lib/types";
import { EVENT_TYPES } from "$lib/types";

// Re-export EVENT_TYPES for convenience
export { EVENT_TYPES };

// ============================================================================
// ROLE BADGES
// ============================================================================

/**
 * Get Tailwind classes for a role badge
 */
export function getRoleBadgeClass(role: Role | string): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "admin":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "librarian":
      return "bg-green-100 text-green-800 border-green-200";
    case "conductor":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "section_leader":
      return "bg-teal-100 text-teal-800 border-teal-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

/**
 * Get display label for a role
 */
export function getRoleLabel(role: Role | string): string {
  switch (role) {
    case "section_leader":
      return "Section Leader";
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

// ============================================================================
// EVENT TYPE BADGES
// ============================================================================

/**
 * Get Tailwind classes for an event type badge (bg and text separate)
 */
export function getEventTypeBadge(eventType: EventType | string): {
  bg: string;
  text: string;
} {
  switch (eventType) {
    case "concert":
      return { bg: "bg-purple-100", text: "text-purple-800" };
    case "rehearsal":
      return { bg: "bg-blue-100", text: "text-blue-800" };
    case "retreat":
      return { bg: "bg-green-100", text: "text-green-800" };
    case "festival":
      return { bg: "bg-orange-100", text: "text-orange-800" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-800" };
  }
}

/**
 * Get Tailwind classes for an event type badge (combined with border)
 */
export function getEventTypeBadgeClass(eventType: EventType | string): string {
  switch (eventType) {
    case "concert":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "rehearsal":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "retreat":
      return "bg-green-100 text-green-800 border-green-200";
    case "festival":
      return "bg-orange-100 text-orange-800 border-orange-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

/**
 * Get display label for an event type
 * Capitalizes the first letter (rehearsal -> Rehearsal)
 */
export function getEventTypeLabel(eventType: EventType | string): string {
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
}

// ============================================================================
// LICENSE TYPE BADGES
// ============================================================================

/**
 * Get Tailwind classes for a license type badge (bg and text separate)
 */
export function getLicenseBadge(licenseType: LicenseType | string): {
  bg: string;
  text: string;
} {
  switch (licenseType) {
    case "public_domain":
      return { bg: "bg-green-100", text: "text-green-800" };
    case "licensed":
      return { bg: "bg-amber-100", text: "text-amber-800" };
    case "owned":
      return { bg: "bg-blue-100", text: "text-blue-800" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-800" };
  }
}

/**
 * Get Tailwind classes for a license type badge (combined)
 */
export function getLicenseBadgeClass(
  licenseType: LicenseType | string,
): string {
  switch (licenseType) {
    case "public_domain":
      return "bg-green-100 text-green-800";
    case "licensed":
      return "bg-amber-100 text-amber-800";
    case "owned":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Get display label for a license type
 */
export function getLicenseLabel(licenseType: LicenseType | string): string {
  switch (licenseType) {
    case "public_domain":
      return "Public Domain";
    default:
      return licenseType.charAt(0).toUpperCase() + licenseType.slice(1);
  }
}

// ============================================================================
// VOICE & SECTION BADGES (consistent styling)
// ============================================================================

/**
 * Get Tailwind classes for a voice badge
 */
export function getVoiceBadgeClass(): string {
  return "bg-purple-100 text-purple-800";
}

/**
 * Get Tailwind classes for a section badge
 */
export function getSectionBadgeClass(): string {
  return "bg-teal-100 text-teal-800";
}

// ============================================================================
// RSVP / PARTICIPATION BADGES
// ============================================================================

/**
 * Get Tailwind classes for a planned status badge
 */
export function getPlannedStatusBadgeClass(status: string | null): string {
  switch (status) {
    case "yes":
      return "bg-green-100 text-green-800";
    case "no":
      return "bg-red-100 text-red-800";
    case "maybe":
      return "bg-amber-100 text-amber-800";
    case "late":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Get Tailwind classes for an actual attendance status badge
 */
export function getActualStatusBadgeClass(status: string | null): string {
  switch (status) {
    case "present":
      return "bg-green-100 text-green-800";
    case "absent":
      return "bg-red-100 text-red-800";
    case "late":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
