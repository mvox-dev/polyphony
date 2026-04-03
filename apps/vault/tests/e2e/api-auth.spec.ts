// E2E Test: API Authentication
// Tests that API endpoints properly require authentication

import { test, expect } from "./fixtures";

test.describe("API Authentication", () => {
  // Test /api/scores endpoints
  test.describe("Score API", () => {
    test("GET /api/scores requires authentication", async ({ request }) => {
      const response = await request.get("/api/scores");
      expect(response.status()).toBe(401);
    });

    test("POST /api/scores requires authentication", async ({ request }) => {
      const response = await request.post("/api/scores", {
        data: { title: "Test Score", composer: "Test" },
      });
      expect(response.status()).toBe(401);
    });
  });

  // Test /api/takedowns endpoints (admin only)
  test.describe("Takedown API", () => {
    test("GET /api/takedowns requires authentication", async ({ request }) => {
      const response = await request.get("/api/takedowns");
      expect(response.status()).toBe(401);
    });

    test("POST /api/takedowns/[id]/process requires authentication", async ({
      request,
    }) => {
      const response = await request.post("/api/takedowns/fake-id/process", {
        data: { action: "approve" },
      });
      expect(response.status()).toBe(401);
    });
  });

  // Test /api/members/invite endpoint
  test.describe("Invite API", () => {
    test("POST /api/members/invite requires authentication", async ({
      request,
    }) => {
      const response = await request.post("/api/members/invite", {
        data: { email: "test@example.com", role: "singer" },
      });
      expect(response.status()).toBe(401);
    });
  });
});
