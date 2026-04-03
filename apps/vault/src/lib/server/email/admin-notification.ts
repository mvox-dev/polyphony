// Admin notification via Registry API
// Issue #202 - Calls Registry endpoint instead of Resend directly
// This centralizes email sending in Registry (which already has Resend configured)

export interface RegistrationNotificationData {
  orgName: string;
  subdomain: string;
  contactEmail: string;
  memberName: string;
  memberEmail: string;
  orgId: string;
}

export interface NotifyConfig {
  registryUrl: string;
  notifyApiKey: string;
}

export interface SendResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

const fail = (error: string, log: "warn" | "error" = "error"): SendResult => {
  console[log](`[Admin Notification] ${error}`);
  return { success: false, error };
};

/**
 * Send admin notification for new registration via Registry API
 * Registry handles the actual email sending via Resend
 * Gracefully handles failures - logs error but doesn't throw
 */
export async function sendAdminNotification(
  data: RegistrationNotificationData,
  config: NotifyConfig,
): Promise<SendResult> {
  if (!config.registryUrl || !config.notifyApiKey) {
    return fail(
      "Notification service not configured (missing Registry URL or API key)",
      "warn",
    );
  }

  try {
    const response = await fetch(
      `${config.registryUrl}/api/notify/registration`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: config.notifyApiKey, ...data }),
      },
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return fail(
        `Registry API error: ${response.status} - ${errorData.error || "Unknown error"}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      emailId?: string;
    };
    if (!result.success) return fail("Registry returned failure");

    console.log(
      `[Admin Notification] Email sent via Registry: ${result.emailId}`,
    );
    return { success: true, emailId: result.emailId };
  } catch (err) {
    return fail(
      `Failed to call Registry: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}
