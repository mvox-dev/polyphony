// D1 chunked storage layer for edition files
// Uses edition_files/edition_chunks tables

// Chunk size: ~1.9MB to stay safely under D1's 2MB limit
export const CHUNK_SIZE = 1.9 * 1024 * 1024;

// Maximum file size for chunked uploads (5 chunks × 1.9MB = 9.5MB)
export const MAX_CHUNKED_FILE_SIZE = 5 * CHUNK_SIZE;

// Files under this size use single-row storage
export const SINGLE_ROW_THRESHOLD = 2 * 1024 * 1024;

export interface EditionUploadResult {
  editionId: string;
  size: number;
  originalName: string;
  isChunked: boolean;
  chunkCount?: number;
}

export interface EditionFile {
  editionId: string;
  data: ArrayBuffer;
  size: number;
  originalName: string;
  uploadedAt: string;
}

// D1 returns BLOB data as number[] (Array.from(ArrayBuffer)), not ArrayBuffer directly
type D1BlobData = number[] | ArrayBuffer;

interface EditionFileRow {
  edition_id: string;
  data: D1BlobData | null;
  size: number;
  original_name: string;
  uploaded_at: string;
  is_chunked: number;
  chunk_count: number | null;
}

interface ChunkRow {
  chunk_index: number;
  data: D1BlobData;
  size: number;
}

/**
 * Convert D1 BLOB data (number[] or ArrayBuffer) to ArrayBuffer
 */
function toArrayBuffer(data: D1BlobData): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  return new Uint8Array(data).buffer;
}

/**
 * Check if a file size requires chunked storage
 */
function isChunkedFile(size: number): boolean {
  return size > SINGLE_ROW_THRESHOLD;
}

/**
 * Upload a PDF file for an edition with automatic chunking for large files
 * @throws Error if file is not a PDF or exceeds 9.5MB
 */
export async function uploadEditionFile(
  db: D1Database,
  editionId: string,
  file: File,
): Promise<EditionUploadResult> {
  // Validate file type
  if (file.type !== "application/pdf") {
    throw new Error("Only PDF files are allowed");
  }

  // Validate file size
  if (file.size > MAX_CHUNKED_FILE_SIZE) {
    throw new Error("File size exceeds 9.5MB limit");
  }

  const arrayBuffer = await file.arrayBuffer();

  // Use single-row storage for small files
  if (!isChunkedFile(file.size)) {
    await db
      .prepare(
        "INSERT INTO edition_files (edition_id, data, size, original_name, is_chunked, chunk_count) VALUES (?, ?, ?, ?, 0, NULL)",
      )
      .bind(editionId, arrayBuffer, file.size, file.name)
      .run();

    return {
      editionId,
      size: file.size,
      originalName: file.name,
      isChunked: false,
    };
  }

  // Split into chunks for large files
  const chunks = splitIntoChunks(arrayBuffer);
  const chunkCount = chunks.length;

  // Insert metadata row (no data, just tracks the file)
  await db
    .prepare(
      "INSERT INTO edition_files (edition_id, data, size, original_name, is_chunked, chunk_count) VALUES (?, NULL, ?, ?, 1, ?)",
    )
    .bind(editionId, file.size, file.name, chunkCount)
    .run();

  // Insert chunks using batch for efficiency
  const chunkStatements = chunks.map((chunk, index) =>
    db
      .prepare(
        "INSERT INTO edition_chunks (edition_id, chunk_index, data, size) VALUES (?, ?, ?, ?)",
      )
      .bind(editionId, index, chunk, chunk.byteLength),
  );

  await db.batch(chunkStatements);

  return {
    editionId,
    size: file.size,
    originalName: file.name,
    isChunked: true,
    chunkCount,
  };
}

/**
 * Get an edition file, reassembling from chunks if necessary
 * Returns null if the file doesn't exist
 */
export async function getEditionFile(
  db: D1Database,
  editionId: string,
): Promise<EditionFile | null> {
  // Get metadata
  const row = await db
    .prepare(
      "SELECT edition_id, data, size, original_name, uploaded_at, is_chunked, chunk_count FROM edition_files WHERE edition_id = ?",
    )
    .bind(editionId)
    .first<EditionFileRow>();

  if (!row) {
    return null;
  }

  // Single-row file
  if (row.is_chunked === 0 && row.data) {
    return {
      editionId: row.edition_id,
      data: toArrayBuffer(row.data),
      size: row.size,
      originalName: row.original_name,
      uploadedAt: row.uploaded_at,
    };
  }

  // Chunked file - fetch and reassemble chunks
  const chunksResult = await db
    .prepare(
      "SELECT chunk_index, data, size FROM edition_chunks WHERE edition_id = ? ORDER BY chunk_index ASC",
    )
    .bind(editionId)
    .all<ChunkRow>();

  if (!chunksResult.results || chunksResult.results.length === 0) {
    // Metadata exists but chunks are missing - data corruption
    console.error(`Chunked edition file ${editionId} has no chunks`);
    return null;
  }

  // Reassemble chunks
  const reassembledData = reassembleChunks(chunksResult.results);

  return {
    editionId: row.edition_id,
    data: reassembledData,
    size: row.size,
    originalName: row.original_name,
    uploadedAt: row.uploaded_at,
  };
}

/**
 * Delete an edition file and its chunks
 * Chunks are deleted automatically via CASCADE
 * Returns true if file was deleted, false if it didn't exist
 */
export async function deleteEditionFile(
  db: D1Database,
  editionId: string,
): Promise<boolean> {
  // CASCADE on edition_chunks handles chunk deletion
  const result = await db
    .prepare("DELETE FROM edition_files WHERE edition_id = ?")
    .bind(editionId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Split an ArrayBuffer into chunks of CHUNK_SIZE
 */
function splitIntoChunks(buffer: ArrayBuffer): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < buffer.byteLength) {
    const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
    chunks.push(buffer.slice(offset, end));
    offset = end;
  }

  return chunks;
}

/**
 * Reassemble chunks into a single ArrayBuffer
 */
function reassembleChunks(chunks: ChunkRow[]): ArrayBuffer {
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    const chunkBuffer = toArrayBuffer(chunk.data);
    const chunkData = new Uint8Array(chunkBuffer);
    result.set(chunkData, offset);
    offset += chunk.size;
  }

  return result.buffer;
}
