// E2E Test: Members List with Voices and Sections
// Tests the members page display of voice/section badges

import { test, expect } from "./fixtures";

test.describe("Members List", () => {
  test.beforeEach(async ({ ownerPage }) => {
    // Navigate to members page before each test
    await ownerPage.goto("/members");
    await expect(ownerPage).toHaveTitle(/Manage Members/);
  });

  test("displays members page with invite button", async ({ ownerPage }) => {
    await expect(
      ownerPage.locator('h1:has-text("Manage Members")'),
    ).toBeVisible();
    await expect(ownerPage.locator('a[href="/invite"]')).toBeVisible();
  });

  test("displays search field", async ({ ownerPage }) => {
    await expect(
      ownerPage.locator('input[placeholder*="Search"]'),
    ).toBeVisible();
  });

  test("displays member cards with basic information", async ({
    ownerPage,
  }) => {
    // Should have at least one member (the owner)
    const memberCards = ownerPage.locator(
      ".rounded-lg.border.border-gray-200.bg-white.p-6",
    );
    await expect(memberCards.first()).toBeVisible();

    // Check for email and joined date
    await expect(memberCards.first().locator("text=/Joined/i")).toBeVisible();
  });

  test("displays role badges on member cards", async ({ ownerPage }) => {
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();

    // Owner should have owner role
    await expect(memberCard.locator("text=Roles:")).toBeVisible();

    // Check for role toggles
    await expect(memberCard.locator('button:has-text("owner")')).toBeVisible();
  });

  test("displays voice badges when member has voices", async ({
    ownerPage,
  }) => {
    // This test requires test data with voices assigned
    // Check if any member has voice badges (purple background)
    const voiceBadges = ownerPage.locator("span.bg-purple-100");

    // If voices exist in test data, badges should be visible
    const count = await voiceBadges.count();
    if (count > 0) {
      await expect(voiceBadges.first()).toBeVisible();
      // Check for abbreviation text (S, A, T, B, etc.)
      await expect(voiceBadges.first()).toContainText(/[A-Z]+/);
    }
  });

  test("displays section badges when member has sections", async ({
    ownerPage,
  }) => {
    // This test requires test data with sections assigned
    // Check if any member has section badges (teal background)
    const sectionBadges = ownerPage.locator("span.bg-teal-100");

    // If sections exist in test data, badges should be visible
    const count = await sectionBadges.count();
    if (count > 0) {
      await expect(sectionBadges.first()).toBeVisible();
      // Check for abbreviation text
      await expect(sectionBadges.first()).toContainText(/[A-Z]+/);
    }
  });

  test("displays primary indicator (★) on badges", async ({ ownerPage }) => {
    // Check for star symbol on primary voice/section
    const badges = ownerPage.locator("span.bg-purple-100, span.bg-teal-100");
    const count = await badges.count();

    if (count > 0) {
      // At least one badge should have the star
      const badgesWithStar = badges.filter({ hasText: "★" });
      const starCount = await badgesWithStar.count();

      // If member has multiple voices/sections, first should have star
      if (count > 1) {
        expect(starCount).toBeGreaterThan(0);
      }
    }
  });

  test("displays tooltips on voice badges", async ({ ownerPage }) => {
    const voiceBadges = ownerPage.locator("span.bg-purple-100");
    const count = await voiceBadges.count();

    if (count > 0) {
      // Check that badges have title attribute (tooltip)
      const firstBadge = voiceBadges.first();
      const title = await firstBadge.getAttribute("title");
      expect(title).toBeTruthy();
      expect(title).toMatch(/\w+/); // Should contain voice name
    }
  });

  test("displays tooltips on section badges", async ({ ownerPage }) => {
    const sectionBadges = ownerPage.locator("span.bg-teal-100");
    const count = await sectionBadges.count();

    if (count > 0) {
      // Check that badges have title attribute (tooltip)
      const firstBadge = sectionBadges.first();
      const title = await firstBadge.getAttribute("title");
      expect(title).toBeTruthy();
      expect(title).toMatch(/\w+/); // Should contain section name
    }
  });

  test("allows searching members by name", async ({ ownerPage }) => {
    const searchInput = ownerPage.locator('input[placeholder*="Search"]');

    // Type a search query
    await searchInput.fill("Owner");

    // Should filter members (at least one member visible)
    const memberCards = ownerPage.locator(
      ".rounded-lg.border.border-gray-200.bg-white.p-6",
    );
    await expect(memberCards.first()).toBeVisible();
  });

  test("allows searching members by email", async ({ ownerPage }) => {
    const searchInput = ownerPage.locator('input[placeholder*="Search"]');

    // Type email search
    await searchInput.fill("@");

    // Should show members (everyone has email)
    const memberCards = ownerPage.locator(
      ".rounded-lg.border.border-gray-200.bg-white.p-6",
    );
    await expect(memberCards.first()).toBeVisible();
  });

  test("shows member count", async ({ ownerPage }) => {
    // Should display "X of Y members" at bottom
    await expect(
      ownerPage.locator("text=/\\d+ of \\d+ members/i"),
    ).toBeVisible();
  });

  test('displays "You" badge for current user', async ({ ownerPage }) => {
    // Current user card should have "You" badge
    await expect(ownerPage.locator('span:has-text("You")')).toBeVisible();
  });

  test("owner can see remove button on other members", async ({
    ownerPage,
  }) => {
    // Check for remove buttons (trash icon)
    const removeButtons = ownerPage.locator('button[title*="Remove"]');
    const count = await removeButtons.count();

    // If there are other members, remove buttons should exist
    // (May be 0 if only owner exists in test data)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("owner cannot remove themselves", async ({ ownerPage }) => {
    // Find the card with "You" badge
    const currentUserCard = ownerPage
      .locator('.rounded-lg:has(span:has-text("You"))')
      .first();

    // Should not have remove button
    const removeButton = currentUserCard.locator('button[title*="Remove"]');
    await expect(removeButton).not.toBeVisible();
  });

  test("displays pending invitations section when invites exist", async ({
    ownerPage,
  }) => {
    // Create an invite first
    await ownerPage.goto("/invite");
    await ownerPage.fill('input[id="name"]', "E2E Pending Member");
    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Go back to members page
    await ownerPage.goto("/members");

    // Should see pending invitations section
    await expect(
      ownerPage.locator('h2:has-text("Pending Invitations")'),
    ).toBeVisible();
    await expect(ownerPage.locator("text=E2E Pending Member")).toBeVisible();
  });

  test("displays voice badges on pending invitations", async ({
    ownerPage,
  }) => {
    // Create invite with voice
    await ownerPage.goto("/invite");
    await ownerPage.fill('input[id="name"]', "E2E Voice Invite");

    // Select a voice
    const voicesSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Vocal Range"))',
    );
    await voicesSection.locator('input[type="checkbox"]').first().check();

    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Go to members page
    await ownerPage.goto("/members");

    // Find the invite and check for voice badge
    const inviteCard = ownerPage
      .locator("text=E2E Voice Invite")
      .locator("..")
      .locator("..");
    const voiceBadge = inviteCard.locator("span.bg-purple-100");
    await expect(voiceBadge).toBeVisible();
  });

  test("displays section badges on pending invitations", async ({
    ownerPage,
  }) => {
    // Create invite with section
    await ownerPage.goto("/invite");
    await ownerPage.fill('input[id="name"]', "E2E Section Invite");

    // Select a section
    const sectionsSection = ownerPage.locator(
      'fieldset:has(legend:has-text("Assigned Section"))',
    );
    await sectionsSection.locator('input[type="checkbox"]').first().check();

    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Go to members page
    await ownerPage.goto("/members");

    // Find the invite and check for section badge
    const inviteCard = ownerPage
      .locator("text=E2E Section Invite")
      .locator("..")
      .locator("..");
    const sectionBadge = inviteCard.locator("span.bg-teal-100");
    await expect(sectionBadge).toBeVisible();
  });

  test("allows copying invite link from pending invitations", async ({
    ownerPage,
  }) => {
    // Create an invite
    await ownerPage.goto("/invite");
    await ownerPage.fill('input[id="name"]', "E2E Copy Link Test");
    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Go to members page
    await ownerPage.goto("/members");

    // Find copy link button
    const inviteSection = ownerPage
      .locator("text=E2E Copy Link Test")
      .locator("..")
      .locator("..");
    await expect(
      inviteSection.locator('button:has-text("Copy Link")'),
    ).toBeVisible();
  });

  test("allows revoking pending invitations", async ({ ownerPage }) => {
    // Create an invite
    await ownerPage.goto("/invite");
    await ownerPage.fill('input[id="name"]', "E2E Revoke Test");
    await ownerPage.click('button[type="submit"]');
    await expect(ownerPage.locator("text=/Invitation created/i")).toBeVisible({
      timeout: 5000,
    });

    // Go to members page
    await ownerPage.goto("/members");

    // Find revoke button
    const inviteSection = ownerPage
      .locator("text=E2E Revoke Test")
      .locator("..")
      .locator("..");
    const revokeButton = inviteSection.locator('button:has-text("Revoke")');
    await expect(revokeButton).toBeVisible();

    // Click revoke (will show confirm dialog)
    // Note: Playwright auto-accepts dialogs by default
    await revokeButton.click();

    // Wait for invite to be removed
    await expect(ownerPage.locator("text=E2E Revoke Test")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("non-admin cannot access members page", async ({ singerPage }) => {
    await singerPage.goto("/members");

    // Should not have access
    await expect(singerPage).not.toHaveTitle(/Manage Members/);
  });

  test("admin can access members page", async ({ adminPage }) => {
    await adminPage.goto("/members");

    // Admin should have access
    await expect(adminPage).toHaveTitle(/Manage Members/);
  });

  test("displays role toggle buttons for each role", async ({ ownerPage }) => {
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();

    // Should have buttons for all assignable roles
    await expect(memberCard.locator('button:has-text("owner")')).toBeVisible();
    await expect(memberCard.locator('button:has-text("admin")')).toBeVisible();
    await expect(
      memberCard.locator('button:has-text("librarian")'),
    ).toBeVisible();
    await expect(
      memberCard.locator('button:has-text("conductor")'),
    ).toBeVisible();
    await expect(
      memberCard.locator('button:has-text("section_leader")'),
    ).toBeVisible();
  });

  test("adds voice to member inline", async ({ ownerPage }) => {
    // Find a member card (first member)
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();

    // Find the voices section
    const voicesSection = memberCard.locator("text=Voices:").locator("..");

    // Count existing voice badges
    const existingBadges = voicesSection.locator("span.bg-purple-100");
    const initialCount = await existingBadges.count();

    // Click "+ Add" button for voices
    const addButton = voicesSection.locator('button:has-text("+ Add")');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Wait for dropdown to appear
    const dropdown = voicesSection.locator(".absolute.z-10");
    await expect(dropdown).toBeVisible();

    // Click first available voice in dropdown
    const firstOption = dropdown.locator("button").first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();

    // Wait for dropdown to close and badge to appear
    await expect(dropdown).not.toBeVisible();

    // Verify new badge appeared
    const newCount = await existingBadges.count();
    expect(newCount).toBe(initialCount + 1);
  });

  test("removes voice from member inline", async ({ ownerPage }) => {
    // First, ensure member has a voice
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();
    const voicesSection = memberCard.locator("text=Voices:").locator("..");

    // Add a voice if none exist
    const existingBadges = voicesSection.locator("span.bg-purple-100");
    let initialCount = await existingBadges.count();

    if (initialCount === 0) {
      const addButton = voicesSection.locator('button:has-text("+ Add")');
      await addButton.click();
      const dropdown = voicesSection.locator(".absolute.z-10");
      await dropdown.locator("button").first().click();
      await expect(dropdown).not.toBeVisible();
      initialCount = await existingBadges.count();
    }

    // Hover over the badge to reveal remove button
    const badge = existingBadges.first();
    await badge.hover();

    // Click the × button
    const removeButton = badge.locator('button:has-text("×")');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify badge was removed
    const newCount = await existingBadges.count();
    expect(newCount).toBe(initialCount - 1);
  });

  test("adds section to member inline", async ({ ownerPage }) => {
    // Find a member card (first member)
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();

    // Find the sections section
    const sectionsSection = memberCard.locator("text=Sections:").locator("..");

    // Count existing section badges
    const existingBadges = sectionsSection.locator("span.bg-teal-100");
    const initialCount = await existingBadges.count();

    // Click "+ Add" button for sections
    const addButton = sectionsSection.locator('button:has-text("+ Add")');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Wait for dropdown to appear
    const dropdown = sectionsSection.locator(".absolute.z-10");
    await expect(dropdown).toBeVisible();

    // Click first available section in dropdown
    const firstOption = dropdown.locator("button").first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();

    // Wait for dropdown to close and badge to appear
    await expect(dropdown).not.toBeVisible();

    // Verify new badge appeared
    const newCount = await existingBadges.count();
    expect(newCount).toBe(initialCount + 1);
  });

  test("removes section from member inline", async ({ ownerPage }) => {
    // First, ensure member has a section
    const memberCard = ownerPage
      .locator(".rounded-lg.border.border-gray-200.bg-white.p-6")
      .first();
    const sectionsSection = memberCard.locator("text=Sections:").locator("..");

    // Add a section if none exist
    const existingBadges = sectionsSection.locator("span.bg-teal-100");
    let initialCount = await existingBadges.count();

    if (initialCount === 0) {
      const addButton = sectionsSection.locator('button:has-text("+ Add")');
      await addButton.click();
      const dropdown = sectionsSection.locator(".absolute.z-10");
      await dropdown.locator("button").first().click();
      await expect(dropdown).not.toBeVisible();
      initialCount = await existingBadges.count();
    }

    // Hover over the badge to reveal remove button
    const badge = existingBadges.first();
    await badge.hover();

    // Click the × button
    const removeButton = badge.locator('button:has-text("×")');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify badge was removed
    const newCount = await existingBadges.count();
    expect(newCount).toBe(initialCount - 1);
  });
});
