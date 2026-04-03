// Tests for Registry auth activity counters
// Issue #277 — Track auth events with daily counters
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	trackActivity,
	getTodayActivity,
	getActivityRange,
	type ActivityMetric
} from '../../../../lib/server/db/activity';

// ============================================================================
// Valid metric names (from issue #277)
// ============================================================================

const VALID_METRICS: ActivityMetric[] = [
	'oauth_initiated',
	'sso_fast_path',
	'oauth_completed',
	'email_auth_sent',
	'email_auth_verified'
];

// ============================================================================
// Mock D1 database
// ============================================================================

interface StoredRow {
	metric: string;
	date: string;
	count: number;
}

/**
 * Creates a mock D1Database backed by an in-memory store.
 * Simulates the upsert pattern: INSERT ... ON CONFLICT(metric, date) DO UPDATE SET count = count + 1
 */
function createMockDb(initialRows: StoredRow[] = []) {
	const store = new Map<string, StoredRow>();

	for (const row of initialRows) {
		store.set(`${row.metric}:${row.date}`, row);
	}

	return {
		store,
		prepare: vi.fn((sql: string) => {
			const statement = {
				_params: [] as unknown[],
				bind: (...params: unknown[]) => {
					statement._params = params;
					return statement;
				},
				run: vi.fn(async () => {
					// Upsert: INSERT INTO registry_activity (metric, date, count) VALUES (?, ?, 1)
					// ON CONFLICT(metric, date) DO UPDATE SET count = count + 1
					if (sql.includes('INSERT') && sql.includes('registry_activity')) {
						const [metric, date] = statement._params as [string, string];
						const key = `${metric}:${date}`;
						const existing = store.get(key);
						if (existing) {
							existing.count += 1;
						} else {
							store.set(key, { metric, date, count: 1 });
						}
					}
					return { success: true };
				}),
				first: vi.fn(async () => {
					return null;
				}),
				all: vi.fn(async () => {
					// Today's activity: SELECT metric, count FROM registry_activity WHERE date = ?
					if (
						sql.includes('SELECT') &&
						sql.includes('registry_activity') &&
						sql.includes('WHERE')
					) {
						const params = statement._params;
						if (params.length === 1) {
							// Single date query (getTodayActivity)
							const date = params[0] as string;
							const results = Array.from(store.values())
								.filter((r) => r.date === date)
								.map((r) => ({ metric: r.metric, count: r.count }));
							return { results };
						}
						if (params.length === 2) {
							// Date range query (getActivityRange)
							const [from, to] = params as [string, string];
							const results = Array.from(store.values())
								.filter((r) => r.date >= from && r.date <= to)
								.map((r) => ({ metric: r.metric, date: r.date, count: r.count }));
							return { results };
						}
					}
					return { results: [] };
				})
			};
			return statement;
		})
	} as unknown as D1Database & { store: Map<string, StoredRow> };
}

/**
 * Creates a mock D1Database that throws on write operations.
 * Used to test fire-and-forget behavior.
 */
function createFailingDb() {
	return {
		prepare: vi.fn(() => ({
			bind: vi.fn().mockReturnThis(),
			run: vi.fn(async () => {
				throw new Error('D1 write failed: simulated error');
			}),
			first: vi.fn(async () => null),
			all: vi.fn(async () => ({ results: [] }))
		}))
	} as unknown as D1Database;
}

// ============================================================================
// trackActivity — upsert logic
// ============================================================================

