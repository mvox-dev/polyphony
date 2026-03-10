<script lang="ts">
  import { onMount } from "svelte";
  import Card from "$lib/components/Card.svelte";
  import StatusButtons from "$lib/components/events/StatusButtons.svelte";
  import type { PlannedStatus, ActualStatus } from "$lib/types";
  import { toast } from "$lib/stores/toast";
  import { groupBySection, sortBySection } from "$lib/utils/section-ordering";
  import * as m from "$lib/paraglide/messages.js";

  const rsvpOptions = $derived([
    { value: 'yes', label: m.rsvp_yes(), activeClass: 'bg-green-600 text-white border-green-700' },
    { value: 'no', label: m.rsvp_no(), activeClass: 'bg-red-600 text-white border-red-700' },
    { value: 'maybe', label: m.rsvp_maybe(), activeClass: 'bg-yellow-600 text-white border-yellow-700' },
    { value: 'late', label: m.rsvp_late(), activeClass: 'bg-orange-600 text-white border-orange-700' },
  ]);

  const attendanceOptions = $derived([
    { value: 'present', label: m.attendance_present(), activeClass: 'bg-green-600 text-white border-green-700' },
    { value: 'absent', label: m.attendance_absent(), activeClass: 'bg-red-600 text-white border-red-700' },
    { value: 'late', label: m.attendance_late(), activeClass: 'bg-orange-600 text-white border-orange-700' },
  ]);

  interface Section {
    name: string;
    abbreviation: string;
    displayOrder?: number;
  }

  interface ParticipationMember {
    memberId: string;
    memberName: string;
    plannedStatus: PlannedStatus | null;
    actualStatus: ActualStatus | null;
    primarySection: Section | null;
  }

  interface MyParticipation {
    plannedStatus: PlannedStatus | null;
    actualStatus: ActualStatus | null;
  }

  interface Props {
    eventId: string;
    hasStarted: boolean;
    canRecordAttendance: boolean;
    trustIndividualResponsibility?: boolean;
    currentMemberId?: string;
    myParticipation?: MyParticipation | null;
  }

  let {
    eventId,
    hasStarted,
    canRecordAttendance,
    trustIndividualResponsibility = false,
    currentMemberId = '',
    myParticipation = $bindable(null),
  }: Props = $props();

  // Issue #240: Can current user edit their own RSVP (even for past events)?
  let canEditOwnRsvp = $derived(!hasStarted || trustIndividualResponsibility);
  // Issue #240: Can current user edit their own attendance?
  let canEditOwnAttendance = $derived(hasStarted && trustIndividualResponsibility);

  // State
  let participationData = $state<ParticipationMember[]>([]);
  let loadingParticipation = $state(false);
  let updatingRsvp = $state(false);
  let showParticipationDetails = $state(false);
  let recordingAttendance = $state<Record<string, boolean>>({});
  let bulkUpdatingAttendance = $state(false);
  let updatingOwnAttendance = $state(false);

  // Load participation on mount
  onMount(() => {
    loadParticipation();
  });

  async function loadParticipation() {
    if (loadingParticipation) return;

    loadingParticipation = true;
    try {
      const response = await fetch(`/api/events/${eventId}/participation`);
      if (!response.ok) {
        throw new Error("Failed to load participation data");
      }
      participationData = await response.json();
    } catch (err) {
      console.error("Failed to load participation:", err);
    } finally {
      loadingParticipation = false;
    }
  }

  async function updateMyRsvp(status: PlannedStatus) {
    updatingRsvp = true;

    try {
      const response = await fetch(`/api/events/${eventId}/participation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || "Failed to update RSVP");
      }

      // Update local state for immediate reactivity
      if (myParticipation) {
        myParticipation = { ...myParticipation, plannedStatus: status };
      } else {
        myParticipation = { plannedStatus: status, actualStatus: null };
      }

      // Reload full participation data in background
      await loadParticipation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update RSVP");
    } finally {
      updatingRsvp = false;
    }
  }

  async function updateOwnAttendance(status: ActualStatus) {
    updatingOwnAttendance = true;

    try {
      const response = await fetch(`/api/events/${eventId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: currentMemberId, status }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || "Failed to update attendance");
      }

      // Update local state
      if (myParticipation) {
        myParticipation = { ...myParticipation, actualStatus: status };
      } else {
        myParticipation = { plannedStatus: null, actualStatus: status };
      }

      await loadParticipation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update attendance");
    } finally {
      updatingOwnAttendance = false;
    }
  }

  async function updateAttendance(memberId: string, status: ActualStatus) {
    recordingAttendance[memberId] = true;

    try {
      const response = await fetch(`/api/events/${eventId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, status }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || "Failed to record attendance");
      }

      await loadParticipation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record attendance");
    } finally {
      recordingAttendance[memberId] = false;
    }
  }

  async function markAllPresent() {
    const confirmed = confirm(m.participation_mark_all_confirm());
    if (!confirmed) return;

    bulkUpdatingAttendance = true;

    try {
      const updates = participationData.map((p) => ({
        memberId: p.memberId,
        status: "present" as ActualStatus,
      }));

      const response = await fetch(`/api/events/${eventId}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || "Failed to mark all present");
      }

      await loadParticipation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark all present");
    } finally {
      bulkUpdatingAttendance = false;
    }
  }

  // Calculate section summary
  function getSectionSummary(): string {
    if (participationData.length === 0) return "";

    const sectionCounts: Record<string, number> = {};
    let totalYes = 0;

    participationData.forEach((p) => {
      if (p.plannedStatus === "yes" && p.primarySection) {
        const abbr = p.primarySection.abbreviation;
        sectionCounts[abbr] = (sectionCounts[abbr] || 0) + 1;
        totalYes++;
      }
    });

    const sectionOrder = new Map<string, number>();
    participationData.forEach((p) => {
      if (p.primarySection) {
        sectionOrder.set(p.primarySection.abbreviation, p.primarySection.displayOrder ?? 999);
      }
    });

    const orderedSections = Object.entries(sectionCounts).sort(([a], [b]) => {
      const orderA = sectionOrder.get(a) ?? 999;
      const orderB = sectionOrder.get(b) ?? 999;
      return orderA - orderB;
    });

    if (orderedSections.length === 0) return m.participation_no_rsvps();

    const summary = orderedSections.map(([section, count]) => `${section}: ${count}`).join("  ");

    return `${summary}  ${m.participation_total({ count: totalYes })}`;
  }

  // Group members by section, sorted by displayOrder
  function getMembersBySection() {
    return groupBySection(participationData, (p) => p.primarySection);
  }

  // Sort participation data by section displayOrder then member name
  function getSortedParticipation() {
    return sortBySection(participationData, (p) => p.primarySection, (p) => p.memberName);
  }
