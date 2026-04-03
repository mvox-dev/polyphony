import { describe, it, expect } from "vitest";
import {
  canEditCell,
  type CanEditCellParams,
} from "./participation-permissions";

// Use dates far enough in the future/past to avoid flaky tests
const pastDate = "2020-01-01T10:00:00Z";
const futureDate = "2099-12-31T10:00:00Z";

const ME = "member-me";
const OTHER = "member-other";

function makeParams(overrides: Partial<CanEditCellParams>): CanEditCellParams {
  return {
    memberId: ME,
    eventDate: futureDate,
    type: "rsvp",
    currentMemberId: ME,
    canManageParticipation: false,
    trustIndividualResponsibility: false,
    ...overrides,
  };
}

describe("canEditCell", () => {
  describe("RSVP - future events", () => {
    it("allows own future RSVP (always)", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: futureDate,
            memberId: ME,
          }),
        ),
      ).toBe(true);
    });

    it("denies editing another member future RSVP (regular member)", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: futureDate,
            memberId: OTHER,
          }),
        ),
      ).toBe(false);
    });

    it("allows manager to edit another member future RSVP", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: futureDate,
            memberId: OTHER,
            canManageParticipation: true,
          }),
        ),
      ).toBe(true);
    });
  });

  describe("RSVP - past events", () => {
    it("denies own past RSVP when trust is disabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: pastDate,
            memberId: ME,
            trustIndividualResponsibility: false,
          }),
        ),
      ).toBe(false);
    });

    it("allows own past RSVP when trust is enabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: pastDate,
            memberId: ME,
            trustIndividualResponsibility: true,
          }),
        ),
      ).toBe(true);
    });

    it("denies editing another member past RSVP even with trust enabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: pastDate,
            memberId: OTHER,
            trustIndividualResponsibility: true,
          }),
        ),
      ).toBe(false);
    });

    it("allows manager to edit another member past RSVP", () => {
      expect(
        canEditCell(
          makeParams({
            type: "rsvp",
            eventDate: pastDate,
            memberId: OTHER,
            canManageParticipation: true,
          }),
        ),
      ).toBe(true);
    });
  });

  describe("Attendance - past events", () => {
    it("denies own attendance when trust is disabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: pastDate,
            memberId: ME,
            trustIndividualResponsibility: false,
          }),
        ),
      ).toBe(false);
    });

    it("allows own attendance when trust is enabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: pastDate,
            memberId: ME,
            trustIndividualResponsibility: true,
          }),
        ),
      ).toBe(true);
    });

    it("denies editing another member attendance even with trust enabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: pastDate,
            memberId: OTHER,
            trustIndividualResponsibility: true,
          }),
        ),
      ).toBe(false);
    });

    it("allows manager to edit any member attendance", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: pastDate,
            memberId: OTHER,
            canManageParticipation: true,
          }),
        ),
      ).toBe(true);
    });
  });

  describe("Attendance - future events", () => {
    it("denies attendance for future events (even manager)", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: futureDate,
            canManageParticipation: true,
          }),
        ),
      ).toBe(false);
    });

    it("denies attendance for future events with trust enabled", () => {
      expect(
        canEditCell(
          makeParams({
            type: "attendance",
            eventDate: futureDate,
            trustIndividualResponsibility: true,
          }),
        ),
      ).toBe(false);
    });
  });
});
