// Tests for GET /api/auth/login — return_to open-redirect guard (#287)
// The guard: returnTo must start with '/' and must NOT start with '//'
// Valid: sets auth_return_to cookie; invalid: no cookie set (safe default)
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sveltejs/kit BEFORE importing handler
vi.mock("@sveltejs/kit", () => ({
  redirect: (status: number, location: string) => {
    const err = new Error(`Redirect to ${location}`);
    (err as any).status = status;
    (err as any).location = location;
    throw err;
  },
}));

// Config exports static constants — mock them for test isolation
vi.mock("$lib/config", () => ({
  REGISTRY_URL: "https://registry.example.com",
  VAULT_ID: "test-vault-id",
}));

import { GET } from "../../../../routes/api/auth/login/+server";

function createMockEvent(returnTo?: string) {
  const url = new URL("https://crede.example.com/api/auth/login");
  if (returnTo !== undefined) {
    url.searchParams.set("return_to", returnTo);
  }

  const cookieStore = new Map<string, string>();
  const cookies = {
    get: vi.fn((name: string) => cookieStore.get(name) ?? null),
    set: vi.fn((name: string, value: string) => {
      cookieStore.set(name, value);
    }),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
    serialize: vi.fn(),
  };

  return { url, cookies };
}

describe("GET /api/auth/login — return_to open-redirect guard", () => {
  describe("valid return_to values — cookie IS set", () => {
    it("sets auth_return_to cookie for a simple relative path", async () => {
      const event = createMockEvent("/dashboard");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).toHaveBeenCalledWith(
        "auth_return_to",
        "/dashboard",
        expect.objectContaining({ httpOnly: true, path: "/" }),
      );
    });

    it("sets auth_return_to cookie for a nested path", async () => {
      const event = createMockEvent("/members/invite");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).toHaveBeenCalledWith(
        "auth_return_to",
        "/members/invite",
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("sets auth_return_to cookie for root path /", async () => {
      const event = createMockEvent("/");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).toHaveBeenCalledWith(
        "auth_return_to",
        "/",
        expect.any(Object),
      );
    });

    it("sets auth_return_to cookie for path with query string", async () => {
      const event = createMockEvent("/events?date=2026-03-19");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).toHaveBeenCalledWith(
        "auth_return_to",
        "/events?date=2026-03-19",
        expect.any(Object),
      );
    });
  });

  describe("invalid return_to values — cookie NOT set (open-redirect guard)", () => {
    it("does NOT set cookie for absolute HTTPS URL", async () => {
      const event = createMockEvent("https://evil.com/steal");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });

    it("does NOT set cookie for absolute HTTP URL", async () => {
      const event = createMockEvent("http://evil.com");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });

    it("does NOT set cookie for protocol-relative URL (//evil.com)", async () => {
      const event = createMockEvent("//evil.com/steal");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });

    // RED (#296): guard does not yet reject /\ prefix — convert to it() when fixed
    it.fails(
      "does NOT set cookie for backslash bypass (/\\evil.com)",
      async () => {
        // /\evil.com passes startsWith("/") && !startsWith("//") but Chromium
        // normalises \ → / in Location headers, turning it into //evil.com
        const event = createMockEvent("/\\evil.com");

        await expect(GET(event as any)).rejects.toThrow("Redirect to");

        expect(event.cookies.set).not.toHaveBeenCalledWith(
          "auth_return_to",
          expect.anything(),
          expect.anything(),
        );
      },
    );

    // RED (#296): convert to it() when fixed
    it.fails(
      "does NOT set cookie for double-backslash variant (/\\\\/evil.com)",
      async () => {
        const event = createMockEvent("/\\\\/evil.com");

        await expect(GET(event as any)).rejects.toThrow("Redirect to");

        expect(event.cookies.set).not.toHaveBeenCalledWith(
          "auth_return_to",
          expect.anything(),
          expect.anything(),
        );
      },
    );

    it("does NOT set cookie for mixed slash-backslash (//\\evil.com)", async () => {
      const event = createMockEvent("//\\evil.com");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });

    it("does NOT set cookie for empty string", async () => {
      const event = createMockEvent("");

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("missing return_to — safe default (no cookie)", () => {
    it("does NOT set auth_return_to cookie when return_to is absent", async () => {
      const event = createMockEvent(); // No return_to param

      await expect(GET(event as any)).rejects.toThrow("Redirect to");

      expect(event.cookies.set).not.toHaveBeenCalledWith(
        "auth_return_to",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("redirect target is always registry OAuth", () => {
    it("always redirects (302) to registry regardless of return_to validity", async () => {
      const event = createMockEvent("https://evil.com");

      const err: any = await Promise.resolve(GET(event as any)).catch(
        (e: any) => e,
      );

      expect(err.status).toBe(302);
      expect(err.location).toContain("registry.example.com");
    });

    it("redirect URL includes vault_id and callback params", async () => {
      const event = createMockEvent("/dashboard");

      const err: any = await Promise.resolve(GET(event as any)).catch(
        (e: any) => e,
      );

      expect(err.location).toContain("vault_id=test-vault-id");
      expect(err.location).toContain("callback=");
    });
  });
});
