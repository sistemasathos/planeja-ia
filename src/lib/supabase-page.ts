/** PostgREST devolve no máximo 1000 linhas por request. */
export const POSTGREST_PAGE = 1000;

export async function fetchPage<T>(
  requestPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
  }>,
  page: number,
  pageSize: number,
): Promise<{ rows: T[]; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await requestPage(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? data?.length ?? 0 };
}

export async function fetchAllPages<T>(
  requestPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE) {
    const { data, error } = await requestPage(from, from + POSTGREST_PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE) break;
  }
  return rows;
}
