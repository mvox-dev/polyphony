import type { PageServerLoad } from "./$types";
import { getGuidesForRoles } from "$lib/content/guides";

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();
  const roles = user?.roles;

  const guides = getGuidesForRoles(roles);

  return {
    guides,
    userRoles: roles ?? [],
  };
};
