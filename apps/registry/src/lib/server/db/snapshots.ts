// Registry vault snapshot storage
// Issue #276 — Store daily Vault stats snapshots

export interface VaultSnapshot {
	date: string;
	member_count: number;
	org_count: number;
	works_count: number;
	editions_count: number;
	total_file_size: number;
	events_today: string;
	fetched_at: string;
}

export interface VaultStatsResponse {
	member_count: number;
	org_count: number;
	works_count: number;
	editions_count: number;
	total_file_size: number;
	events_today: Record<string, number>;
}

/** Store a daily vault stats snapshot (upsert) */
export async function storeSnapshot(db: D1Database, data: VaultStatsResponse): Promise<void> {
	const date = new Date().toISOString().slice(0, 10);
	const eventsJson = JSON.stringify(data.events_today);

	await db
		.prepare(
			`INSERT INTO vault_snapshots (date, member_count, org_count, works_count, editions_count, total_file_size, events_today)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(date) DO UPDATE SET
				member_count = excluded.member_count,
				org_count = excluded.org_count,
				works_count = excluded.works_count,
				editions_count = excluded.editions_count,
				total_file_size = excluded.total_file_size,
				events_today = excluded.events_today,
				fetched_at = datetime('now')`
		)
		.bind(
			date,
			data.member_count,
			data.org_count,
			data.works_count,
			data.editions_count,
			data.total_file_size,
			eventsJson
		)
		.run();
}

/** Get snapshot for a specific date */
export async function getSnapshot(db: D1Database, date: string): Promise<VaultSnapshot | null> {
	return await db
		.prepare(
			'SELECT date, member_count, org_count, works_count, editions_count, total_file_size, events_today, fetched_at FROM vault_snapshots WHERE date = ?'
		)
		.bind(date)
		.first<VaultSnapshot>();
}

/** Get snapshots for a date range (inclusive) */
export async function getSnapshotRange(
	db: D1Database,
	from: string,
	to: string
): Promise<VaultSnapshot[]> {
	const { results } = await db
		.prepare(
			'SELECT date, member_count, org_count, works_count, editions_count, total_file_size, events_today, fetched_at FROM vault_snapshots WHERE date >= ? AND date <= ? ORDER BY date'
		)
		.bind(from, to)
		.all<VaultSnapshot>();

	return results;
}

/** Fetch stats from Vault and store as today's snapshot */
export async function fetchAndStoreSnapshot(
	db: D1Database,
	vaultApiUrl: string,
	apiKey: string
): Promise<VaultSnapshot | null> {
	const today = new Date().toISOString().slice(0, 10);

	try {
		// Check if today's snapshot already exists
		const existing = await getSnapshot(db, today);
		if (existing) {
			return existing;
		}

		// Fetch from Vault stats API
		const response = await fetch(`${vaultApiUrl}/api/internal/stats`, {
			headers: { Authorization: `Bearer ${apiKey}` }
		});

		if (!response.ok) {
			console.error(`[Snapshot] Vault API returned ${response.status}`);
			return null;
		}

		const data: VaultStatsResponse = await response.json();

		// Store the snapshot
		await storeSnapshot(db, data);

		// Return the stored snapshot
		return await getSnapshot(db, today);
	} catch (err) {
		console.error(`[Snapshot] Failed to fetch/store: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}
