/** PostgREST devolve no máximo 1000 linhas por request. */
export const POSTGREST_PAGE = 1000;

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
