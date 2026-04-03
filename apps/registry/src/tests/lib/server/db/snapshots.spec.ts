// @ts-nocheck — Module doesn't exist yet (red phase TDD)
// Tests for Registry vault snapshot storage
// Issue #276 — Store daily Vault stats snapshots
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	storeSnapshot,
	getSnapshot,
	getSnapshotRange,
	fetchAndStoreSnapshot,
	type VaultSnapshot
} from '../../../../lib/server/db/snapshots';

// ============================================================================
// Test data
// ============================================================================

const SAMPLE_VAULT_RESPONSE = {
	member_count: 42,
	org_count: 3,
	works_count: 150,
	editions_count: 200,
	total_file_size: 1048576,
	events_today: {
		rehearsal: 2,
		concert: 1,
		retreat: 0,
		festival: 0
	}
};

const SAMPLE_SNAPSHOT: VaultSnapshot = {
	date: '2026-02-20',
	member_count: 42,
	org_count: 3,
	works_count: 150,
	editions_count: 200,
	total_file_size: 1048576,
	events_today: JSON.stringify({ rehearsal: 2, concert: 1, retreat: 0, festival: 0 }),
	fetched_at: '2026-02-20 01:00:00'
};

// ============================================================================
// Mock D1 database
// ============================================================================

interface SnapshotRow {
	date: string;
	member_count: number;
	org_count: number;
	works_count: number;
	editions_count: number;
	total_file_size: number;
	events_today: string;
	fetched_at: string;
}

function createMockDb(initialRows: SnapshotRow[] = []) {
	const store = new Map<string, SnapshotRow>();

	for (const row of initialRows) {
		store.set(row.date, row);
	}

	return {
		store,
		prepare: vi.fn((sql: string) => {
			const statement = {
				_params: [] as unknown[],
				bind: vi.fn((...params: unknown[]) => {
					statement._params = params;
					return statement;
				}),
				run: vi.fn(async () => {
					if (sql.includes('INSERT') && sql.includes('vault_snapshots')) {
						const [
							date,
							member_count,
							org_count,
							works_count,
							editions_count,
							total_file_size,
							events_today
						] = statement._params as [string, number, number, number, number, number, string];
						store.set(date, {
							date,
							member_count,
							org_count,
							works_count,
							editions_count,
							total_file_size,
							events_today,
							fetched_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
						});
					}
					return { success: true };
				}),
				first: vi.fn(async () => {
					if (
						sql.includes('SELECT') &&
						sql.includes('vault_snapshots') &&
						sql.includes('WHERE date = ?')
					) {
						const date = statement._params[0] as string;
						return store.get(date) ?? null;
					}
					return null;
				}),
				all: vi.fn(async () => {
					if (sql.includes('SELECT') && sql.includes('vault_snapshots') && sql.includes('WHERE')) {
						const [from, to] = statement._params as [string, string];
						const results = Array.from(store.values())
							.filter((r) => r.date >= from && r.date <= to)
							.sort((a, b) => a.date.localeCompare(b.date));
						return { results };
					}
					return { results: [] };
				})
			};
			return statement;
		})
	} as unknown as D1Database & { store: Map<string, SnapshotRow> };
}

// ============================================================================
// storeSnapshot — upsert daily snapshot
// ============================================================================

describe('storeSnapshot', () => {
	it('stores a new snapshot for today', async () => {
		const db = createMockDb();
		const today = new Date().toISOString().slice(0, 10);

		await storeSnapshot(db, SAMPLE_VAULT_RESPONSE);

		const row = db.store.get(today);
		expect(row).toBeDefined();
		expect(row!.member_count).toBe(42);
		expect(row!.org_count).toBe(3);
		expect(row!.works_count).toBe(150);
		expect(row!.editions_count).toBe(200);
		expect(row!.total_file_size).toBe(1048576);
	});

	it('stores events_today as JSON string', async () => {
		const db = createMockDb();
		const today = new Date().toISOString().slice(0, 10);

		await storeSnapshot(db, SAMPLE_VAULT_RESPONSE);

		const row = db.store.get(today);
		expect(row).toBeDefined();
		const events = JSON.parse(row!.events_today);
		expect(events.rehearsal).toBe(2);
		expect(events.concert).toBe(1);
		expect(events.retreat).toBe(0);
		expect(events.festival).toBe(0);
	});

	it('overwrites existing snapshot for the same date (upsert)', async () => {
		const today = new Date().toISOString().slice(0, 10);
		const db = createMockDb([
			{
				date: today,
				member_count: 10,
				org_count: 1,
				works_count: 50,
				editions_count: 60,
				total_file_size: 500,
				events_today: '{}',
				fetched_at: '2026-02-20 00:00:00'
			}
		]);

		await storeSnapshot(db, SAMPLE_VAULT_RESPONSE);

		const row = db.store.get(today);
		expect(row!.member_count).toBe(42);
		expect(row!.org_count).toBe(3);
	});
});

