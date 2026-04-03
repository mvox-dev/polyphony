// Server load for root layout - provides auth state and org data to all pages
import { getMemberById } from "$lib/server/db/members";
import { getMemberOrgSummaries } from "$lib/server/db/member-organizations";
import { getSetting } from "$lib/server/db/settings";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ platform, cookies, locals }) => {
  // Always pass current org info to the client
  const org = locals.org
    ? { name: locals.org.name, subdomain: locals.org.subdomain }
    : null;

  const memberId = cookies.get("member_id");

  if (!memberId || !platform?.env?.DB) {
    return { user: null, locale: "system", org, memberOrgs: [] };
  }

  try {
    const [member, localeSetting] = await Promise.all([
      getMemberById(platform.env.DB, memberId, locals.org.id),
      getSetting(platform.env.DB, "locale", locals.org.id),
    ]);

    const locale = localeSetting || "system";

    if (!member) {
      // Invalid session - clear cookie
      cookies.delete("member_id", { path: "/" });
      return { user: null, locale, org, memberOrgs: [] };
    }

    // Fetch the member's other organizations for the org switcher
    const memberOrgs = await getMemberOrgSummaries(platform.env.DB, memberId);

    return {
      user: {
        id: member.id,
        email: member.email_id,
        name: member.name,
        roles: member.roles,
        voices: member.voices,
        sections: member.sections,
      },
      locale,
      org,
      memberOrgs,
    };
  } catch {
    return { user: null, locale: "system", org, memberOrgs: [] };
  }
};
