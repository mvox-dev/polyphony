// GET /api/auth/logout - Clear session cookies and redirect to Registry logout
// #301: Must clear sso_attempted and redirect through Registry to clear SSO cookie
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { REGISTRY_URL } from "$lib/config";

export const GET: RequestHandler = async ({ url, cookies }) => {
  cookies.delete("member_id", { path: "/" });
  cookies.delete("sso_attempted", { path: "/" });

  const callback = encodeURIComponent(url.origin);
  return redirect(302, `${REGISTRY_URL}/auth/logout?callback=${callback}`);
};
