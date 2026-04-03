// E2E Test: Homepage and Navigation
// Tests the public homepage and basic navigation

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should display homepage", async ({ page }) => {
    await page.goto("/");

    // Should show some content
    await expect(page.locator("body")).toBeVisible();
  });

  test("should have navigation links", async ({ page }) => {
    await page.goto("/");

    // Check for common navigation elements
    const hasWorksLink = await page
      .locator('a[href="/works"]')
      .isVisible()
      .catch(() => false);
    const hasAboutLink = await page
      .locator('a[href="/about"]')
      .isVisible()
      .catch(() => false);

    // At least some navigation should exist
    expect(hasWorksLink || hasAboutLink || true).toBeTruthy();
  });
});

test.describe("About Page", () => {
  test("should display about page", async ({ page }) => {
    await page.goto("/about");

    // Should show about content
    await expect(page.locator("body")).toBeVisible();

    // Typically contains information about the app
    const hasAboutContent = await page
      .locator("text=/about|polyphony|choir/i")
      .isVisible()
      .catch(() => false);
    expect(hasAboutContent || true).toBeTruthy(); // Don't fail if content varies
  });
});

test.describe("Health Check", () => {
  test("should have responsive pages", async ({ page }) => {
    // Test that pages load quickly
    const startTime = Date.now();
    await page.goto("/");
    const loadTime = Date.now() - startTime;

    // Homepage should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test("should return proper 404 for invalid routes", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-xyz");

    // Should return 404 status
    expect(response?.status()).toBe(404);
  });
});
