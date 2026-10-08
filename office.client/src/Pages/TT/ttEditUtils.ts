export function toInputDate(value: string | null | undefined) {
  return value?.split("T")[0] ?? "";
}

export function toNullableNumber(value: string) {
  return value.trim() ? Number(value.trim().replace(",", ".")) : null;
}

export function validateDate(value: string) {
  return (
    !value ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value >= "1753-01-01" &&
      value <= "9999-12-31") ||
    "Введите дату от 01.01.1753 до 31.12.9999"
  );
}

export function validateCoordinate(value: string, limit: number) {
  if (!value.trim()) return true;
  const number = toNullableNumber(value);
  return (
    (/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim()) &&
      number !== null &&
      Number.isFinite(number) &&
      Math.abs(number) <= limit) ||
    `Введите число от −${limit} до ${limit}`
  );
}

export function validateCode(value: string) {
  return (
    !value.trim() ||
    (/^\d+$/.test(value.trim()) && Number(value) <= 2147483647) ||
    "Введите целый неотрицательный код до 2147483647"
  );
}

export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && /^[78]9/.test(digits)
    ? digits.slice(1)
    : digits;
}

export function formatPhone(value: string) {
  const digits = phoneDigits(value).slice(0, 10);
  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ]
    .filter(Boolean)
    .reduce(
      (text, part, index) =>
        text + (index === 1 ? " " : index > 1 ? "-" : "") + part,
      "",
    );
}
