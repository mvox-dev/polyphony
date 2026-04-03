// @vitest-environment happy-dom
/**
 * Component tests for SortableList
 *
 * These tests render the component in a DOM environment to catch:
 * - SSR compatibility issues (like the $$renderer.push bug)
 * - Rendering errors with snippets
 * - Basic interaction functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import SortableListTestWrapper from "./SortableListTestWrapper.svelte";

describe("SortableList", () => {
  const mockItems = [
    { id: "1", name: "First Item" },
    { id: "2", name: "Second Item" },
    { id: "3", name: "Third Item" },
  ];

  let onReorder: ReturnType<typeof vi.fn<(itemIds: string[]) => void>>;

  beforeEach(() => {
    onReorder = vi.fn<(itemIds: string[]) => void>();
  });

  afterEach(() => {
    cleanup();
  });

  describe("rendering", () => {
    it("renders without crashing (SSR compatibility)", () => {
      // This test catches the $$renderer.push SSR bug
      // The component should render without throwing
      expect(() => {
        render(SortableListTestWrapper, {
          props: {
            items: mockItems,
            onReorder,
          },
        });
      }).not.toThrow();
    });

    it("renders all items", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      expect(screen.getByText("First Item")).toBeTruthy();
      expect(screen.getByText("Second Item")).toBeTruthy();
      expect(screen.getByText("Third Item")).toBeTruthy();
    });

    it("renders with empty items array", () => {
      expect(() => {
        render(SortableListTestWrapper, {
          props: {
            items: [],
            onReorder,
          },
        });
      }).not.toThrow();
    });

    it("shows drag handles by default", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      // Should have move up/down buttons for each item
      const moveUpButtons = screen.getAllByTitle("Move up");
      const moveDownButtons = screen.getAllByTitle("Move down");
      const dragHandles = screen.getAllByTitle("Drag to reorder");

      expect(moveUpButtons).toHaveLength(3);
      expect(moveDownButtons).toHaveLength(3);
      expect(dragHandles).toHaveLength(3);
    });

    it("hides drag handles when showHandle is false", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
          showHandle: false,
        },
      });

      expect(screen.queryByTitle("Move up")).toBeNull();
      expect(screen.queryByTitle("Move down")).toBeNull();
      expect(screen.queryByTitle("Drag to reorder")).toBeNull();
    });

    it("hides drag handles when disabled", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
          disabled: true,
        },
      });

      expect(screen.queryByTitle("Move up")).toBeNull();
      expect(screen.queryByTitle("Move down")).toBeNull();
      expect(screen.queryByTitle("Drag to reorder")).toBeNull();
    });
  });

  describe("button interactions", () => {
    it("disables move up for first item", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      const moveUpButtons = screen.getAllByTitle("Move up");
      expect(moveUpButtons[0]).toHaveProperty("disabled", true);
      expect(moveUpButtons[1]).toHaveProperty("disabled", false);
      expect(moveUpButtons[2]).toHaveProperty("disabled", false);
    });

    it("disables move down for last item", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      const moveDownButtons = screen.getAllByTitle("Move down");
      expect(moveDownButtons[0]).toHaveProperty("disabled", false);
      expect(moveDownButtons[1]).toHaveProperty("disabled", false);
      expect(moveDownButtons[2]).toHaveProperty("disabled", true);
    });

    it("calls onReorder when move up is clicked", async () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      const moveUpButtons = screen.getAllByTitle("Move up");
      // Click move up on second item (index 1)
      await fireEvent.click(moveUpButtons[1]);

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith(["2", "1", "3"]);
    });

    it("calls onReorder when move down is clicked", async () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      const moveDownButtons = screen.getAllByTitle("Move down");
      // Click move down on first item (index 0)
      await fireEvent.click(moveDownButtons[0]);

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith(["2", "1", "3"]);
    });
  });

  describe("accessibility", () => {
    it("has listitem role on each item", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      const listItems = screen.getAllByRole("listitem");
      expect(listItems).toHaveLength(3);
    });

    it("has aria-labels on control buttons", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      expect(screen.getAllByLabelText("Move up")).toHaveLength(3);
      expect(screen.getAllByLabelText("Move down")).toHaveLength(3);
      expect(screen.getAllByLabelText("Drag handle")).toHaveLength(3);
    });
  });

  describe("item rendering", () => {
    it("passes item data and index to snippet", () => {
      render(SortableListTestWrapper, {
        props: {
          items: mockItems,
          onReorder,
        },
      });

      // Check that items are rendered with correct data-testid
      expect(screen.getByTestId("item-1")).toBeTruthy();
      expect(screen.getByTestId("item-2")).toBeTruthy();
      expect(screen.getByTestId("item-3")).toBeTruthy();

      // Check that indices are rendered
      expect(screen.getByText("0")).toBeTruthy();
      expect(screen.getByText("1")).toBeTruthy();
      expect(screen.getByText("2")).toBeTruthy();
    });
  });
});
