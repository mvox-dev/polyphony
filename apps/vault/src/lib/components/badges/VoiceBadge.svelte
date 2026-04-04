<script lang="ts">
	import type { Voice } from '$lib/types';

	interface Props {
		voice: Voice;
		isPrimary?: boolean;
		showFullName?: boolean;
		size?: 'sm' | 'md';
		removable?: boolean;
		onRemove?: () => void;
		disabled?: boolean;
		class?: string;
	}

	let {
		voice,
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
		? `${voice.name} (${voice.abbreviation})`
		: voice.abbreviation);
</script>

{#if removable && onRemove && !disabled}
	<button
		onclick={onRemove}
		type="button"
		class="group inline-flex cursor-pointer items-center gap-1 bg-purple-100 font-medium text-purple-800 transition hover:bg-purple-200 {sizeClasses[size]} {className}"
		title="Remove {voice.name}"
	>
		{#if isPrimary}★{/if}
		{displayText}
		<span class="ml-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">×</span>
	</button>
{:else}
	<span
		class="inline-flex items-center gap-1 bg-purple-100 font-medium text-purple-800 {sizeClasses[size]} {className}"
		title="{voice.name}{isPrimary ? ' (primary)' : ''}"
	>
		{#if isPrimary}★{/if}
		{displayText}
	</span>
{/if}
