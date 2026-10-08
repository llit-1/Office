import { useEffect, useMemo, useState } from "react";
import { getDeliveryGroupItems } from "./deliveryMenu.api";
import { getFriendlyErrorMessage } from "../../Services/api";
import type { DeliveryGroup, DeliveryItem } from "./deliveryMenu.types";

export default function useCashMenuSearch(groups: DeliveryGroup[], enabled: boolean) {
  const [items, setItems] = useState<DeliveryItem[]>([]);
  // RK-коды позиций по категориям: одна позиция может быть в нескольких категориях, поэтому без склейки дублей.
  const [rkcodesByGroup, setRkcodesByGroup] = useState<Map<number, number[]>>(new Map());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(groups.filter((group) => group.actual === 1).map((group) => group.id).sort((a, b) => a - b));
  const ids = useMemo(() => JSON.parse(key) as number[], [key]);
  useEffect(() => {
    if (!enabled || loadedKey === key) return;
    let cancelled = false;
    setError("");
    const load = async () => {
      try {
        const result: DeliveryItem[] = [];
        const byGroup = new Map<number, number[]>();
        // Limit parallel requests: group responses include images.
        for (let offset = 0; offset < ids.length; offset += 4) {
          const batchIds = ids.slice(offset, offset + 4);
          const batches = await Promise.all(batchIds.map(async (id) =>
            (await getDeliveryGroupItems(id)).filter((item) => item.actual === 1).map((item) => ({ ...item, yeGroup: id }))));
          if (cancelled) return;
          batches.forEach((batch, index) => byGroup.set(batchIds[index], batch.map((item) => item.rkcode)));
          result.push(...batches.flat());
        }
        if (!cancelled) {
          setItems(Array.from(new Map(result.map((item) => [item.rkcode, item])).values()));
          setRkcodesByGroup(byGroup);
          setLoadedKey(key);
        }
      } catch (reason) {
        if (!cancelled) setError(getFriendlyErrorMessage(reason, "Не удалось загрузить позиции всех категорий."));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [enabled, ids, key, loadedKey, attempt]);
  return { items, rkcodesByGroup, loaded: loadedKey === key, loading: enabled && loadedKey !== key && !error, error,
    retry: () => { setError(""); setAttempt((value) => value + 1); },
    // После изменения позиции (например, декларации) данные всех категорий нужно перечитать.
    reload: () => { setError(""); setLoadedKey(null); } };
}
