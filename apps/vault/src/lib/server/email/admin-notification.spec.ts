// Tests for admin notification via Registry API
// Issue #202 - Refactored to call Registry instead of Resend directly

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendAdminNotification,
  type RegistrationNotificationData,
  type NotifyConfig,
} from "./admin-notification";

// Mock fetch for Registry API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Admin Notification via Registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testData: RegistrationNotificationData = {
    orgName: "City Chamber Choir",
    subdomain: "citychamber",
    contactEmail: "admin@citychoir.org",
    memberName: "John Director",
    memberEmail: "john@example.com",
    orgId: "org_abc123",
  };

  const validConfig: NotifyConfig = {
    registryUrl: "https://polyphony.uk",
    notifyApiKey: "test-notify-key",
  };

  describe("sendAdminNotification", () => {
    it("sends notification via Registry API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, emailId: "email_123" }),
      });

      const result = await sendAdminNotification(testData, validConfig);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe("email_123");

      // Verify API call to Registry
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://polyphony.uk/api/notify/registration");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.apiKey).toBe("test-notify-key");
      expect(body.orgName).toBe("City Chamber Choir");
      expect(body.subdomain).toBe("citychamber");
      expect(body.contactEmail).toBe("admin@citychoir.org");
      expect(body.memberName).toBe("John Director");
      expect(body.memberEmail).toBe("john@example.com");
      expect(body.orgId).toBe("org_abc123");
    });

    it("handles Registry API error gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: "Email service error" }),
      });

      const result = await sendAdminNotification(testData, validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("handles network error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await sendAdminNotification(testData, validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("does nothing when Registry URL is missing", async () => {
      const result = await sendAdminNotification(testData, {
        registryUrl: "",
        notifyApiKey: "test-key",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does nothing when notify API key is missing", async () => {
      const result = await sendAdminNotification(testData, {
        registryUrl: "https://polyphony.uk",
        notifyApiKey: "",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("logs but does not throw on failure", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error("API down"));

      // Should not throw
      const result = await sendAdminNotification(testData, validConfig);

      expect(result.success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles auth error (401) from Registry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: "Invalid API key" }),
      });

      const result = await sendAdminNotification(testData, validConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });
  });
});
