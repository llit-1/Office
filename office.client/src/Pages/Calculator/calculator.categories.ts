import type { CalculatorSlug } from "./calculator.types";

export interface CalculatorCategory {
  slug: CalculatorSlug;
  title: string;
  image: string;
  /** Заголовок задания справа. */
  task: string;
  /** Подпись кнопки блокировки и раздела заблокированных. */
  lockAction: string;
  lockedTitle: string;
  /** Группировка задания: по режиму печи или по времени дефроста. */
  groupBy: "mode" | "defrost";
}

export const CALCULATOR_CATEGORIES: CalculatorCategory[] = [
  { slug: "bread", title: "Хлеб", image: "/img/breads.svg", task: "Задание на выпечку", lockAction: "Не печём сегодня", lockedTitle: "Сегодня не печём", groupBy: "mode" },
  { slug: "bakery", title: "Выпечка", image: "/img/bread.svg", task: "Задание на выпечку", lockAction: "Не печём сегодня", lockedTitle: "Сегодня не печём", groupBy: "mode" },
  { slug: "confectionery", title: "Кондитерские изделия", image: "/img/cake.svg", task: "Достать из морозильника", lockAction: "Не достаём сегодня", lockedTitle: "Сегодня не достаём", groupBy: "defrost" },
  { slug: "sandwiches", title: "Сэндвичи", image: "/img/sandwich.svg", task: "Задание на сборку", lockAction: "Не собираем сегодня", lockedTitle: "Сегодня не собираем", groupBy: "mode" },
  { slug: "other", title: "Прочий ассортимент", image: "/img/other-food.png", task: "Задание", lockAction: "Не готовим сегодня", lockedTitle: "Сегодня не готовим", groupBy: "defrost" },
];

export const findCategory = (slug: string | undefined) =>
  CALCULATOR_CATEGORIES.find((category) => category.slug === slug?.toLowerCase());
