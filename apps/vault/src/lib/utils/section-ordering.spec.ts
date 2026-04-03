import { describe, it, expect } from "vitest";
import { groupBySection, sortBySection } from "./section-ordering";

interface TestMember {
  name: string;
  section: { name: string; displayOrder?: number } | null;
}

const getSection = (m: TestMember) => m.section;
const getName = (m: TestMember) => m.name;

describe("groupBySection", () => {
  it("groups items by section name", () => {
    const members: TestMember[] = [
      { name: "Alice", section: { name: "Soprano", displayOrder: 10 } },
      { name: "Bob", section: { name: "Bass", displayOrder: 40 } },
      { name: "Carol", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = groupBySection(members, getSection);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe("Soprano");
    expect(result[0][1]).toHaveLength(2);
    expect(result[1][0]).toBe("Bass");
    expect(result[1][1]).toHaveLength(1);
  });

  it("sorts groups by displayOrder, not alphabetically", () => {
    const members: TestMember[] = [
      { name: "Alice", section: { name: "Tenor", displayOrder: 30 } },
      { name: "Bob", section: { name: "Alto", displayOrder: 20 } },
      { name: "Carol", section: { name: "Soprano", displayOrder: 10 } },
      { name: "Dave", section: { name: "Bass", displayOrder: 40 } },
    ];
    const result = groupBySection(members, getSection);
    expect(result.map(([name]) => name)).toEqual([
      "Soprano",
      "Alto",
      "Tenor",
      "Bass",
    ]);
  });

  it("puts members without section at the end", () => {
    const members: TestMember[] = [
      { name: "Alice", section: null },
      { name: "Bob", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = groupBySection(members, getSection);
    expect(result[0][0]).toBe("Soprano");
    expect(result[1][0]).toBe("No section");
  });

  it("handles empty input", () => {
    expect(groupBySection([], getSection)).toEqual([]);
  });

  it("handles missing displayOrder by treating as 999", () => {
    const members: TestMember[] = [
      { name: "Alice", section: { name: "Unknown" } },
      { name: "Bob", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = groupBySection(members, getSection);
    expect(result[0][0]).toBe("Soprano");
    expect(result[1][0]).toBe("Unknown");
  });
});

describe("sortBySection", () => {
  it("sorts by displayOrder then by name", () => {
    const members: TestMember[] = [
      { name: "Carol", section: { name: "Soprano", displayOrder: 10 } },
      { name: "Alice", section: { name: "Soprano", displayOrder: 10 } },
      { name: "Bob", section: { name: "Bass", displayOrder: 40 } },
    ];
    const result = sortBySection(members, getSection, getName);
    expect(result.map((m) => m.name)).toEqual(["Alice", "Carol", "Bob"]);
  });

  it("sorts by displayOrder, not alphabetical section name", () => {
    const members: TestMember[] = [
      { name: "A", section: { name: "Tenor", displayOrder: 30 } },
      { name: "B", section: { name: "Alto", displayOrder: 20 } },
      { name: "C", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = sortBySection(members, getSection, getName);
    expect(result.map((m) => m.name)).toEqual(["C", "B", "A"]);
  });

  it("puts members without section at the end", () => {
    const members: TestMember[] = [
      { name: "Alice", section: null },
      { name: "Bob", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = sortBySection(members, getSection, getName);
    expect(result.map((m) => m.name)).toEqual(["Bob", "Alice"]);
  });

  it("does not mutate the original array", () => {
    const members: TestMember[] = [
      { name: "Bob", section: { name: "Bass", displayOrder: 40 } },
      { name: "Alice", section: { name: "Soprano", displayOrder: 10 } },
    ];
    const result = sortBySection(members, getSection, getName);
    expect(result[0].name).toBe("Alice");
    expect(members[0].name).toBe("Bob");
  });

  it("handles empty input", () => {
    expect(sortBySection([], getSection, getName)).toEqual([]);
  });
});
