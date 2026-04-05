<script lang="ts">
	import type { ActionData } from './$types';
	import { SECTION_PRESETS } from '@polyphony/shared';
	import * as m from '$lib/paraglide/messages.js';

	let { form }: { form: ActionData } = $props();

	// Form state
	let name = $state('');
	let email = $state('');
	let subdomain = $state('');
	let subdomainTouched = $state(false); // Has user manually edited subdomain?
	let subdomainStatus = $state<
		'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved'
	>('idle');
	let subdomainError = $state('');
	let isSubmitting = $state(false);
	let selectedPresetId = $state('');

	// Debounce timer for subdomain check
	let checkTimer: ReturnType<typeof setTimeout> | null = null;

	// Slugify a name into a valid subdomain
	function slugify(value: string): string {
		return value
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '') // Strip diacritics
			.replace(/[^a-z0-9]+/g, '-') // Non-alphanumeric → hyphen
			.replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
			.replace(/--+/g, '-') // No double hyphens
			.slice(0, 30); // Max length
	}

	// Format subdomain as user types
	function formatSubdomain(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '') // Remove invalid chars
			.replace(/--+/g, '-'); // No double hyphens
	}

	// Check subdomain availability via client-side fetch
	// Note: This calls Vault API directly in the client
	async function checkSubdomain(value: string) {
		if (value.length < 3) {
			subdomainStatus = 'idle';
			subdomainError = '';
			return;
		}

		subdomainStatus = 'checking';
		subdomainError = '';

		try {
			// For now, skip client-side check and let server validate
			// Can be enhanced later to call Vault API from browser
			subdomainStatus = 'idle';
		} catch {
			subdomainStatus = 'invalid';
			subdomainError = 'Failed to check availability';
		}
	}

	// Handle subdomain input
	function handleSubdomainInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const formatted = formatSubdomain(target.value);
		subdomain = formatted;
		target.value = formatted;

		// Clear previous timer
		if (checkTimer) {
			clearTimeout(checkTimer);
		}

		// Debounce the check
		if (formatted.length >= 3) {
			checkTimer = setTimeout(() => checkSubdomain(formatted), 500);
		} else {
			subdomainStatus = 'idle';
		}
	}

	// Form validation
	let isFormValid = $derived(
		name.trim().length > 0 && email.trim().length > 0 && subdomain.length >= 3
	);

	// Status indicator classes
	function getStatusClass(status: typeof subdomainStatus): string {
		switch (status) {
			case 'checking':
				return 'text-gray-500';
			case 'available':
				return 'text-green-600';
			case 'taken':
			case 'reserved':
			case 'invalid':
				return 'text-red-600';
			default:
				return 'text-gray-400';
		}
	}

	function getStatusIcon(status: typeof subdomainStatus): string {
		switch (status) {
			case 'checking':
				return '⏳';
			case 'available':
				return '✓';
			case 'taken':
			case 'reserved':
			case 'invalid':
				return '✗';
			default:
				return '';
		}
	}

	const choralIds = ['satb', 'ssaattbb', 'sab'];
	const orchestralIds = ['strings', 'chamber', 'orchestra'];

	const choralPresets = $derived(SECTION_PRESETS.filter((p) => choralIds.includes(p.id)));
	const orchestralPresets = $derived(SECTION_PRESETS.filter((p) => orchestralIds.includes(p.id)));

	const selectedPreset = $derived(SECTION_PRESETS.find((p) => p.id === selectedPresetId) ?? null);

	// Group preset sections into subtrees for hierarchical preview
	const presetGroups = $derived(
		selectedPreset
			? selectedPreset.sections
					.filter((s) => !s.parentName)
					.map((root) => ({
						root,
						children: selectedPreset.sections.filter((s) => s.parentName === root.name)
					}))
			: []
	);
</script>

