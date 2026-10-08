export type BulkResult<T> =
  | { guid: string; ok: true; data: T }
  | { guid: string; ok: false; error: string };

/**
 * Выполняет запрос по каждой точке с ограниченным параллелизмом: yeapi принимает точки по одной,
 * а сотня одновременных запросов упрётся в сервис. Ошибка одной точки не останавливает остальные.
 */
export async function runForLocations<T>(
  guids: string[],
  request: (guid: string) => Promise<T>,
  describeError: (error: unknown) => string,
  onProgress: (results: BulkResult<T>[]) => void,
  concurrency = 4,
): Promise<BulkResult<T>[]> {
  const results: BulkResult<T>[] = [];
  let next = 0;

  const worker = async () => {
    while (next < guids.length) {
      const guid = guids[next++];
      try {
        results.push({ guid, ok: true, data: await request(guid) });
      } catch (error) {
        results.push({ guid, ok: false, error: describeError(error) });
      }
      onProgress([...results]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, guids.length) }, worker));
  return results;
}
