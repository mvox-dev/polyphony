// Login page server - handles invite token cookie
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, cookies }) => {
  const inviteToken = url.searchParams.get("invite");

  // Store invite token in cookie if present (callback will read it)
  // This enables both email and Google OAuth to pass the invite through
  if (inviteToken) {
    cookies.set("pending_invite", inviteToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
    });
  }

  return {
    invite: inviteToken,
  };
};
