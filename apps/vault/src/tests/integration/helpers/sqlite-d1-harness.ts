/**
 * SQLite D1 Harness — integration test helper
 *
 * Wraps Node 22's built-in `node:sqlite` to expose a D1Database-compatible
 * interface.  Applies all vault migrations (FK constraints OFF during migration,
 * ON for actual tests) so FK violations that mocks can't catch are caught here.
 *
 * Usage:
 *   const db = await createTestDb();
 *   // db is a D1Database-compatible object with real SQLite backing
 *   // FK constraints are enforced
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path: src/tests/integration/helpers → vault root → migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

// ---------------------------------------------------------------------------
// Internal D1 shim types
// ---------------------------------------------------------------------------

interface D1Meta {
	changes: number;
	last_row_id: number | null;
	duration: number;
}

interface D1Result<T = Record<string, unknown>> {
	results: T[];
	success: boolean;
	meta: D1Meta;
}

/** A bound D1PreparedStatement (holds SQL + params for batch support) */
interface BoundStatement<T = Record<string, unknown>> {
	/** Internal: raw SQL (used by batch) */
	readonly _sql: string;
	/** Internal: bound parameter values (used by batch) */
	readonly _params: unknown[];
	run(): Promise<D1Result<T>>;
	first<R = T>(): Promise<R | null>;
	all<R = T>(): Promise<D1Result<R>>;
}

// ---------------------------------------------------------------------------
// D1 shim implementation
// ---------------------------------------------------------------------------

function makeD1(sqlite: DatabaseSync): D1Database {
	function prepare(sql: string) {
		return {
			bind(...params: unknown[]): BoundStatement {
				return {
					_sql: sql,
					_params: params,

					async run(): Promise<D1Result> {
						const stmt = sqlite.prepare(sql);
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const result = (stmt.run as (...args: any[]) => any)(...params);
						return {
							results: [],
							success: true,
							meta: {
								changes: result.changes as number,
								last_row_id: typeof result.lastInsertRowid === 'bigint'
									? Number(result.lastInsertRowid)
									: (result.lastInsertRowid as number | null) ?? null,
								duration: 0
							}
						};
					},

					async first<R = Record<string, unknown>>(): Promise<R | null> {
						const stmt = sqlite.prepare(sql);
						const row = stmt.get(...(params as Parameters<typeof stmt.get>));
						if (row === undefined || row === null) return null;
						// node:sqlite returns null-prototype objects; convert to plain object
						return { ...row } as R;
					},

					async all<R = Record<string, unknown>>(): Promise<D1Result<R>> {
						const stmt = sqlite.prepare(sql);
						const rows = stmt.all(...(params as Parameters<typeof stmt.all>));
						return {
							results: rows.map((r) => ({ ...r })) as R[],
							success: true,
							meta: { changes: 0, last_row_id: null, duration: 0 }
						};
					}
				};
			}
		};
	}

	async function batch(statements: BoundStatement[]): Promise<D1Result[]> {
		// Execute all statements inside a savepoint for atomicity
		sqlite.exec('SAVEPOINT batch_sp');
		const results: D1Result[] = [];
		try {
			for (const stmt of statements) {
				const s = sqlite.prepare(stmt._sql);
				const r = s.run(...(stmt._params as Parameters<typeof s.run>));
				results.push({
					results: [],
					success: true,
					meta: {
						changes: r.changes as number,
						last_row_id: typeof r.lastInsertRowid === 'bigint'
							? Number(r.lastInsertRowid)
							: (r.lastInsertRowid as number | null) ?? null,
						duration: 0
					}
				});
			}
			sqlite.exec('RELEASE batch_sp');
		} catch (err) {
			sqlite.exec('ROLLBACK TO batch_sp');
			throw err;
		}
		return results;
	}

	async function execRaw(sql: string): Promise<{ count: number; duration: number }> {
		sqlite.exec(sql);
		return { count: 0, duration: 0 };
	}

	// Return as D1Database (cast via unknown — shim is compatible at the call sites)
	return {
		prepare,
		batch,
		exec: execRaw,
		dump: async () => new ArrayBuffer(0),
		withSession: () => { throw new Error('withSession not implemented in test harness'); }
	} as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Migration runner + factory
// ---------------------------------------------------------------------------

/**
 * Create a fully-migrated in-memory SQLite D1 database suitable for
 * integration tests.
 *
 * - All 36 vault migrations are applied (FK constraints OFF during migration
 *   to match D1's behaviour on DDL).
 * - FK constraints are enabled AFTER migration, so tests catch real violations.
 */
export function createTestDb(): D1Database {
	const sqlite = new DatabaseSync(':memory:');

	// Disable FK during migrations: D1 ignores FK on DROP TABLE; node:sqlite
	// doesn't, which would break several table-rebuild migrations.
	sqlite.exec('PRAGMA foreign_keys = OFF');
	sqlite.exec('PRAGMA journal_mode = WAL');

	const migrationFiles = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();

	for (const file of migrationFiles) {
		const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
		try {
			sqlite.exec(sql);
		} catch (err) {
			throw new Error(`Migration failed: ${file} — ${(err as Error).message}`);
		}
	}

	// Enable FK constraints for the actual test code
	sqlite.exec('PRAGMA foreign_keys = ON');

	return makeD1(sqlite);
}
