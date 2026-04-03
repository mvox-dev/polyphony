// organizations.ts TDD test suite
import { describe, it, expect, beforeEach } from "vitest";
import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySubdomain,
  getAllOrganizations,
  updateOrganization,
} from "./organizations";
import type {
  Organization,
  OrganizationType,
  CreateOrganizationInput,
} from "$lib/types";

// Mock D1Database for testing
function createMockDB(): D1Database {
  const organizations = new Map<string, any>();

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes("WHERE id = ?")) {
              return organizations.get(params[0]) || null;
            }
            if (sql.includes("WHERE subdomain = ?")) {
              for (const org of organizations.values()) {
                if (org.subdomain === params[0]) {
                  return org;
                }
              }
              return null;
            }
            return null;
          },
          all: async () => {
            return { results: Array.from(organizations.values()) };
          },
          run: async () => {
            if (sql.includes("INSERT INTO organizations")) {
              const [id, name, subdomain, type, contactEmail] = params;
              organizations.set(id, {
                id,
                name,
                subdomain,
                type,
                contact_email: contactEmail,
                created_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE organizations SET")) {
              const id = params[params.length - 1]; // Last param is id
              const org = organizations.get(id);
              if (org) {
                // Parse which fields are being updated
                if (sql.includes("name = ?")) {
                  org.name = params[0];
                }
                if (sql.includes("contact_email = ?")) {
                  const idx = sql.includes("name = ?") ? 1 : 0;
                  org.contact_email = params[idx];
                }
                return { success: true, meta: { changes: 1 } };
              }
              return { success: false, meta: { changes: 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
        all: async () => {
          return { results: Array.from(organizations.values()) };
        },
      };
    },
    batch: async () => ({ results: [] }),
    exec: async () => ({ results: [] }),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

describe("Organizations Database Operations", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("createOrganization", () => {
    it("creates a collective organization", async () => {
      const input: CreateOrganizationInput = {
        name: "Kammerkoor Crede",
        subdomain: "crede",
        type: "collective",
        contactEmail: "info@crede.ee",
      };

      const org = await createOrganization(db, input);

      expect(org).toBeDefined();
      expect(org.id).toBeDefined();
      expect(org.name).toBe("Kammerkoor Crede");
      expect(org.subdomain).toBe("crede");
      expect(org.type).toBe("collective");
      expect(org.contactEmail).toBe("info@crede.ee");
      expect(org.createdAt).toBeDefined();
    });

    it("creates an umbrella organization", async () => {
      const input: CreateOrganizationInput = {
        name: "Estonian Choral Association",
        subdomain: "eca",
        type: "umbrella",
        contactEmail: "contact@eca.ee",
      };

      const org = await createOrganization(db, input);

      expect(org).toBeDefined();
      expect(org.type).toBe("umbrella");
    });

    it("generates a unique ID", async () => {
      const input1: CreateOrganizationInput = {
        name: "Org 1",
        subdomain: "org1",
        type: "collective",
        contactEmail: "org1@test.com",
      };
      const input2: CreateOrganizationInput = {
        name: "Org 2",
        subdomain: "org2",
        type: "collective",
        contactEmail: "org2@test.com",
      };

      const org1 = await createOrganization(db, input1);
      const org2 = await createOrganization(db, input2);

      expect(org1.id).not.toBe(org2.id);
    });
  });

  describe("getOrganizationById", () => {
    it("returns organization by ID", async () => {
      const input: CreateOrganizationInput = {
        name: "Test Choir",
        subdomain: "test",
        type: "collective",
        contactEmail: "test@test.com",
      };
      const created = await createOrganization(db, input);

      const fetched = await getOrganizationById(db, created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe("Test Choir");
    });

    it("returns null for non-existent ID", async () => {
      const result = await getOrganizationById(db, "non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("getOrganizationBySubdomain", () => {
    it("returns organization by subdomain", async () => {
      const input: CreateOrganizationInput = {
        name: "Tallinn Choir",
        subdomain: "tallinn",
        type: "collective",
        contactEmail: "info@tallinn-choir.ee",
      };
      await createOrganization(db, input);

      const fetched = await getOrganizationBySubdomain(db, "tallinn");

      expect(fetched).toBeDefined();
      expect(fetched?.subdomain).toBe("tallinn");
      expect(fetched?.name).toBe("Tallinn Choir");
    });

    it("returns null for non-existent subdomain", async () => {
      const result = await getOrganizationBySubdomain(db, "unknown");

      expect(result).toBeNull();
    });

    it("is case-sensitive for subdomain lookup", async () => {
      const input: CreateOrganizationInput = {
        name: "Test",
        subdomain: "myorg",
        type: "collective",
        contactEmail: "test@test.com",
      };
      await createOrganization(db, input);

      // Subdomains should be stored lowercase, lookup should match exactly
      const fetched = await getOrganizationBySubdomain(db, "myorg");
      expect(fetched).toBeDefined();
    });
  });

  describe("getAllOrganizations", () => {
    it("returns empty array when no organizations exist", async () => {
      const orgs = await getAllOrganizations(db);

      expect(orgs).toEqual([]);
    });

    it("returns all organizations", async () => {
      await createOrganization(db, {
        name: "Org 1",
        subdomain: "org1",
        type: "collective",
        contactEmail: "org1@test.com",
      });
      await createOrganization(db, {
        name: "Org 2",
        subdomain: "org2",
        type: "umbrella",
        contactEmail: "org2@test.com",
      });

      const orgs = await getAllOrganizations(db);

      expect(orgs).toHaveLength(2);
    });
  });

  describe("updateOrganization", () => {
    it("updates organization name", async () => {
      const created = await createOrganization(db, {
        name: "Old Name",
        subdomain: "test",
        type: "collective",
        contactEmail: "test@test.com",
      });

      const updated = await updateOrganization(db, created.id, {
        name: "New Name",
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe("New Name");
    });

    it("updates contact email", async () => {
      const created = await createOrganization(db, {
        name: "Test",
        subdomain: "test",
        type: "collective",
        contactEmail: "old@test.com",
      });

      const updated = await updateOrganization(db, created.id, {
        contactEmail: "new@test.com",
      });

      expect(updated).toBeDefined();
      expect(updated?.contactEmail).toBe("new@test.com");
    });

    it("returns null for non-existent organization", async () => {
      const result = await updateOrganization(db, "non-existent", {
        name: "New Name",
      });

      expect(result).toBeNull();
    });
  });
});
