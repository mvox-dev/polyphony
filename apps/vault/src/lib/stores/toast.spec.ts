// Tests for toast store
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { toast, TOAST_DURATION_SUCCESS, TOAST_DURATION_ERROR } from "./toast";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("adding toasts", () => {
    it("adds a success toast", () => {
      toast.success("Success message");
      const toasts = get(toast);
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Success message");
      expect(toasts[0].type).toBe("success");
    });

    it("adds an error toast", () => {
      toast.error("Error message");
      const toasts = get(toast);
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Error message");
      expect(toasts[0].type).toBe("error");
    });

    it("adds an info toast", () => {
      toast.info("Info message");
      const toasts = get(toast);
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("Info message");
      expect(toasts[0].type).toBe("info");
    });

    it("stacks multiple toasts", () => {
      toast.success("First");
      toast.error("Second");
      toast.info("Third");
      const toasts = get(toast);
      expect(toasts).toHaveLength(3);
    });

    it("assigns unique IDs", () => {
      toast.success("First");
      toast.success("Second");
      const toasts = get(toast);
      expect(toasts[0].id).not.toBe(toasts[1].id);
    });
  });

  describe("auto-dismiss", () => {
    it("auto-dismisses success toast after default duration", () => {
      toast.success("Success");
      expect(get(toast)).toHaveLength(1);

      vi.advanceTimersByTime(TOAST_DURATION_SUCCESS - 1);
      expect(get(toast)).toHaveLength(1);

      vi.advanceTimersByTime(2);
      expect(get(toast)).toHaveLength(0);
    });

    it("auto-dismisses error toast after longer duration", () => {
      toast.error("Error");
      expect(get(toast)).toHaveLength(1);

      vi.advanceTimersByTime(TOAST_DURATION_SUCCESS);
      expect(get(toast)).toHaveLength(1); // Still there

      vi.advanceTimersByTime(TOAST_DURATION_ERROR - TOAST_DURATION_SUCCESS + 1);
      expect(get(toast)).toHaveLength(0);
    });

    it("respects custom duration", () => {
      toast.success("Quick", 1000);
      expect(get(toast)).toHaveLength(1);

      vi.advanceTimersByTime(1001);
      expect(get(toast)).toHaveLength(0);
    });
  });

  describe("manual dismiss", () => {
    it("dismisses a specific toast by ID", () => {
      const id1 = toast.success("First");
      const id2 = toast.success("Second");
      expect(get(toast)).toHaveLength(2);

      toast.dismiss(id1);
      const remaining = get(toast);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(id2);
    });

    it("handles dismissing non-existent ID gracefully", () => {
      toast.success("Test");
      toast.dismiss(99999);
      expect(get(toast)).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("removes all toasts", () => {
      toast.success("First");
      toast.error("Second");
      toast.info("Third");
      expect(get(toast)).toHaveLength(3);

      toast.clear();
      expect(get(toast)).toHaveLength(0);
    });
  });
});

describe("toast constants", () => {
  it("has correct duration values", () => {
    expect(TOAST_DURATION_SUCCESS).toBe(3000);
    expect(TOAST_DURATION_ERROR).toBe(5000);
  });
});
