// Navigation configuration — defines which nav items appear for which roles
// Extracted for testability and DRY between desktop/mobile layouts

export interface NavItem {
  href: string;
  labelKey: string;
  /** If set, only visible to users with at least one of these roles */
  roles?: string[];
  /** Visual group — items in different groups get a separator between them */
  group: "main" | "manage";
}

/**
 * All nav items in display order.
 * `group: 'main'` = visible to all authenticated members.
 * `group: 'manage'` = management section, role-gated.
 *
 * Note: Roster is NOT here — it's the home/landing page for logged-in users
 * (see +page.server.ts redirect), accessible via the org name link.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/events", labelKey: "nav_events", group: "main" },
  { href: "/seasons", labelKey: "nav_seasons", group: "main" },
  { href: "/works", labelKey: "nav_library", group: "main" },
  { href: "/guides", labelKey: "nav_guides", group: "main" },
  {
    href: "/editions",
    labelKey: "nav_editions",
    group: "manage",
    roles: ["librarian", "admin", "owner"],
  },
  {
    href: "/members",
    labelKey: "nav_members",
    group: "manage",
    roles: ["admin", "owner"],
  },
  {
    href: "/settings",
    labelKey: "nav_settings",
    group: "manage",
    roles: ["admin", "owner"],
  },
];

/**
 * Filter nav items by user roles.
 * Items without `roles` are always visible (main group).
 * Items with `roles` are visible if the user has at least one matching role.
 */
export function getVisibleNavItems(userRoles: string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((r) => userRoles.includes(r));
  });
}

/**
 * Check if a nav item is active based on the current URL path.
 * Matches exact path or any sub-path (e.g. /events matches /events/123).
 * Special case: '/' only matches exactly.
 */
export function isNavItemActive(href: string, currentPath: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(href + "/");
}

/**
 * Returns true when the user belongs to exactly one organization.
 * In that case, the nav shows a direct Roster link instead of the OrgSwitcher.
 */
export function shouldShowRosterLink(
  memberOrgs:
    | Array<{ id: string; name: string; subdomain: string }>
    | null
    | undefined,
): boolean {
  return Array.isArray(memberOrgs) && memberOrgs.length === 1;
}

/**
 * Build a URL to switch to another organization.
 * Always lands on /events/roster (the home view for logged-in users).
 * Accepts optional protocol/host for testability; falls back to polyphony.uk.
 */
export function buildOrgUrl(
  targetSubdomain: string,
  currentSubdomain: string,
  protocol?: string,
  host?: string,
): string {
  if (protocol && host) {
    const newHost = host.replace(currentSubdomain, targetSubdomain);
    return `${protocol}//${newHost}/events/roster`;
  }
  return `https://${targetSubdomain}.polyphony.uk/events/roster`;
}