</script>

<Card padding="lg" class="mb-8">
  <h2 class="mb-4 text-2xl font-semibold">{m.participation_title()}</h2>

  <!-- My RSVP -->
  {#if canEditOwnRsvp}
    <div class="mb-6 rounded-lg bg-blue-50 p-4">
      <h3 class="mb-2 font-semibold text-blue-900">{m.participation_your_rsvp()}</h3>
      <StatusButtons
        options={rsvpOptions}
        current={myParticipation?.plannedStatus ?? null}
        disabled={updatingRsvp}
        onselect={(v) => updateMyRsvp(v as PlannedStatus)}
      />
    </div>
  {:else}
    <div class="mb-6 rounded-lg bg-gray-100 p-4">
      <p class="text-sm text-gray-600">
        {#if myParticipation?.plannedStatus}
          {m.participation_rsvp_locked_with_status({ status: myParticipation.plannedStatus })}
        {:else}
          {m.participation_rsvp_locked()}
        {/if}
      </p>
    </div>
  {/if}

  <!-- My Attendance (Issue #240: self-service when trust setting is enabled) -->
  {#if canEditOwnAttendance && !canRecordAttendance}
    <div class="mb-6 rounded-lg bg-purple-50 p-4">
      <h3 class="mb-2 font-semibold text-purple-900">{m.participation_your_attendance()}</h3>
      <StatusButtons
        options={attendanceOptions}
        current={myParticipation?.actualStatus ?? null}
        disabled={updatingOwnAttendance}
        onselect={(v) => updateOwnAttendance(v as ActualStatus)}
      />
      {#if myParticipation?.actualStatus}
        <p class="mt-2 text-sm text-purple-700">
          {m.participation_current_status()} <span class="font-medium capitalize">{myParticipation.actualStatus}</span>
        </p>
      {/if}
    </div>
  {/if}

  <!-- Section Summary -->
  <div class="mb-4">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">{m.participation_rsvps_by_section()}</h3>
      <button
        onclick={() => (showParticipationDetails = !showParticipationDetails)}
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        {showParticipationDetails ? m.participation_hide_details() : m.participation_show_details()}
      </button>
    </div>
    <p class="mt-2 text-sm text-gray-600">
      {loadingParticipation ? m.common_loading() : getSectionSummary()}
    </p>
  </div>

  <!-- Detailed Participation List -->
  {#if showParticipationDetails}
    <div class="mt-4 space-y-4">
      {#each getMembersBySection() as [sectionName, members]}
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 class="mb-3 font-semibold text-gray-900">{sectionName}</h4>
          <div class="space-y-2">
            {#each members as member}
              <div class="flex items-center justify-between text-sm">
                <div class="flex-1">
                  <span class="font-medium">{member.memberName}</span>
                  {#if member.plannedStatus}
                    <span
                      class="ml-2 rounded-full px-2 py-0.5 text-xs {member.plannedStatus === 'yes'
                        ? 'bg-green-100 text-green-800'
                        : member.plannedStatus === 'no'
                          ? 'bg-red-100 text-red-800'
                          : member.plannedStatus === 'maybe'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-orange-100 text-orange-800'}"
                    >
                      {member.plannedStatus}
                    </span>
                  {:else}
                    <span class="ml-2 text-gray-500">{m.participation_no_response()}</span>
                  {/if}
                </div>
                {#if member.actualStatus}
                  <span class="text-xs text-gray-500">
                    {m.participation_attended()} {member.actualStatus}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Attendance Recording (Conductor only, after event starts) -->
  {#if hasStarted && canRecordAttendance}
    <div class="mt-6 border-t border-gray-200 pt-6">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="font-semibold">{m.participation_record_attendance()}</h3>
        <button
          onclick={markAllPresent}
          disabled={bulkUpdatingAttendance}
          class="rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          {bulkUpdatingAttendance ? m.participation_updating() : m.participation_mark_all_present()}
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="px-2 py-2 text-left text-sm font-medium text-gray-700 sm:px-4">{m.common_member()}</th>
              <th class="hidden px-2 py-2 text-left text-sm font-medium text-gray-700 sm:table-cell sm:px-4">{m.common_section()}</th>
              <th class="px-2 py-2 text-left text-sm font-medium text-gray-700 sm:px-4">{m.events_rsvp()}</th>
              <th class="px-2 py-2 text-left text-sm font-medium text-gray-700 sm:px-4">{m.events_attendance()}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {#each getSortedParticipation() as member}
              <tr>
                <td class="px-2 py-2 text-sm sm:px-4">
                  <div>
                    {member.memberName}
                    <div class="text-xs text-gray-500 sm:hidden">
                      {member.primarySection?.abbreviation || ""}
                    </div>
                  </div>
                </td>
                <td class="hidden px-2 py-2 text-sm sm:table-cell sm:px-4">
                  {member.primarySection?.abbreviation || "-"}
                </td>
                <td class="px-2 py-2 text-sm sm:px-4">
                  {#if member.plannedStatus}
                    <span class="capitalize">{member.plannedStatus}</span>
                  {:else}
                    <span class="text-gray-400">{m.participation_no_response()}</span>
                  {/if}
                </td>
                <td class="px-2 py-2 sm:px-4">
                  <StatusButtons
                    options={attendanceOptions}
                    current={member.actualStatus}
                    disabled={recordingAttendance[member.memberId]}
                    size="sm"
                    onselect={(v) => updateAttendance(member.memberId, v as ActualStatus)}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</Card>
