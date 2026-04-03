// E2E Test Fixtures for Polyphony Vault
// Provides authenticated contexts and test helpers for different user roles

import { test as base, type Page, type BrowserContext } from "@playwright/test";

// Test member types
export interface TestMember {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "librarian" | "singer";
}

// Test fixtures type
interface VaultFixtures {
  ownerPage: Page;
  adminPage: Page;
  librarianPage: Page;
  singerPage: Page;
  unauthenticatedPage: Page;
}

// Create a page with a specific member authenticated
async function createAuthenticatedPage(
  context: BrowserContext,
  baseURL: string,
  member: TestMember,
): Promise<Page> {
  const page = await context.newPage();

  // Set the member_id cookie directly (simulating authenticated session)
  await context.addCookies([
    {
      name: "member_id",
      value: member.id,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);

  return page;
}

// Test member fixtures for different roles
export const testMembers = {
  owner: {
    id: "e2e-owner-001",
    email: "owner@e2e-test.scoreinstitute.eu",
    name: "E2E Owner",
    role: "owner" as const,
  },
  admin: {
    id: "e2e-admin-001",
    email: "admin@e2e-test.scoreinstitute.eu",
    name: "E2E Admin",
    role: "admin" as const,
  },
  librarian: {
    id: "e2e-librarian-001",
    email: "librarian@e2e-test.scoreinstitute.eu",
    name: "E2E Librarian",
    role: "librarian" as const,
  },
  singer: {
    id: "e2e-singer-001",
    email: "singer@e2e-test.scoreinstitute.eu",
    name: "E2E Singer",
    role: "singer" as const,
  },
};

// Extended test with fixtures
export const test = base.extend<VaultFixtures>({
  ownerPage: async ({ context, baseURL }, use) => {
    const page = await createAuthenticatedPage(
      context,
      baseURL!,
      testMembers.owner,
    );
    await use(page);
  },
  adminPage: async ({ context, baseURL }, use) => {
    const page = await createAuthenticatedPage(
      context,
      baseURL!,
      testMembers.admin,
    );
    await use(page);
  },
  librarianPage: async ({ context, baseURL }, use) => {
    const page = await createAuthenticatedPage(
      context,
      baseURL!,
      testMembers.librarian,
    );
    await use(page);
  },
  singerPage: async ({ context, baseURL }, use) => {
    const page = await createAuthenticatedPage(
      context,
      baseURL!,
      testMembers.singer,
    );
    await use(page);
  },
  unauthenticatedPage: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from "@playwright/test";
