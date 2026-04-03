import { describe, it, expect } from "vitest";
import { shouldHeaderStick } from "./sticky-header";

describe("shouldHeaderStick", () => {
  const THRESHOLD = 100;

  it("sticks when grid extends well below the header", () => {
    // gridBottom is far below the threshold (lots of content below header)
    expect(shouldHeaderStick(1200, THRESHOLD)).toBe(true);
  });

  it("sticks when grid bottom is in the middle of the viewport", () => {
    expect(shouldHeaderStick(500, THRESHOLD)).toBe(true);
  });

  it("sticks when grid bottom is just above the threshold", () => {
    // gridBottom is 101px from viewport top — still sticky
    expect(shouldHeaderStick(101, THRESHOLD)).toBe(true);
  });

  it("unsticks at exactly the threshold boundary", () => {
    // gridBottom equals threshold — last row has reached the header
    expect(shouldHeaderStick(100, THRESHOLD)).toBe(false);
  });

  it("unsticks when grid bottom is above the threshold", () => {
    // gridBottom is 50px from viewport top — header should scroll away
    expect(shouldHeaderStick(50, THRESHOLD)).toBe(false);
  });

  it("unsticks when grid is scrolled completely off-screen above", () => {
    // gridBottom is negative (scrolled above viewport)
    expect(shouldHeaderStick(-200, THRESHOLD)).toBe(false);
  });

  it("works with different threshold values", () => {
    expect(shouldHeaderStick(60, 50)).toBe(true);
    expect(shouldHeaderStick(50, 50)).toBe(false);
  });
});
