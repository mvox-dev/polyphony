// Edition storage unit tests - Critical: Tests chunking algorithm
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  uploadEditionFile,
  getEditionFile,
  deleteEditionFile,
  CHUNK_SIZE,
  MAX_CHUNKED_FILE_SIZE,
  SINGLE_ROW_THRESHOLD,
} from "./edition-storage";

// Helper to create a mock File
function createMockFile(
  size: number,
  name = "test.pdf",
  type = "application/pdf",
): File {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  // Fill with predictable pattern for verification
  for (let i = 0; i < size; i++) {
    view[i] = i % 256;
  }
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

// Helper to verify ArrayBuffer content matches pattern
function verifyPattern(buffer: ArrayBuffer, expectedSize: number): boolean {
  const view = new Uint8Array(buffer);
  if (view.length !== expectedSize) return false;
  for (let i = 0; i < expectedSize; i++) {
    if (view[i] !== i % 256) return false;
  }
  return true;
}

// Mock D1Database for upload tests
function createMockDbForUpload() {
  const storedData: {
    files: Map<
      string,
      {
        data: ArrayBuffer | null;
        size: number;
        name: string;
        isChunked: boolean;
        chunkCount: number | null;
      }
    >;
    chunks: Map<string, { index: number; data: ArrayBuffer; size: number }[]>;
  } = {
    files: new Map(),
    chunks: new Map(),
  };

  const createStatement = (sql: string) => {
    const statement = {
      _sql: sql,
      _boundValues: [] as unknown[],
      bind: function (...args: unknown[]) {
        this._boundValues = args;
        return this;
      },
      run: async function () {
        // Capture INSERT for edition_files (small file: 6 params with data)
        if (
          this._sql.includes("INSERT INTO edition_files") &&
          this._sql.includes("0, NULL")
        ) {
          // Small file: editionId, data, size, name, 0, NULL
          const [editionId, data, size, name] = this._boundValues;
          storedData.files.set(editionId as string, {
            data: data as ArrayBuffer | null,
            size: size as number,
            name: name as string,
            isChunked: false,
            chunkCount: null,
          });
        }
        // Capture INSERT for edition_files (chunked file: 4 params, NULL in SQL)
        if (
          this._sql.includes("INSERT INTO edition_files") &&
          this._sql.includes("NULL, ?, ?, 1, ?")
        ) {
          // Large file: editionId, size, name, chunkCount (data is NULL in SQL)
          const [editionId, size, name, chunkCount] = this._boundValues;
          storedData.files.set(editionId as string, {
            data: null,
            size: size as number,
            name: name as string,
            isChunked: true,
            chunkCount: chunkCount as number,
          });
        }
        // Capture INSERT for edition_chunks
        if (this._sql.includes("INSERT INTO edition_chunks")) {
          const [editionId, chunkIndex, data, size] = this._boundValues;
          const chunks = storedData.chunks.get(editionId as string) ?? [];
          chunks.push({
            index: chunkIndex as number,
            data: data as ArrayBuffer,
            size: size as number,
          });
          storedData.chunks.set(editionId as string, chunks);
        }
        // Capture DELETE
        if (this._sql.includes("DELETE FROM edition_files")) {
          const [editionId] = this._boundValues;
          const existed = storedData.files.has(editionId as string);
          storedData.files.delete(editionId as string);
          storedData.chunks.delete(editionId as string);
          return { meta: { changes: existed ? 1 : 0 } };
        }
        return { meta: { changes: 1 } };
      },
      first: async function () {
        if (
          this._sql.includes("SELECT") &&
          this._sql.includes("edition_files")
        ) {
          const [editionId] = this._boundValues;
          const file = storedData.files.get(editionId as string);
          if (!file) return null;
          return {
            edition_id: editionId,
            data: file.data,
            size: file.size,
            original_name: file.name,
            uploaded_at: new Date().toISOString(),
            is_chunked: file.isChunked ? 1 : 0,
            chunk_count: file.chunkCount,
          };
        }
        return null;
      },
      all: async function () {
        if (
          this._sql.includes("SELECT") &&
          this._sql.includes("edition_chunks")
        ) {
          const [editionId] = this._boundValues;
          const chunks = storedData.chunks.get(editionId as string) ?? [];
          return {
            results: chunks
              .sort((a, b) => a.index - b.index)
              .map((c) => ({
                chunk_index: c.index,
                data: c.data,
                size: c.size,
              })),
          };
        }
        return { results: [] };
      },
    };
    return statement;
  };

  const mockPrepare = vi.fn((sql: string) => createStatement(sql));

  return {
    prepare: mockPrepare,
    batch: vi.fn(async (statements: ReturnType<typeof createStatement>[]) => {
      for (const stmt of statements) {
        await stmt.run();
      }
    }),
    _storedData: storedData,
  } as unknown as D1Database & { _storedData: typeof storedData };
}

describe("Edition Storage", () => {
  describe("Constants", () => {
    it("CHUNK_SIZE is ~1.9MB", () => {
      expect(CHUNK_SIZE).toBeCloseTo(1.9 * 1024 * 1024, -3);
    });

    it("MAX_CHUNKED_FILE_SIZE is 5 chunks (~9.5MB)", () => {
      expect(MAX_CHUNKED_FILE_SIZE).toBe(5 * CHUNK_SIZE);
    });

    it("SINGLE_ROW_THRESHOLD is 2MB", () => {
      expect(SINGLE_ROW_THRESHOLD).toBe(2 * 1024 * 1024);
    });
  });

  describe("uploadEditionFile", () => {
    let db: ReturnType<typeof createMockDbForUpload>;

    beforeEach(() => {
      db = createMockDbForUpload();
    });

    it("rejects non-PDF files", async () => {
      const file = createMockFile(1024, "test.txt", "text/plain");

      await expect(uploadEditionFile(db, "edition-1", file)).rejects.toThrow(
        "Only PDF files are allowed",
      );
    });

    it("rejects files over 9.5MB limit", async () => {
      const oversizedFile = createMockFile(MAX_CHUNKED_FILE_SIZE + 1);

      await expect(
        uploadEditionFile(db, "edition-1", oversizedFile),
      ).rejects.toThrow("File size exceeds 9.5MB limit");
    });

    it("stores small file (under 2MB) in single row", async () => {
      const smallFile = createMockFile(1 * 1024 * 1024); // 1MB

      const result = await uploadEditionFile(db, "edition-1", smallFile);

      expect(result.isChunked).toBe(false);
      expect(result.chunkCount).toBeUndefined();
      expect(result.size).toBe(1 * 1024 * 1024);
      expect(result.originalName).toBe("test.pdf");

      // Verify stored data
      const stored = db._storedData.files.get("edition-1");
      expect(stored).toBeDefined();
      expect(stored?.isChunked).toBe(false);
      expect(stored?.data).toBeDefined();
    });

    it("stores 2MB file as chunked", async () => {
      const file = createMockFile(2 * 1024 * 1024); // Exactly 2MB

      const result = await uploadEditionFile(db, "edition-2", file);

      // 2MB = SINGLE_ROW_THRESHOLD, should still be single row
      expect(result.isChunked).toBe(false);
    });

    it("stores file just over 2MB as chunked", async () => {
      const file = createMockFile(SINGLE_ROW_THRESHOLD + 1); // 2MB + 1 byte

      const result = await uploadEditionFile(db, "edition-3", file);

      expect(result.isChunked).toBe(true);
      expect(result.chunkCount).toBe(2); // ~2MB splits into 2 chunks of ~1.9MB each
    });

    it("calculates correct chunk count for 5MB file", async () => {
      const file = createMockFile(5 * 1024 * 1024); // 5MB

      const result = await uploadEditionFile(db, "edition-4", file);

      expect(result.isChunked).toBe(true);
      // 5MB / 1.9MB ≈ 2.6, so 3 chunks
      expect(result.chunkCount).toBe(3);
    });

    it("calculates correct chunk count for maximum size file", async () => {
      const file = createMockFile(Math.floor(MAX_CHUNKED_FILE_SIZE)); // ~9.5MB

      const result = await uploadEditionFile(db, "edition-5", file);

      expect(result.isChunked).toBe(true);
      expect(result.chunkCount).toBe(5); // Maximum 5 chunks
    });

    it("stores chunks with correct data", async () => {
      const file = createMockFile(3 * 1024 * 1024); // 3MB

      await uploadEditionFile(db, "edition-6", file);

      const chunks = db._storedData.chunks.get("edition-6");
      expect(chunks).toBeDefined();
      expect(chunks?.length).toBe(2); // 3MB / 1.9MB = 2 chunks

      // First chunk should be full CHUNK_SIZE
      expect(chunks?.[0].size).toBe(Math.floor(CHUNK_SIZE));

      // Total of all chunks should equal file size
      const totalChunkSize = chunks?.reduce((sum, c) => sum + c.size, 0) ?? 0;
      expect(totalChunkSize).toBe(3 * 1024 * 1024);
    });
  });

  describe("getEditionFile", () => {
    let db: ReturnType<typeof createMockDbForUpload>;

    beforeEach(() => {
      db = createMockDbForUpload();
    });

    it("returns null for non-existent file", async () => {
      const result = await getEditionFile(db, "non-existent");

      expect(result).toBeNull();
    });

    it("retrieves small file from single row", async () => {
      const file = createMockFile(1 * 1024 * 1024); // 1MB
      await uploadEditionFile(db, "edition-1", file);

      const retrieved = await getEditionFile(db, "edition-1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.size).toBe(1 * 1024 * 1024);
      expect(retrieved?.originalName).toBe("test.pdf");
      expect(retrieved?.data).toBeInstanceOf(ArrayBuffer);
      expect(retrieved?.data.byteLength).toBe(1 * 1024 * 1024);
    });

    it("reassembles chunked file correctly", async () => {
      const file = createMockFile(3 * 1024 * 1024); // 3MB
      await uploadEditionFile(db, "edition-2", file);

      const retrieved = await getEditionFile(db, "edition-2");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.size).toBe(3 * 1024 * 1024);
      expect(retrieved?.data).toBeInstanceOf(ArrayBuffer);
      expect(retrieved?.data.byteLength).toBe(3 * 1024 * 1024);
    });

    it("preserves exact bytes after chunking and reassembly", async () => {
      const originalSize = 3 * 1024 * 1024; // 3MB
      const file = createMockFile(originalSize);
      await uploadEditionFile(db, "edition-3", file);

      const retrieved = await getEditionFile(db, "edition-3");

      expect(retrieved).not.toBeNull();
      expect(verifyPattern(retrieved!.data, originalSize)).toBe(true);
    });

    it("preserves exact bytes for maximum size file", async () => {
      const originalSize = Math.floor(MAX_CHUNKED_FILE_SIZE) - 1; // Just under 9.5MB
      const file = createMockFile(originalSize);
      await uploadEditionFile(db, "edition-4", file);

      const retrieved = await getEditionFile(db, "edition-4");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.data.byteLength).toBe(originalSize);
      expect(verifyPattern(retrieved!.data, originalSize)).toBe(true);
    });
  });

  describe("deleteEditionFile", () => {
    let db: ReturnType<typeof createMockDbForUpload>;

    beforeEach(() => {
      db = createMockDbForUpload();
    });

    it("returns true when file deleted", async () => {
      const file = createMockFile(1024);
      await uploadEditionFile(db, "edition-1", file);

      const result = await deleteEditionFile(db, "edition-1");

      expect(result).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      const result = await deleteEditionFile(db, "non-existent");

      expect(result).toBe(false);
    });

    it("removes file from storage", async () => {
      const file = createMockFile(1024);
      await uploadEditionFile(db, "edition-1", file);

      await deleteEditionFile(db, "edition-1");

      const retrieved = await getEditionFile(db, "edition-1");
      expect(retrieved).toBeNull();
    });
  });

  describe("D1 BLOB data format handling", () => {
    it("handles ArrayBuffer format from D1", async () => {
      const db = createMockDbForUpload();
      const file = createMockFile(1024);
      await uploadEditionFile(db, "edition-1", file);

      // D1 may return ArrayBuffer directly
      const retrieved = await getEditionFile(db, "edition-1");
      expect(retrieved?.data).toBeInstanceOf(ArrayBuffer);
    });

    it("handles number[] format from D1", async () => {
      // Create a mock that returns number[] instead of ArrayBuffer
      const mockFirst = vi.fn().mockResolvedValue({
        edition_id: "edition-1",
        data: [0, 1, 2, 3, 4], // D1 sometimes returns BLOB as number[]
        size: 5,
        original_name: "test.pdf",
        uploaded_at: new Date().toISOString(),
        is_chunked: 0,
        chunk_count: null,
      });

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: mockFirst,
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as unknown as D1Database;

      const retrieved = await getEditionFile(db, "edition-1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.data).toBeInstanceOf(ArrayBuffer);
      expect(retrieved?.data.byteLength).toBe(5);

      // Verify content
      const view = new Uint8Array(retrieved!.data);
      expect(Array.from(view)).toEqual([0, 1, 2, 3, 4]);
    });

    it("handles number[] format in chunks", async () => {
      // Create a mock for chunked file with number[] data
      const mockFirst = vi.fn().mockResolvedValue({
        edition_id: "edition-1",
        data: null, // Chunked files have null data
        size: 10,
        original_name: "test.pdf",
        uploaded_at: new Date().toISOString(),
        is_chunked: 1,
        chunk_count: 2,
      });

      const mockAll = vi.fn().mockResolvedValue({
        results: [
          { chunk_index: 0, data: [0, 1, 2, 3, 4], size: 5 },
          { chunk_index: 1, data: [5, 6, 7, 8, 9], size: 5 },
        ],
      });

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: mockFirst,
          all: mockAll,
        }),
      } as unknown as D1Database;

      const retrieved = await getEditionFile(db, "edition-1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.data.byteLength).toBe(10);

      // Verify reassembled content
      const view = new Uint8Array(retrieved!.data);
      expect(Array.from(view)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe("Chunk boundary edge cases", () => {
    let db: ReturnType<typeof createMockDbForUpload>;

    beforeEach(() => {
      db = createMockDbForUpload();
    });

    it("handles file exactly at chunk boundary", async () => {
      const exactSize = Math.floor(CHUNK_SIZE * 2); // Exactly 2 chunks
      const file = createMockFile(exactSize);

      const result = await uploadEditionFile(db, "edition-1", file);

      expect(result.isChunked).toBe(true);
      expect(result.chunkCount).toBe(2);

      const chunks = db._storedData.chunks.get("edition-1");
      expect(chunks?.length).toBe(2);
      expect(chunks?.[0].size).toBe(Math.floor(CHUNK_SIZE));
      expect(chunks?.[1].size).toBe(Math.floor(CHUNK_SIZE));
    });

    it("handles file one byte over SINGLE_ROW_THRESHOLD", async () => {
      const size = SINGLE_ROW_THRESHOLD + 1; // Just over 2MB = chunked
      const file = createMockFile(size);

      const result = await uploadEditionFile(db, "edition-2", file);

      expect(result.isChunked).toBe(true);
      expect(result.chunkCount).toBe(2); // ~2MB splits into 2 chunks

      const chunks = db._storedData.chunks.get("edition-2");
      expect(chunks?.length).toBe(2);
    });

    it("handles file one byte under threshold", async () => {
      const size = SINGLE_ROW_THRESHOLD; // Exactly at threshold = single row
      const file = createMockFile(size);

      const result = await uploadEditionFile(db, "edition-3", file);

      expect(result.isChunked).toBe(false);
    });
  });
});
