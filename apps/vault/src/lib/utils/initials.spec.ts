// TDD tests for getInitials helper (Issue #242)
import { describe, it, expect } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it("returns initials from two-word name", () => {
    expect(getInitials("John Smith")).toBe("JS");
  });

  it("returns initials from three-word name", () => {
    expect(getInitials("John Michael Smith")).toBe("JMS");
  });

  it("returns single initial for single name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("handles extra whitespace", () => {
    expect(getInitials("  John   Smith  ")).toBe("JS");
  });

  it("returns uppercase initials", () => {
    expect(getInitials("john smith")).toBe("JS");
  });

  it("handles empty string", () => {
    expect(getInitials("")).toBe("");
  });

  it("handles nickname-style single word", () => {
    expect(getInitials("Miku")).toBe("M");
  });

  it("caps at 3 initials for very long names", () => {
    expect(getInitials("José María López García")).toBe("JML");
  });

  it("handles hyphenated names", () => {
    expect(getInitials("Mary-Jane Watson")).toBe("MW");
  });

  it("handles unicode characters", () => {
    expect(getInitials("Михайло Петренко")).toBe("МП");
  });
});
