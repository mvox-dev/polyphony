// E2E Test: Copyright Takedown Form
// Tests the public copyright takedown submission page

import { test, expect } from "@playwright/test";

test.describe("Copyright Takedown Form", () => {
  test("should display takedown form at /copyright", async ({ page }) => {
    await page.goto("/copyright");

    // Should show the takedown form
    await expect(page.locator("h1")).toContainText(/copyright|takedown|dmca/i);
    await expect(page.locator("form")).toBeVisible();
  });

  test("should have required form fields", async ({ page }) => {
    await page.goto("/copyright");

    // Check for essential form fields
    await expect(page.locator('input[name="claimant_email"]')).toBeVisible();
    await expect(page.locator('textarea[name="description"]')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should validate required fields", async ({ page }) => {
    await page.goto("/copyright");

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors or stay on page
    const currentUrl = page.url();
    expect(currentUrl).toContain("/copyright");
  });

  test("should validate email format", async ({ page }) => {
    await page.goto("/copyright");

    // Fill with invalid email
    await page.fill('input[name="claimant_email"]', "invalid-email");
    await page.fill('textarea[name="description"]', "Test description");
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');

    // Should show error or stay on form (HTML5 validation)
    const currentUrl = page.url();
    expect(currentUrl).toContain("/copyright");
  });
});
