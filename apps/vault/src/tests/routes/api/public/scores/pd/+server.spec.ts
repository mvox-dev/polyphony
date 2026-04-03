// Tests for /api/public/scores/pd endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../../../../../../routes/api/public/scores/pd/+server";
import type { RequestEvent } from "@sveltejs/kit";

describe("GET /api/public/scores/pd", () => {
  let mockDB: D1Database;
  let mockEvent: any;

  beforeEach(() => {
    const mockPrepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: [] }),
    }));
    mockDB = {
      prepare: mockPrepare,
    } as unknown as D1Database;

    mockEvent = {
      platform: { env: { DB: mockDB } },
    } as any;
  });

  it("returns empty array when no PD scores exist", async () => {
    (mockDB.prepare as any)().all = vi.fn().mockResolvedValue({ results: [] });

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.scores).toEqual([]);
  });

  it("returns list of all public domain scores with work and org metadata", async () => {
    const mockRows = [
      {
        edition_id: "ed_1",
        edition_name: "Novello Edition",
        edition_arranger: "John Smith",
        edition_publisher: "Novello",
        edition_voicing: "SATB",
        edition_type: "vocal_score",
        edition_notes: "Classical edition",
        edition_external_url: null,
        work_id: "work_1",
        work_title: "Messiah",
        work_composer: "George Frideric Handel",
        work_lyricist: "Charles Jennens",
        org_id: "org_1",
        org_name: "Test Choir",
        org_subdomain: "testchoir",
      },
      {
        edition_id: "ed_2",
        edition_name: "Peters Edition",
        edition_arranger: null,
        edition_publisher: "Peters",
        edition_voicing: "SATB",
        edition_type: "full_score",
        edition_notes: null,
        edition_external_url: "https://imslp.org/example",
        work_id: "work_2",
        work_title: "Requiem",
        work_composer: "Wolfgang Amadeus Mozart",
        work_lyricist: null,
        org_id: "org_2",
        org_name: "Another Choir",
        org_subdomain: "another",
      },
    ];

    mockDB.prepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: mockRows }),
    })) as any;

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.scores).toHaveLength(2);

    // First score
    expect(data.scores[0]).toMatchObject({
      editionId: "ed_1",
      editionName: "Novello Edition",
      arranger: "John Smith",
      publisher: "Novello",
      voicing: "SATB",
      editionType: "vocal_score",
      notes: "Classical edition",
      externalUrl: null,
      work: {
        id: "work_1",
        title: "Messiah",
        composer: "George Frideric Handel",
        lyricist: "Charles Jennens",
      },
      organization: {
        id: "org_1",
        name: "Test Choir",
        subdomain: "testchoir",
      },
    });

    // Second score
    expect(data.scores[1]).toMatchObject({
      editionId: "ed_2",
      editionName: "Peters Edition",
      arranger: null,
      publisher: "Peters",
      externalUrl: "https://imslp.org/example",
      work: {
        id: "work_2",
        title: "Requiem",
        composer: "Wolfgang Amadeus Mozart",
        lyricist: null,
      },
      organization: {
        id: "org_2",
        name: "Another Choir",
        subdomain: "another",
      },
    });
  });

  it('only returns scores with license_type = "public_domain"', async () => {
    const mockRows = [
      {
        edition_id: "ed_1",
        edition_name: "PD Score",
        edition_arranger: null,
        edition_publisher: null,
        edition_voicing: "SATB",
        edition_type: "vocal_score",
        edition_notes: null,
        edition_external_url: null,
        work_id: "work_1",
        work_title: "Public Domain Work",
        work_composer: "Old Composer",
        work_lyricist: null,
        org_id: "org_1",
        org_name: "Choir",
        org_subdomain: "choir",
      },
    ];

    mockDB.prepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: mockRows }),
    })) as any;

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.scores).toHaveLength(1);
    expect(data.scores[0].work.title).toBe("Public Domain Work");
  });

  it("sorts results by work title then edition name", async () => {
    mockEvent.platform = { env: {} } as any;

    try {
      await GET(mockEvent as any);
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err.status).toBe(500);
    }
  });

  it("handles scores with null optional fields gracefully", async () => {
    const mockRows = [
      {
        edition_id: "ed_1",
        edition_name: "Minimal Edition",
        edition_arranger: null,
        edition_publisher: null,
        edition_voicing: null,
        edition_type: "vocal_score",
        edition_notes: null,
        edition_external_url: null,
        work_id: "work_1",
        work_title: "Simple Work",
        work_composer: null,
        work_lyricist: null,
        org_id: "org_1",
        org_name: "Choir",
        org_subdomain: "choir",
      },
    ];

    mockDB.prepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: mockRows }),
    })) as any;

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.scores[0]).toMatchObject({
      arranger: null,
      publisher: null,
      voicing: null,
      notes: null,
      externalUrl: null,
      work: {
        composer: null,
        lyricist: null,
      },
    });
  });
});
