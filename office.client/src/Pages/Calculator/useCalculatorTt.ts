import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../Store";
import { setCalculatorTt } from "../../Store/calculatorSlice";
import { useLoader } from "../Orders/useOrdersBase";
import { getCalculatorLocations } from "./calculator.api";

/** Точки пользователя и выбранная из них. Выбор запоминается; пропавшая точка заменяется первой доступной. */
export function useCalculatorTt() {
  const dispatch = useDispatch();
  const saved = useSelector((state: RootState) => state.calculatorData.ttCode);
  const locations = useLoader(getCalculatorLocations);
  const list = locations.data ?? [];
  const current = list.find((location) => location.code === saved) ?? list[0] ?? null;

  useEffect(() => {
    if (current && current.code !== saved) dispatch(setCalculatorTt(current.code));
  }, [current, saved, dispatch]);

  const select = useCallback((code: number) => dispatch(setCalculatorTt(code)), [dispatch]);
  return { locations, current, select };
}
