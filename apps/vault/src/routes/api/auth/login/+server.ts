// GET /api/auth/login - Redirect to registry for OAuth
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { REGISTRY_URL, VAULT_ID } from "$lib/config";

export const GET: RequestHandler = async ({ url, cookies }) => {
  // Cookie is already set by /login page (if invite present)
  // Build callback URL - must match registered URL exactly (no query params)
  const callbackUrl = `${url.origin}/api/auth/callback`;

  // Store return_to in a cookie so auth callback can redirect back to intended page
  const returnTo = url.searchParams.get("return_to");
  if (
    returnTo &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/\\")
  ) {
    cookies.set("auth_return_to", returnTo, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 300,
    });
  }

  // Redirect to registry OAuth
  const registryAuthUrl = new URL("/auth", REGISTRY_URL);
  registryAuthUrl.searchParams.set("vault_id", VAULT_ID);
  registryAuthUrl.searchParams.set("callback", callbackUrl);

  return redirect(302, registryAuthUrl.toString());
};
