export function normalizePrintedText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('vi')
    .replace(/(?:\.{2,}|…+)/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
}

export function extractOcrText(response: unknown): string | undefined {
  const pages = Array.isArray(response) ? response : [response];
  if (!pages.length) return undefined;
  const texts: string[] = [];
  for (const page of pages) {
    if (!page || typeof page !== 'object' || !('data' in page)) return undefined;
    const data = page.data;
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'success'
      || !('rawText' in data) || typeof data.rawText !== 'string') return undefined;
    texts.push(data.rawText);
  }
  return texts.join('\n');
}

function editDistance<Value>(expected: Value[], actual: Value[]): number {
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row++) {
    const current = [row];
    for (let column = 1; column <= actual.length; column++) {
      current.push(Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + Number(expected[row - 1] !== actual[column - 1])));
    }
    previous = current;
  }
  return previous[actual.length];
}

export function scoreOcrText(expectedLines: string[], rawText: string) {
  const expected = normalizePrintedText(expectedLines.join(' '));
  const actual = normalizePrintedText(rawText);
  const expectedCharacters = Array.from(expected);
  const actualCharacters = Array.from(actual);
  const expectedWords = expected ? expected.split(' ') : [];
  const actualWords = actual ? actual.split(' ') : [];
  const characterErrors = editDistance(expectedCharacters, actualCharacters);
  const wordErrors = editDistance(expectedWords, actualWords);
  return {
    expectedCharacters: expectedCharacters.length,
    actualCharacters: actualCharacters.length,
    characterErrors,
    characterErrorRate: characterErrors / Math.max(expectedCharacters.length, 1),
    expectedWords: expectedWords.length,
    actualWords: actualWords.length,
    wordErrors,
    wordErrorRate: wordErrors / Math.max(expectedWords.length, 1),
  };
}
