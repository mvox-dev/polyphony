// E2E Test: Invite Form with Voices and Sections
// Tests the invite form UI with multi-select for voices/sections

import { test, expect } from "./fixtures";

test.describe("Invite Form", () => {
  test.beforeEach(async ({ ownerPage }) => {
    // Navigate to invite page before each test
    await ownerPage.goto("/invite");
    await expect(ownerPage).toHaveTitle(/Invite Member/);
  });

  test("displays invite form with all fields", async ({ ownerPage }) => {
    // Check form elements
    await expect(ownerPage.locator('input[id="name"]')).toBeVisible();
    await expect(ownerPage.locator("text=Roles (optional)")).toBeVisible();
    await expect(
      ownerPage.locator("text=Vocal Range (optional)"),
    ).toBeVisible();
    await expect(
      ownerPage.locator("text=Assigned Section (optional)"),
    ).toBeVisible();
    await expect(ownerPage.locator('button[type="submit"]')).toBeVisible();
  });

  test("submits invite with name only (no roles, voices, or sections)", async ({
    ownerPage,
  }) => {
    // Fill in name
    await ownerPage.fill('input[id="name"]', "Test Member");

    // Submit form
    await ownerPage.click('button[type="submit"]');

    // Wait for success message
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Check that invite link is displayed
    await expect(
      ownerPage.locator('input[readonly][value*="invite/accept"]'),
    ).toBeVisible();
  });

  test("submits invite with roles selected", async ({ ownerPage }) => {
    await ownerPage.fill('input[id="name"]', "Test Admin");

    // Select admin role
    await ownerPage.check('input[type="checkbox"]:near(:text("admin"))');

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("submits invite with single voice selected", async ({ ownerPage }) => {
    await ownerPage.fill('input[id="name"]', "Test Soprano");

    // Find and check first voice checkbox (should be Soprano based on display_order)
    const firstVoice = ownerPage.locator('input[type="checkbox"]').first();
    await firstVoice.check();

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("submits invite with multiple voices selected", async ({
    ownerPage,
  }) => {
    await ownerPage.fill('input[id="name"]', "Test Multi-Voice");

    // Get voice checkboxes (located after "Vocal Range" legend)
    const voicesSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Vocal Range"))',
    );
    const voiceCheckboxes = voicesSection.locator('input[type="checkbox"]');

    // Select first two voices
    await voiceCheckboxes.nth(0).check();
    await voiceCheckboxes.nth(1).check();

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("submits invite with single section selected", async ({ ownerPage }) => {
    await ownerPage.fill('input[id="name"]', "Test Section Member");

    // Get section checkboxes (located after "Assigned Section" legend)
    const sectionsArea = ownerPage.locator(
      'fieldset:has(legend:has-text("Assigned Section"))',
    );
    const firstSection = sectionsArea.locator('input[type="checkbox"]').first();
    await firstSection.check();

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("submits invite with multiple sections selected", async ({
    ownerPage,
  }) => {
    await ownerPage.fill('input[id="name"]', "Test Multi-Section");

    // Get section checkboxes
    const sectionsSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Assigned Section"))',
    );
    const sectionCheckboxes = sectionsSection.locator('input[type="checkbox"]');

    // Select first two sections
    await sectionCheckboxes.nth(0).check();
    await sectionCheckboxes.nth(1).check();

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("submits invite with roles, voices, and sections", async ({
    ownerPage,
  }) => {
    await ownerPage.fill('input[id="name"]', "Test Complete Member");

    // Select role
    await ownerPage.check('input[type="checkbox"]:near(:text("librarian"))');

    // Select voice
    const voicesSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Vocal Range"))',
    );
    await voicesSection.locator('input[type="checkbox"]').first().check();

    // Select section
    const sectionsSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Assigned Section"))',
    );
    await sectionsSection.locator('input[type="checkbox"]').first().check();

    // Submit
    await ownerPage.click('button[type="submit"]');

    // Verify success
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows error when name is empty", async ({ ownerPage }) => {
    // Try to submit without name
    await ownerPage.click('button[type="submit"]');

    // HTML5 validation should prevent submission
    // Check that we're still on the form (no success message)
    await expect(
      ownerPage.locator("text=/Invitation created/i"),
    ).not.toBeVisible();
  });

  test("displays tooltips for voices and sections", async ({ ownerPage }) => {
    // Check for tooltip icons (ⓘ)
    await expect(
      ownerPage.locator("text=Vocal Range (optional)"),
    ).toBeVisible();
    await expect(
      ownerPage.locator("text=Assigned Section (optional)"),
    ).toBeVisible();

    // Check for helper text explaining voices
    await expect(
      ownerPage.locator(
        "text=/Select all ranges this member can comfortably sing/i",
      ),
    ).toBeVisible();

    // Check for helper text explaining sections
    await expect(
      ownerPage.locator(
        "text=/Assign to one or more sections for performances/i",
      ),
    ).toBeVisible();
  });

  test("displays primary indicator information", async ({ ownerPage }) => {
    // Check that the form explains first selection becomes primary
    await expect(
      ownerPage.locator("text=/First selected becomes primary/i"),
    ).toBeVisible();
  });

  test("resets form after successful submission", async ({ ownerPage }) => {
    // Fill and submit
    await ownerPage.fill('input[id="name"]', "Test Reset");
    const voicesSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Vocal Range"))',
    );
    await voicesSection.locator('input[type="checkbox"]').first().check();

    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Check form is reset
    await expect(ownerPage.locator('input[id="name"]')).toHaveValue("");

    // Check voice checkbox is unchecked
    const voiceCheckbox = voicesSection
      .locator('input[type="checkbox"]')
      .first();
    await expect(voiceCheckbox).not.toBeChecked();
  });

  test("allows copying invite link", async ({ ownerPage }) => {
    await ownerPage.fill('input[id="name"]', "Test Copy Link");
    await ownerPage.click('button[type="submit"]');

    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Check copy button is visible
    await expect(ownerPage.locator('button:has-text("Copy")')).toBeVisible();
  });

  test("non-owner cannot access invite page", async ({ singerPage }) => {
    // Regular singer should not have access
    await singerPage.goto("/invite");

    // Should be redirected or see error
    // (Exact behavior depends on your auth implementation)
    await expect(singerPage).not.toHaveTitle(/Invite Member/);
  });

  test("admin can access invite page", async ({ adminPage }) => {
    await adminPage.goto("/invite");

    // Admin should have access
    await expect(adminPage).toHaveTitle(/Invite Member/);
    await expect(adminPage.locator('input[id="name"]')).toBeVisible();
  });
});