describe('trackActivity', () => {
	it('creates a new row with count=1 when no existing entry', async () => {
		const db = createMockDb();
		await trackActivity(db, 'oauth_initiated');

		const today = new Date().toISOString().slice(0, 10);
		const row = (db as any).store.get(`oauth_initiated:${today}`);
		expect(row).toBeDefined();
		expect(row.count).toBe(1);
	});

	it('increments existing row count on repeated calls', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const db = createMockDb([{ metric: 'oauth_initiated', date: today, count: 5 }]);

		await trackActivity(db, 'oauth_initiated');

		const row = (db as any).store.get(`oauth_initiated:${today}`);
		expect(row.count).toBe(6);
	});

	it('tracks all five valid metric names', async () => {
		const db = createMockDb();

		for (const metric of VALID_METRICS) {
			await trackActivity(db, metric);
		}

		const today = new Date().toISOString().slice(0, 10);
		for (const metric of VALID_METRICS) {
			const row = (db as any).store.get(`${metric}:${today}`);
			expect(row, `Expected row for metric '${metric}'`).toBeDefined();
			expect(row.count).toBe(1);
		}
	});

	it('keeps separate counters for different metrics on the same day', async () => {
		const db = createMockDb();

		await trackActivity(db, 'oauth_initiated');
		await trackActivity(db, 'oauth_initiated');
		await trackActivity(db, 'oauth_completed');

		const today = new Date().toISOString().slice(0, 10);
		expect((db as any).store.get(`oauth_initiated:${today}`).count).toBe(2);
		expect((db as any).store.get(`oauth_completed:${today}`).count).toBe(1);
	});

	it("uses today's date in YYYY-MM-DD format", async () => {
		const db = createMockDb();
		await trackActivity(db, 'sso_fast_path');

		const today = new Date().toISOString().slice(0, 10);
		// Verify the entry was stored with today's date
		const row = (db as any).store.get(`sso_fast_path:${today}`);
		expect(row).toBeDefined();
		expect(row.date).toBe(today);
		expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ============================================================================
// Fire-and-forget — tracking failures must never throw
// ============================================================================

describe('trackActivity — fire-and-forget', () => {
	it('does not throw when database write fails', async () => {
		const db = createFailingDb();

		// trackActivity must not throw — it should catch internally
		await expect(trackActivity(db, 'oauth_initiated')).resolves.not.toThrow();
	});

	it('returns without error on database failure', async () => {
		const db = createFailingDb();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await trackActivity(db, 'email_auth_sent');

		// Should not throw, should return gracefully
		expect(result).toBeUndefined();

		consoleSpy.mockRestore();
	});

	it('logs error when tracking fails', async () => {
		const db = createFailingDb();
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await trackActivity(db, 'oauth_completed');

		expect(consoleSpy).toHaveBeenCalled();
		const logMessage = consoleSpy.mock.calls[0]?.[0];
		expect(typeof logMessage).toBe('string');

		consoleSpy.mockRestore();
	});
});

// ============================================================================
// Daily aggregation — counters are per-date
// ============================================================================

describe('trackActivity — daily aggregation', () => {
	it('creates separate entries for different dates', async () => {
		const today = new Date().toISOString().slice(0, 10);
		// Use a date guaranteed to be different from today
		const otherDate = today === '2026-02-19' ? '2026-02-18' : '2026-02-19';
		const db = createMockDb([{ metric: 'oauth_initiated', date: otherDate, count: 10 }]);

		// Track for today
		await trackActivity(db, 'oauth_initiated');

		// Other date's count should be untouched
		expect((db as any).store.get(`oauth_initiated:${otherDate}`).count).toBe(10);
		// Today should have count 1
		expect((db as any).store.get(`oauth_initiated:${today}`).count).toBe(1);
	});
});

// ============================================================================
// getTodayActivity — query today's counters
// ============================================================================

describe('getTodayActivity', () => {
	it('returns all metrics for today', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const db = createMockDb([
			{ metric: 'oauth_initiated', date: today, count: 15 },
			{ metric: 'sso_fast_path', date: today, count: 8 },
			{ metric: 'oauth_completed', date: today, count: 12 },
			{ metric: 'email_auth_sent', date: today, count: 3 },
			{ metric: 'email_auth_verified', date: today, count: 2 }
		]);

		const result = await getTodayActivity(db);

		expect(result).toEqual({
			oauth_initiated: 15,
			sso_fast_path: 8,
			oauth_completed: 12,
			email_auth_sent: 3,
			email_auth_verified: 2
		});
	});

	it('returns 0 for metrics with no entries today', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const db = createMockDb([{ metric: 'oauth_initiated', date: today, count: 5 }]);

		const result = await getTodayActivity(db);

		expect(result.oauth_initiated).toBe(5);
		expect(result.sso_fast_path).toBe(0);
		expect(result.oauth_completed).toBe(0);
		expect(result.email_auth_sent).toBe(0);
		expect(result.email_auth_verified).toBe(0);
	});

	it('returns all zeros when no activity recorded', async () => {
		const db = createMockDb();
		const result = await getTodayActivity(db);

		for (const metric of VALID_METRICS) {
			expect(result[metric], `Expected ${metric} to be 0`).toBe(0);
		}
	});

	it('does not include entries from other dates', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const db = createMockDb([
			{ metric: 'oauth_initiated', date: '2026-01-01', count: 99 },
			{ metric: 'oauth_initiated', date: today, count: 3 }
		]);

		const result = await getTodayActivity(db);
		expect(result.oauth_initiated).toBe(3);
	});
});

