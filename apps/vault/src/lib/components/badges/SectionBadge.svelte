<script lang="ts">
	import type { Section } from '$lib/types';

	interface Props {
		section: Section;
		isPrimary?: boolean;
		showFullName?: boolean;
		size?: 'sm' | 'md';
		removable?: boolean;
		onRemove?: () => void;
		disabled?: boolean;
		class?: string;
	}

	let {
		section,
		isPrimary = false,
		showFullName = false,
		size = 'sm',
		removable = false,
		onRemove,
		disabled = false,
		class: className = ''
	}: Props = $props();

	const sizeClasses = {
		sm: 'rounded px-2 py-0.5 text-xs',
		md: 'rounded-full px-3 py-1 text-sm'
	};

	let displayText = $derived(showFullName
		? `${section.name} (${section.abbreviation})`
		: section.abbreviation);
</script>

{#if removable && onRemove && !disabled}
	<button
		onclick={onRemove}
		type="button"
		class="group inline-flex cursor-pointer items-center gap-1 bg-teal-100 font-medium text-teal-800 transition hover:bg-teal-200 {sizeClasses[size]} {className}"
		title="Remove {section.name}"
	>
		{#if isPrimary}★{/if}
		{displayText}
		<span class="ml-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">×</span>
	</button>
{:else}
	<span
		class="inline-flex items-center gap-1 bg-teal-100 font-medium text-teal-800 {sizeClasses[size]} {className}"
		title="{section.name}{isPrimary ? ' (primary)' : ''}"
	>
		{#if isPrimary}★{/if}
		{displayText}
	</span>
{/if}
