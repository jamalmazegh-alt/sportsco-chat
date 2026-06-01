/**
 * Tiny assertion helpers used across RLS suites to keep tests readable.
 */
import { expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Assert a SELECT returns the given row IDs (and only those). */
export async function expectSelectIds(
  client: SupabaseClient,
  table: string,
  idColumn: string,
  filter: { column: string; value: unknown },
  expectedIds: string[],
) {
  const { data, error } = await (client.from(table as any).select(idColumn) as any).eq(
    filter.column,
    filter.value,
  );
  expect(error, `select ${table} error: ${error?.message ?? ""}`).toBeNull();
  const ids = (data ?? []).map((r: any) => r[idColumn]).sort();
  expect(ids).toEqual([...expectedIds].sort());
}

/** Assert SELECT returns zero rows for a given row that exists in DB. */
export async function expectNoAccess(
  client: SupabaseClient,
  table: string,
  rowId: string,
  idColumn = "id",
) {
  const { data, error } = await (client.from(table as any).select(idColumn) as any).eq(
    idColumn,
    rowId,
  );
  // RLS hides rows silently; an error here is also acceptable (= blocked).
  if (error) return;
  expect(data ?? []).toHaveLength(0);
}

/** Assert SELECT returns the row (RLS allows it). */
export async function expectCanRead(
  client: SupabaseClient,
  table: string,
  rowId: string,
  idColumn = "id",
) {
  const { data, error } = await (client.from(table as any).select(idColumn) as any).eq(
    idColumn,
    rowId,
  );
  expect(error, `select ${table} error: ${error?.message ?? ""}`).toBeNull();
  expect((data ?? []).length, `expected to read ${table}#${rowId}`).toBeGreaterThan(0);
}

/** Assert INSERT is rejected by RLS (or succeeds and returns the row). */
export async function expectInsertBlocked(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
) {
  const { data, error } = await (client.from(table as any).insert(row) as any).select();
  // RLS rejection => error OR empty result. Either way: no row should be returned.
  const blocked = !!error || !data || (Array.isArray(data) && data.length === 0);
  expect(blocked, `INSERT into ${table} should have been blocked`).toBe(true);
}

export async function expectInsertAllowed(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<any> {
  const { data, error } = await (client.from(table as any).insert(row) as any)
    .select()
    .single();
  expect(error, `INSERT into ${table} failed: ${error?.message ?? ""}`).toBeNull();
  expect(data).toBeTruthy();
  return data;
}

/** Assert UPDATE affects zero rows (silently blocked by RLS USING). */
export async function expectUpdateBlocked(
  client: SupabaseClient,
  table: string,
  rowId: string,
  patch: Record<string, unknown>,
  idColumn = "id",
) {
  const { data, error } = await (client.from(table as any).update(patch) as any)
    .eq(idColumn, rowId)
    .select();
  const blocked = !!error || !data || data.length === 0;
  expect(blocked, `UPDATE on ${table}#${rowId} should have been blocked`).toBe(true);
}

/** Assert DELETE affects zero rows. */
export async function expectDeleteBlocked(
  client: SupabaseClient,
  table: string,
  rowId: string,
) {
  const { data, error } = await (client.from(table as any).delete() as any)
    .eq("id", rowId)
    .select();
  const blocked = !!error || !data || data.length === 0;
  expect(blocked, `DELETE on ${table}#${rowId} should have been blocked`).toBe(true);
}
