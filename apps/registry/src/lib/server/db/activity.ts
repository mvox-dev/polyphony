// Registry auth activity counters
// Issue #277 — Track auth events with daily counters

export type ActivityMetric =
	| 'oauth_initiated'
	| 'sso_fast_path'
	| 'oauth_completed'
	| 'email_auth_sent'
	| 'email_auth_verified';

const ALL_METRICS: ActivityMetric[] = [
	'oauth_initiated',
	'sso_fast_path',
	'oauth_completed',
	'email_auth_sent',
	'email_auth_verified'
];

/**
 * Track an auth activity event. Upserts a daily counter row.
 * Fire-and-forget: catches errors internally and logs them.
 */
export async function trackActivity(db: D1Database, metric: ActivityMetric): Promise<void> {
	const date = new Date().toISOString().slice(0, 10);
	try {
		await db
			.prepare(
				`INSERT INTO registry_activity (metric, date, count) VALUES (?, ?, 1)
				ON CONFLICT(metric, date) DO UPDATE SET count = count + 1`
			)
			.bind(metric, date)
			.run();
	} catch (err) {
		console.error(
			`[Activity] Failed to track ${metric}: ${err instanceof Error ? err.message : err}`
		);
	}
}

/**
 * Get today's activity counters for all metrics.
 * Returns 0 for metrics with no entries.
 */
export async function getTodayActivity(db: D1Database): Promise<Record<ActivityMetric, number>> {
	const date = new Date().toISOString().slice(0, 10);
	const { results } = await db
		.prepare('SELECT metric, count FROM registry_activity WHERE date = ?')
		.bind(date)
		.all<{ metric: string; count: number }>();

	const activity = {} as Record<ActivityMetric, number>;
	for (const m of ALL_METRICS) {
		activity[m] = 0;
	}
	for (const row of results) {
		if (ALL_METRICS.includes(row.metric as ActivityMetric)) {
			activity[row.metric as ActivityMetric] = row.count;
		}
	}
	return activity;
}

/**
 * Get activity counters for a date range (inclusive).
 */
export async function getActivityRange(
	db: D1Database,
	from: string,
	to: string
): Promise<Array<{ metric: string; date: string; count: number }>> {
	const { results } = await db
		.prepare('SELECT metric, date, count FROM registry_activity WHERE date >= ? AND date <= ?')
		.bind(from, to)
		.all<{ metric: string; date: string; count: number }>();

	return results;
}
