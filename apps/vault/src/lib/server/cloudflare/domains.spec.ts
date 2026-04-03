// Tests for Cloudflare Pages domain registration
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSubdomain } from "./domains";

describe("registerSubdomain", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const validEnv = {
    CF_ACCOUNT_ID: "test-account-id",
    CF_API_TOKEN: "test-api-token",
    CF_PAGES_PROJECT: "test-project",
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  it("should return error when CF_ACCOUNT_ID is missing", async () => {
    const result = await registerSubdomain("testorg", {
      CF_API_TOKEN: "token",
      CF_PAGES_PROJECT: "project",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return error when CF_API_TOKEN is missing", async () => {
    const result = await registerSubdomain("testorg", {
      CF_ACCOUNT_ID: "account",
      CF_PAGES_PROJECT: "project",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("should return error when CF_PAGES_PROJECT is missing", async () => {
    const result = await registerSubdomain("testorg", {
      CF_ACCOUNT_ID: "account",
      CF_API_TOKEN: "token",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("should call Cloudflare API with correct URL and body", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        result: { name: "testorg.polyphony.uk", status: "initializing" },
      }),
    });

    await registerSubdomain("testorg", validEnv);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account-id/pages/projects/test-project/domains",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "testorg.polyphony.uk" }),
      }),
    );
  });

  it("should return success with domain and status on successful registration", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        result: { name: "newchoir.polyphony.uk", status: "initializing" },
      }),
    });

    const result = await registerSubdomain("newchoir", validEnv);

    expect(result.success).toBe(true);
    expect(result.domain).toBe("newchoir.polyphony.uk");
    expect(result.status).toBe("initializing");
  });

  it("should handle already-existing domain gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: false,
        errors: [{ code: 8000040, message: "Domain already exists" }],
      }),
    });

    const result = await registerSubdomain("existing", validEnv);

    expect(result.success).toBe(true);
    expect(result.status).toBe("already_active");
  });

  it("should return error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        success: false,
        errors: [{ code: 1000, message: "Authentication error" }],
      }),
    });

    const result = await registerSubdomain("badrequest", validEnv);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication error");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await registerSubdomain("testorg", validEnv);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });
});
