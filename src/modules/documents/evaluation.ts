import type { StructuredDocumentResult } from '@/shared/document-extraction.types';
import { normalizeField } from './validation';
export interface GroundTruthDocument {
  imagePath: string;
  documentType: string;
  expectedFields: Record<string, string | number | null>;
}
export function evaluateExtractions(rows: { truth: GroundTruthDocument; actual: StructuredDocumentResult }[]) {
  let total = 0, exact = 0, normalized = 0, missing = 0, falseValues = 0, populated = 0, expectedPresent = 0, review = 0, wrongAccepted = 0;
  const byField: Record<string, { total: number; exact: number; normalized: number; missing: number; falseValues: number; needsReview: number; wrongAccepted: number }> = {};
  const norm = (key: string, v: unknown) => typeof v === 'string' ? normalizeField(key, v) ?? v : v;
  for (const { truth, actual } of rows) {
    const keys = new Set([...Object.keys(truth.expectedFields), ...Object.keys(actual.fields)]);
    for (const key of Array.from(keys)) {
      const expected = truth.expectedFields[key] ?? null, field = actual.fields[key], value = field?.value ?? null;
      const stats = byField[key] ??= { total: 0, exact: 0, normalized: 0, missing: 0, falseValues: 0, needsReview: 0, wrongAccepted: 0 };
      total++; stats.total++;
      const same = value === expected, similar = norm(key, value) === norm(key, expected);
      if (same) { exact++; stats.exact++; }
      if (similar) { normalized++; stats.normalized++; }
      if (expected !== null) expectedPresent++;
      if (value !== null) populated++;
      if (expected !== null && value === null) { missing++; stats.missing++; }
      if (value !== null && !similar) { falseValues++; stats.falseValues++; }
      if (field && field.status !== 'accepted') { review++; stats.needsReview++; }
      if (!similar && field?.status === 'accepted') { wrongAccepted++; stats.wrongAccepted++; }
    }
  }
  const rate = (n: number, d: number) => d ? n/d : null;
  return { totalImages: rows.length, evaluatedFields: total, fieldExactMatch: rate(exact,total), normalizedFieldMatch: rate(normalized,total),
    missingFieldRate: rate(missing,expectedPresent), falseValueRate: rate(falseValues,populated), reviewFields: review, wrongAutomaticallyAccepted: wrongAccepted,
    denominators: { expectedPresent, populated },
    byField: Object.fromEntries(Object.entries(byField).map(([key,s])=>[key,{...s,accuracy:rate(s.normalized,s.total)}])) };
}
