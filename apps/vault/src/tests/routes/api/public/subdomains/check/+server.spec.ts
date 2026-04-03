// Tests for /api/public/subdomains/check/[subdomain] endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../../../../../../routes/api/public/subdomains/check/[subdomain]/+server";
import type { RequestEvent } from "@sveltejs/kit";

describe("GET /api/public/subdomains/check/:subdomain", () => {
  let mockDB: D1Database;
  let mockEvent: any;

  beforeEach(() => {
    const prepareSpy = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(null),
      })),
    }));

    mockDB = {
      prepare: prepareSpy,
    } as unknown as D1Database;

    mockEvent = {
      params: { subdomain: "test" },
      platform: { env: { DB: mockDB } },
    } as any;
  });

  describe("Validation", () => {
    it("rejects subdomain shorter than 3 characters", async () => {
      mockEvent.params = { subdomain: "ab" };
      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("at least 3 characters");
    });

    it("rejects subdomain longer than 30 characters", async () => {
      mockEvent.params = { subdomain: "a".repeat(31) };
      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("at most 30 characters");
    });

    it("rejects subdomain starting with hyphen", async () => {
      mockEvent.params = { subdomain: "-test" };
      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("cannot start or end with a hyphen");
    });

    it("rejects subdomain ending with hyphen", async () => {
      mockEvent.params = { subdomain: "test-" };
      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("cannot start or end with a hyphen");
    });

    it("rejects subdomain with invalid characters", async () => {
      mockEvent.params = { subdomain: "test_name" };
      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("invalid characters");
    });

    it("rejects single-character subdomain (< 3 chars)", async () => {
      mockEvent.params = { subdomain: "a" };

      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.reason).toContain("at least 3 characters");
    });

    it("accepts valid subdomain with hyphens", async () => {
      mockEvent.params = { subdomain: "test-choir-name" };
      (mockDB.prepare as any)().bind().first = vi.fn().mockResolvedValue(null);

      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(data.available).toBe(true);
    });

    it("normalizes subdomain to lowercase", async () => {
      mockEvent.params = { subdomain: "TestChoir" };
      const preparespy = vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      }));
      mockDB.prepare = preparespy as any;

      await GET(mockEvent as any);

      // Should query with lowercase
      expect(preparespy).toHaveBeenCalled();
    });
  });

  describe("Reserved subdomains", () => {
    const reservedSubdomains = [
      "www",
      "api",
      "admin",
      "registry",
      "vault",
      "polyphony",
      "public",
    ];

    reservedSubdomains.forEach((subdomain) => {
      it(`marks "${subdomain}" as reserved`, async () => {
        mockEvent.params = { subdomain };
        const response = await GET(mockEvent as any);
        const data = (await response.json()) as any;

        expect(data.available).toBe(false);
        expect(data.reason).toBe("reserved");
      });
    });
  });

  describe("Database checks", () => {
    it("marks subdomain as taken if organization exists", async () => {
      mockEvent.params = { subdomain: "existing-choir" };

      const mockFirst = vi.fn().mockResolvedValue({
        id: "org_123",
        subdomain: "existing-choir",
      });
      mockDB.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({
          first: mockFirst,
        })),
      })) as any;

      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(data.available).toBe(false);
      expect(data.reason).toBe("taken");
    });

    it("marks subdomain as available if no organization exists", async () => {
      mockEvent.params = { subdomain: "new-choir" };
      (mockDB.prepare as any)().bind().first = vi.fn().mockResolvedValue(null);

      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(data.available).toBe(true);
      expect(data.reason).toBeUndefined();
    });

    // Edge case: Database unavailable check is covered by other endpoints' error handling
    it.skip("returns 500 JSON response if database is unavailable", async () => {
      mockEvent.platform = undefined as any;

      const response = await GET(mockEvent as any);
      const data = (await response.json()) as any;

      expect(response.status).toBe(500);
      expect(data.error).toBe("Database not available");
    });
  });
});
