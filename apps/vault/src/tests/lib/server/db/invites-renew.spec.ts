// TDD: Tests for renewInvite DB function
// These tests validate SQL against the actual schema to catch column mismatches
import { describe, it, expect, vi } from "vitest";
import { renewInvite } from "$lib/server/db/invites";

// Actual invites table columns after all migrations (0001 → 0003 recreate → 0011 → 0029)
const INVITES_COLUMNS = new Set([
  "id",
  "token",
  "name",
  "invited_by",
  "created_at",
  "expires_at",
  "roster_member_id",
  "org_id",
]);

/**
 * Schema-aware mock: throws D1-style error if SQL references non-existent columns.
 * This catches the exact class of bug where code references columns dropped by migrations.
 */
function createSchemaAwareMockDb(inviteData: Record<string, unknown> | null) {
  return {
    prepare: (sql: string) => {
      // Only validate column references for queries against the invites table
      const isInvitesQuery = /\binvites\b/i.test(sql);
      if (isInvitesQuery) {
        const columnPattern =
          /(?:SET|WHERE|AND|OR)\s+(\w+)\s*(?:=|IS|>|<|LIKE|IN)/gi;
        let match;
        while ((match = columnPattern.exec(sql)) !== null) {
          const col = match[1].toLowerCase();
          if (["invites", "not", "null"].includes(col)) continue;
          if (!INVITES_COLUMNS.has(col)) {
            throw new Error(
              `D1_ERROR: no such column: ${col} at offset ${match.index}: SQLITE_ERROR`,
            );
          }
        }
      }

      return {
        bind: (..._params: unknown[]) => ({
          run: async () => ({ meta: { changes: inviteData ? 1 : 0 } }),
          first: async () =>
            inviteData ? { ...inviteData, roles: "[]" } : null,
          all: async () => ({ results: [] }),
        }),
      };
    },
  } as unknown as D1Database;
}

describe("renewInvite", () => {
  it("SQL only references columns that exist in the invites table schema", async () => {
    const mockInvite = {
      id: "inv-1",
      org_id: "org_test_001",
      roster_member_id: "member-1",
      token: "abc123",
      invited_by: "admin-1",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };

    const db = createSchemaAwareMockDb(mockInvite);

    // This should NOT throw - if it does, the SQL references a non-existent column
    const result = await renewInvite(db, "inv-1");
    expect(result).not.toBeNull();
  });

  it("extends expiration by 48 hours", async () => {
    const before = Date.now();

    let capturedParams: unknown[] = [];
    const db = createSchemaAwareMockDb({
      id: "inv-1",
      org_id: "org_test_001",
      roster_member_id: "member-1",
      token: "abc",
      invited_by: "admin-1",
      expires_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    // Wrap to capture params
    const origPrepare = db.prepare.bind(db);
    (db as any).prepare = (sql: string) => {
      const stmt = origPrepare(sql);
      const origBind = stmt.bind.bind(stmt);
      stmt.bind = (...params: unknown[]) => {
        if (sql.includes("UPDATE")) capturedParams = params;
        return origBind(...params);
      };
      return stmt;
    };

    await renewInvite(db, "inv-1");

    const after = Date.now();
    const newExpiry = new Date(capturedParams[0] as string).getTime();
    const expected48h = 48 * 60 * 60 * 1000;
    expect(newExpiry).toBeGreaterThanOrEqual(before + expected48h);
    expect(newExpiry).toBeLessThanOrEqual(after + expected48h);
  });

  it("returns null when invite not found or already consumed", async () => {
    const db = createSchemaAwareMockDb(null);
    const result = await renewInvite(db, "non-existent");
    expect(result).toBeNull();
  });
});