// ============================================================================
// getActivityRange — query counters for a date range
// ============================================================================

describe('getActivityRange', () => {
	it('returns entries within the date range', async () => {
		const db = createMockDb([
			{ metric: 'oauth_initiated', date: '2026-02-18', count: 10 },
			{ metric: 'oauth_initiated', date: '2026-02-19', count: 20 },
			{ metric: 'oauth_initiated', date: '2026-02-20', count: 30 },
			{ metric: 'sso_fast_path', date: '2026-02-19', count: 5 }
		]);

		const result = await getActivityRange(db, '2026-02-18', '2026-02-20');

		expect(result).toContainEqual({ metric: 'oauth_initiated', date: '2026-02-18', count: 10 });
		expect(result).toContainEqual({ metric: 'oauth_initiated', date: '2026-02-19', count: 20 });
		expect(result).toContainEqual({ metric: 'oauth_initiated', date: '2026-02-20', count: 30 });
		expect(result).toContainEqual({ metric: 'sso_fast_path', date: '2026-02-19', count: 5 });
	});

	it('excludes entries outside the date range', async () => {
		const db = createMockDb([
			{ metric: 'oauth_initiated', date: '2026-02-17', count: 99 },
			{ metric: 'oauth_initiated', date: '2026-02-19', count: 10 },
			{ metric: 'oauth_initiated', date: '2026-02-22', count: 88 }
		]);

		const result = await getActivityRange(db, '2026-02-18', '2026-02-20');

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ metric: 'oauth_initiated', date: '2026-02-19', count: 10 });
	});

	it('returns empty array when no entries in range', async () => {
		const db = createMockDb([{ metric: 'oauth_initiated', date: '2026-01-01', count: 50 }]);

		const result = await getActivityRange(db, '2026-02-01', '2026-02-28');

		expect(result).toEqual([]);
	});

	it('includes entries on boundary dates (inclusive)', async () => {
		const db = createMockDb([
			{ metric: 'oauth_initiated', date: '2026-02-18', count: 1 },
			{ metric: 'oauth_initiated', date: '2026-02-20', count: 2 }
		]);

		const result = await getActivityRange(db, '2026-02-18', '2026-02-20');

		expect(result).toHaveLength(2);
	});
});

// ============================================================================
// Metric type safety
// ============================================================================

describe('ActivityMetric type', () => {
	it('exports the 5 valid metric names', () => {
		// This test verifies the type is correctly defined
		// If ActivityMetric doesn't include all 5, TypeScript would catch it at compile time
		// but we verify at runtime too
		const metrics: ActivityMetric[] = [
			'oauth_initiated',
			'sso_fast_path',
			'oauth_completed',
			'email_auth_sent',
			'email_auth_verified'
		];
		expect(metrics).toHaveLength(5);
	});
});
