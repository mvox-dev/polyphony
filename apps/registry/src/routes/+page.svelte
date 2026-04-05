<script lang="ts">
	// Landing page for Polyphony Registry
</script>

<svelte:head>
	<title>Polyphony — Federated Choral Music Sharing</title>
	<meta
		name="description"
		content="A federated platform for choirs to manage and share their music libraries securely within trusted circles."
	/>
</svelte:head>

<div class="min-h-screen bg-linear-to-b from-slate-50 to-white">
	<!-- Hero Section -->
	<header class="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
		<div class="mb-6 flex items-center justify-center gap-3">
			<!-- Music notes icon -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-12 w-12 text-indigo-600"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
				/>
			</svg>
			<h1 class="text-4xl font-bold text-slate-900 sm:text-5xl">Polyphony</h1>
		</div>
		<p class="text-xl text-slate-600 sm:text-2xl">
			Manage your ensemble's scores, members, and rehearsals — all in one place.
		</p>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-5xl px-6 pb-16">
		<!-- Action Cards -->
		<div class="grid gap-6 sm:grid-cols-2">
			<!-- Find a Choir -->
			<a
				href="/directory"
				class="group rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-indigo-200"
			>
				<div
					class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-xl font-semibold text-slate-900">Find an ensemble</h3>
				<p class="text-slate-600">Browse the directory of registered ensembles using Polyphony.</p>
			</a>

			<!-- Register Your Collective -->
			<a
				href="/register"
				class="group rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-emerald-200"
			>
				<div
					class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</div>
				<h3 class="mb-2 text-xl font-semibold text-slate-900">Register your ensemble</h3>
				<p class="text-slate-600">
					Start your ensemble's own space — manage your library, members, and events. Free.
				</p>
			</a>
		</div>

		<!-- Features Preview -->
		<section class="mt-16">
			<h2 class="mb-8 text-center text-2xl font-semibold text-slate-900">Built for ensembles</h2>
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<div class="text-center">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
							/>
						</svg>
					</div>
					<h3 class="font-medium text-slate-900">Score Library</h3>
					<p class="text-sm text-slate-500">Works, editions, physical copies</p>
				</div>
				<div class="text-center">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
					</div>
					<h3 class="font-medium text-slate-900">Member Management</h3>
					<p class="text-sm text-slate-500">Roles, voices, sections</p>
				</div>
				<div class="text-center">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<h3 class="font-medium text-slate-900">Events & Attendance</h3>
					<p class="text-sm text-slate-500">Rehearsals, concerts, RSVP</p>
				</div>
				<div class="text-center">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
							/>
						</svg>
					</div>
					<h3 class="font-medium text-slate-900">Umbrella Support</h3>
					<p class="text-sm text-slate-500">Manage affiliated choirs</p>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-t border-slate-100 bg-slate-50 py-8">
		<div class="mx-auto max-w-5xl px-6 text-center">
			<p class="text-sm text-slate-500">
				Operated by Mihkel Putrinš @ <a
					href="https://github.com/mitselek"
					class="font-medium text-indigo-600 hover:text-indigo-700">Institute of Beautiful Scores</a
				>
			</p>
			<p class="mt-2 text-xs text-slate-400">Open source · Privacy-first · Built for ensembles</p>
			<p class="mt-3 text-xs text-slate-400">
				<a href="https://github.com/mitselek/polyphony" class="hover:text-indigo-600">GitHub</a>
				<span class="mx-2">·</span>
				<a href="/directory" class="hover:text-indigo-600">Directory</a>
				<span class="mx-2">·</span>
				<a href="/dashboard" class="hover:text-indigo-600">Dashboard</a>
			</p>
		</div>
	</footer>
</div>
