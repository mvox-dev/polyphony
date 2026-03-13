<script lang="ts">
  import { untrack } from "svelte";
  import type { PageData } from "./$types";
  import Card from "$lib/components/Card.svelte";
  import EventDetailsCard from "$lib/components/events/EventDetailsCard.svelte";
  import ParticipationCard from "$lib/components/events/ParticipationCard.svelte";
  import WhatToBringCard from "$lib/components/events/WhatToBringCard.svelte";
  import EventRepertoireCard from "$lib/components/events/EventRepertoireCard.svelte";
  import type { EventRepertoire, Work } from "$lib/types";
  import * as m from "$lib/paraglide/messages.js";

  let { data }: { data: PageData } = $props();

  // Reactive state bound to child components
  let event = $state(untrack(() => data.event));
  let repertoire = $state<EventRepertoire>(
    untrack(() => data.repertoire || { eventId: data.event.id, works: [] })
  );
  let availableWorks = $state<Work[]>(untrack(() => data.availableWorks || []));
  let myParticipation = $state(untrack(() => data.myParticipation));

  // Sync state when page data changes (navigation)
  $effect(() => {
    event = data.event;
    repertoire = data.repertoire || { eventId: data.event.id, works: [] };
    availableWorks = data.availableWorks || [];
    myParticipation = data.myParticipation;
  });
</script>

<svelte:head>
  <title>{data.event.title} | Polyphony Vault</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8">
  <!-- Back Button -->
  <div class="mb-6">
    <a href="/events" class="inline-flex items-center text-blue-600 hover:text-blue-800">
      <svg class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
      {m.events_back_to_events()}
    </a>
  </div>

  <!-- Event Details Card -->
  <EventDetailsCard bind:event canManage={data.canManage} locale={data.locale} />

  <!-- Participation Section -->
  <ParticipationCard
    eventId={data.event.id}
    hasStarted={data.hasStarted}
    canRecordAttendance={data.canRecordAttendance}
    trustIndividualResponsibility={data.trustIndividualResponsibility}
    currentMemberId={data.currentMemberId}
    bind:myParticipation
  />

  <!-- What to Bring (Personalized Materials for Singer) -->
  {#if data.myMaterials.materials.length > 0}
    <WhatToBringCard materials={data.myMaterials} eventId={data.event.id} />
  {/if}

  <!-- Event Repertoire Section (Works + Editions) -->
  <EventRepertoireCard
    eventId={data.event.id}
    bind:repertoire
    bind:availableWorks
    workEditionsMap={data.workEditionsMap}
    seasonWorkIds={new Set(data.seasonWorkIds)}
    canManage={data.canManage}
  />
</div>
