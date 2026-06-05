import React from "react";

interface NormalizedCharMap {
  normalized: string;
  sourceIndexes: number[];
}

const SEPARATOR_REGEX = /[\s\-_/\\.,;:()[\]{}]+/g;

export function normalizeSearchText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(SEPARATOR_REGEX, "");
}

function buildNormalizedCharMap(value: string): NormalizedCharMap {
  const source = value ?? "";
  let normalized = "";
  const sourceIndexes: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const normalizedChar = normalizeSearchText(source[index]);
    if (!normalizedChar) continue;

    normalized += normalizedChar;
    sourceIndexes.push(index);
  }

  return { normalized, sourceIndexes };
}

export function includesNormalized(value: string | number | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(value).includes(normalizedQuery);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatches(text: string | number | null | undefined, query: string): React.ReactNode {
  const sourceText = String(text ?? "");
  const normalizedQuery = normalizeSearchText(query);

  if (!sourceText || !normalizedQuery) return sourceText;

  const { normalized, sourceIndexes } = buildNormalizedCharMap(sourceText);
  if (!normalized) return sourceText;

  const normalizedRanges: Array<{ start: number; end: number }> = [];
  const matcher = new RegExp(escapeRegExp(normalizedQuery), "g");
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(normalized)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length - 1;
    normalizedRanges.push({ start: startIndex, end: endIndex });

    if (match[0].length === 0) {
      matcher.lastIndex += 1;
    }
  }

  if (normalizedRanges.length === 0) return sourceText;

  const sourceRanges = normalizedRanges.map(({ start, end }) => ({
    start: sourceIndexes[start],
    end: sourceIndexes[end],
  }));

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  sourceRanges.forEach((range, index) => {
    if (cursor < range.start) {
      nodes.push(sourceText.slice(cursor, range.start));
    }

    nodes.push(
      <mark key={`${range.start}-${range.end}-${index}`}>
        {sourceText.slice(range.start, range.end + 1)}
      </mark>,
    );

    cursor = range.end + 1;
  });

  if (cursor < sourceText.length) {
    nodes.push(sourceText.slice(cursor));
  }

  return <>{nodes}</>;
}