// ============================================================================
// getSnapshot — single date lookup
// ============================================================================

describe('getSnapshot', () => {
	it('returns snapshot for a given date', async () => {
		const db = createMockDb([SAMPLE_SNAPSHOT]);

		const result = await getSnapshot(db, '2026-02-20');

		expect(result).not.toBeNull();
		expect(result!.member_count).toBe(42);
		expect(result!.date).toBe('2026-02-20');
	});

	it('returns null when no snapshot exists', async () => {
		const db = createMockDb();

		const result = await getSnapshot(db, '2026-02-20');

		expect(result).toBeNull();
	});
});

// ============================================================================
// getSnapshotRange — date range query
// ============================================================================

describe('getSnapshotRange', () => {
	const multiDayData: SnapshotRow[] = [
		{ ...SAMPLE_SNAPSHOT, date: '2026-02-18', member_count: 38 },
		{ ...SAMPLE_SNAPSHOT, date: '2026-02-19', member_count: 40 },
		{ ...SAMPLE_SNAPSHOT, date: '2026-02-20', member_count: 42 }
	];

	it('returns snapshots within date range', async () => {
		const db = createMockDb(multiDayData);

		const result = await getSnapshotRange(db, '2026-02-18', '2026-02-20');

		expect(result).toHaveLength(3);
	});

	it('respects date boundaries (inclusive)', async () => {
		const db = createMockDb(multiDayData);

		const result = await getSnapshotRange(db, '2026-02-19', '2026-02-19');

		expect(result).toHaveLength(1);
		expect(result[0].member_count).toBe(40);
	});

	it('returns empty array when no snapshots in range', async () => {
		const db = createMockDb(multiDayData);

		const result = await getSnapshotRange(db, '2026-03-01', '2026-03-31');

		expect(result).toEqual([]);
	});

	it('returns results sorted by date', async () => {
		const db = createMockDb(multiDayData);

		const result = await getSnapshotRange(db, '2026-02-18', '2026-02-20');

		expect(result[0].date).toBe('2026-02-18');
		expect(result[1].date).toBe('2026-02-19');
		expect(result[2].date).toBe('2026-02-20');
	});
});

// ============================================================================
// fetchAndStoreSnapshot — orchestrator
// ============================================================================

describe('fetchAndStoreSnapshot', () => {
	const VAULT_URL = 'https://vault.polyphony.uk';
	const API_KEY = 'test-notify-key';

	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('fetches from Vault and stores the snapshot', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response(JSON.stringify(SAMPLE_VAULT_RESPONSE), { status: 200 })
		);
		const db = createMockDb();

		const result = await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		expect(result).not.toBeNull();
		expect(result!.member_count).toBe(42);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			`${VAULT_URL}/api/internal/stats`,
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Bearer ${API_KEY}`
				})
			})
		);
	});

	it('skips fetch when today snapshot already exists', async () => {
		const today = new Date().toISOString().slice(0, 10);
		globalThis.fetch = vi.fn();
		const db = createMockDb([{ ...SAMPLE_SNAPSHOT, date: today }]);

		const result = await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		expect(result).not.toBeNull();
		expect(result!.member_count).toBe(42);
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it('returns null on fetch failure', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error('Network error');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const db = createMockDb();

		const result = await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		expect(result).toBeNull();
		consoleSpy.mockRestore();
	});

	it('returns null on non-200 response', async () => {
		globalThis.fetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const db = createMockDb();

		const result = await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		expect(result).toBeNull();
		consoleSpy.mockRestore();
	});

	it('logs error on failure', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error('Connection refused');
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const db = createMockDb();

		await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('sends correct Authorization header', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response(JSON.stringify(SAMPLE_VAULT_RESPONSE), { status: 200 })
		);
		const db = createMockDb();

		await fetchAndStoreSnapshot(db, VAULT_URL, API_KEY);

		const fetchCall = (globalThis.fetch as any).mock.calls[0];
		expect(fetchCall[1].headers.Authorization).toBe('Bearer test-notify-key');
	});
});
