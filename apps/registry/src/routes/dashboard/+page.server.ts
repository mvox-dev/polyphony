// Server-side load for public dashboard
// Issue #278 — Platform stats and auth activity dashboard
/// <reference types="@cloudflare/workers-types" />
import type { PageServerLoad } from './$types';
import { getSnapshot, getSnapshotRange, fetchAndStoreSnapshot } from '$lib/server/db/snapshots';
import { getTodayActivity, getActivityRange } from '$lib/server/db/activity';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { snapshot: null, activity: null, history: [], activityHistory: [] };
	}

	const today = new Date().toISOString().slice(0, 10);

	// Try to fetch/cache today's Vault snapshot
	const vaultApiUrl = platform?.env?.VAULT_API_URL || 'https://vault.polyphony.uk';
	const apiKey = platform?.env?.NOTIFY_API_KEY;
	if (apiKey) {
		await fetchAndStoreSnapshot(db, vaultApiUrl, apiKey);
	}

	// Load today's data in parallel
	const [snapshot, activity] = await Promise.all([getSnapshot(db, today), getTodayActivity(db)]);

	// Load 30 days of history for charts
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const fromDate = thirtyDaysAgo.toISOString().slice(0, 10);

	const [history, activityHistory] = await Promise.all([
		getSnapshotRange(db, fromDate, today),
		getActivityRange(db, fromDate, today)
	]);

	return { snapshot, activity, history, activityHistory };
};
