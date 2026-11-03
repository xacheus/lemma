import type { PaginatedResult } from '../domain/types';

/**
 * Cursor-Based Pagination Engine (Section 14A)
 *
 * - Default page size: 20 records per page (max 100)
 * - Uses opaque cursor ID (`startAfter` item ID) matching Firestore `.startAfter(cursorDoc).limit(20)`
 * - Prevents fetching unbounded collections on list screens
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function parsePageParams(search: URLSearchParams): {
  limit: number;
  cursor: string | null;
} {
  const rawLimit = Number(search.get('limit') || DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(rawLimit)))
    : DEFAULT_PAGE_SIZE;
  const cursor = search.get('cursor')?.trim() || null;
  return { limit, cursor };
}

export function paginateCursor<T extends { id?: string; uid?: string }>(
  items: T[],
  opts: { limit?: number; cursor?: string | null },
): PaginatedResult<T> {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, opts.limit ?? DEFAULT_PAGE_SIZE));
  const getId = (row: T) => row.id ?? row.uid ?? '';

  let startIndex = 0;
  if (opts.cursor) {
    const idx = items.findIndex((item) => getId(item) === opts.cursor);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }

  const slice = items.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < items.length;
  const lastItem = slice[slice.length - 1];

  return {
    items: slice,
    nextCursor: hasMore && lastItem ? getId(lastItem) : null,
    hasMore,
    pageSize,
    totalEstimate: items.length,
  };
}

export function paginateRecords<T>(
  items: T[],
  opts: {
    limit?: number;
    cursor?: string | null;
    getId: (item: T) => string;
  },
): PaginatedResult<T> {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, opts.limit ?? DEFAULT_PAGE_SIZE));
  let startIndex = 0;
  if (opts.cursor) {
    const idx = items.findIndex((item) => opts.getId(item) === opts.cursor);
    if (idx !== -1) startIndex = idx + 1;
  }
  const slice = items.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < items.length;
  const lastItem = slice[slice.length - 1];
  return {
    items: slice,
    nextCursor: hasMore && lastItem ? opts.getId(lastItem) : null,
    hasMore,
    pageSize,
    totalEstimate: items.length,
  };
}