<svelte:head>
	<title>{m.register_page_title()}</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
	<div class="max-w-md w-full">
		<div class="text-center mb-8">
			<h1 class="text-3xl font-bold text-gray-900">{m.register_heading()}</h1>
			<p class="mt-2 text-gray-600">{m.register_subtitle()}</p>
		</div>

		<div class="bg-white rounded-xl shadow-sm p-8">
			{#if form?.error}
				<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
					{form.error}
				</div>
			{/if}

			<form method="POST" class="space-y-6">
				<!-- Organization Name -->
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-1">
						{m.register_name_label()}
					</label>
					<input
						type="text"
						id="name"
						name="name"
						bind:value={name}
						oninput={() => {
							if (!subdomainTouched) {
								subdomain = slugify(name);
							}
						}}
						required
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="Kammerkoor Credo"
					/>
				</div>

				<!-- Contact Email -->
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700 mb-1">
						{m.register_contact_email_label()}
					</label>
					<input
						type="email"
						id="email"
						name="email"
						bind:value={email}
						required
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="contact@example.com"
					/>
					<p class="mt-1 text-sm text-gray-500">{m.register_contact_email_hint()}</p>
				</div>

				<!-- Subdomain -->
				<div>
					<label for="subdomain" class="block text-sm font-medium text-gray-700 mb-1">
						{m.register_subdomain_label()}
					</label>
					<div class="flex items-center">
						<input
							type="text"
							id="subdomain"
							name="subdomain"
							value={subdomain}
							oninput={(e) => {
								subdomainTouched = true;
								handleSubdomainInput(e);
							}}
							required
							minlength="3"
							maxlength="30"
							pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]"
							class="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							placeholder="kammerkoor-credo"
						/>
						<span
							class="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-600"
						>
							.polyphony.uk
						</span>
					</div>
					<div class="mt-1 flex items-center gap-2">
						{#if subdomainStatus !== 'idle'}
							<span class={getStatusClass(subdomainStatus)}>
								{getStatusIcon(subdomainStatus)}
								{#if subdomainStatus === 'checking'}
									{m.register_subdomain_checking()}
								{:else if subdomainStatus === 'available'}
									{m.register_subdomain_available()}
								{:else}
									{subdomainError}
								{/if}
							</span>
						{:else if subdomain.length > 0 && subdomain.length < 3}
							<span class="text-gray-500 text-sm">{m.register_subdomain_min_length()}</span>
						{/if}
					</div>
					<p class="mt-1 text-sm text-gray-500">{m.register_subdomain_hint()}</p>
				</div>

				<!-- Section Preset Picker -->
				<div>
					<label for="sections" class="block text-sm font-medium text-gray-700 mb-1">
						{m.register_sections_label()}
						<span class="font-normal text-gray-500">{m.common_optional()}</span>
					</label>
					<select
						id="sections"
						name="sections"
						bind:value={selectedPresetId}
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
					>
						<option value="">{m.register_sections_none()}</option>
						<optgroup label={m.register_sections_optgroup_choral()}>
							{#each choralPresets as preset (preset.id)}
								<option value={preset.id}>{preset.label} — {preset.description}</option>
							{/each}
						</optgroup>
						<optgroup label={m.register_sections_optgroup_orchestral()}>
							{#each orchestralPresets as preset (preset.id)}
								<option value={preset.id}>{preset.label} — {preset.description}</option>
							{/each}
						</optgroup>
					</select>
					<p class="mt-1 text-sm text-gray-500">
						{m.register_sections_populate_hint()}
					</p>

					{#if selectedPreset}
						<div
							class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg"
							aria-label="Section preview"
						>
							<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
								{m.register_sections_included()}
							</p>
							<div class="space-y-1.5">
								{#each presetGroups as group (group.root.name)}
									<div class="overflow-hidden rounded border border-gray-200 bg-white">
										<!-- Root section -->
										<div class="flex items-center gap-1.5 px-2 py-1">
											<span class="font-mono text-xs text-gray-400">{group.root.abbreviation}</span>
											<span class="text-sm text-gray-700">{group.root.name}</span>
										</div>
										<!-- Child sections -->
										{#each group.children as child (child.name)}
											<div
												class="flex items-center gap-1.5 border-t border-gray-100 bg-gray-50 px-2 py-1 pl-5"
											>
												<span class="font-mono text-xs text-gray-400">{child.abbreviation}</span>
												<span class="text-sm text-gray-600">{child.name}</span>
											</div>
										{/each}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					disabled={!isFormValid || isSubmitting}
					class="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
				>
					{#if isSubmitting}
						{m.register_actions_creating()}
					{:else}
						{m.register_actions_submit()}
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-6 text-center text-sm text-gray-500">
			{m.register_terms()}
		</p>
	</div>
</div>
