import type { FieldCandidate, PixelRect } from './field-types';

interface InkComponent { rect: PixelRect; pixels: number }

export function detectWritingGuideCandidates(data: ArrayLike<number>, width: number, height: number): FieldCandidate[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width * height > 12_000_000 || data.length !== width * height) throw new Error('INVALID_BINARY_FRAME');
  const scale = Math.max(0.5, width / 1200);
  const visited = new Uint8Array(data.length);
  const components: InkComponent[] = [];
  for (let position = 0; position < data.length; position++) {
    if (!data[position] || visited[position]) continue;
    const pending = [position];
    visited[position] = 1;
    let left = width, top = height, right = 0, bottom = 0, pixels = 0;
    while (pending.length) {
      const current = pending.pop()!;
      const horizontal = current % width, vertical = Math.floor(current / width);
      left = Math.min(left, horizontal); right = Math.max(right, horizontal);
      top = Math.min(top, vertical); bottom = Math.max(bottom, vertical); pixels++;
      for (const [deltaX, deltaY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = horizontal + deltaX, nextY = vertical + deltaY;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (data[next] && !visited[next]) { visited[next] = 1; pending.push(next); }
      }
    }
    components.push({ rect: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, pixels });
  }
  const textHeights = components.filter(component => component.rect.height >= 8 * scale && component.rect.height <= 48 * scale
    && component.rect.width >= 2 * scale && component.rect.width <= 40 * scale).map(component => component.rect.height).sort((first, second) => first - second);
  const lineHeight = textHeights[Math.floor(textHeights.length / 2)] ?? Math.max(12, Math.round(20 * scale));
  const dots = components.filter(component => component.rect.width <= 7 * scale && component.rect.height <= 7 * scale
    && component.rect.width / component.rect.height >= 0.4 && component.rect.width / component.rect.height <= 2.5);
  const rows: InkComponent[][] = [];
  for (const dot of dots.sort((first, second) => first.rect.y - second.rect.y || first.rect.x - second.rect.x)) {
    const row = rows.find(existing => Math.abs(existing[0].rect.y + existing[0].rect.height - dot.rect.y - dot.rect.height) <= 2 * scale);
    if (row) row.push(dot); else rows.push([dot]);
  }
  const guides: { rect: PixelRect; style: 'dotted' | 'underline'; short?: boolean }[] = [];
  for (const row of rows) {
    let sequence: InkComponent[] = [];
    const finish = () => {
      if (sequence.length < 3) return;
      const intervals = sequence.slice(1).map((component, index) => component.rect.x - sequence[index].rect.x);
      const mean = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
      const deviation = Math.sqrt(intervals.reduce((total, interval) => total + (interval - mean) ** 2, 0) / intervals.length);
      if (sequence.length < 5 && (mean < 6 * scale || mean > 12 * scale || deviation / mean > 0.2)) {
        if (sequence.length !== 4) return;
        const triples = [sequence.slice(0, 3), sequence.slice(1)];
        sequence = triples.find(triple => {
          const firstGap = triple[1].rect.x - triple[0].rect.x;
          const secondGap = triple[2].rect.x - triple[1].rect.x;
          const average = (firstGap + secondGap) / 2;
          return average >= 6 * scale && average <= 12 * scale
            && Math.abs(firstGap - secondGap) / (2 * average) <= 0.2;
        }) ?? [];
        if (!sequence.length) return;
      }
      const first = sequence[0].rect, last = sequence.at(-1)!.rect;
      const span = last.x + last.width - first.x;
      const shortGuide = sequence.length < 8;
      const medianInterval = [...intervals].sort((left, right) => left - right)[Math.floor(intervals.length / 2)];
      const wideIntervals = intervals.filter(interval => interval > medianInterval * 1.45);
      const oneWideGap = sequence.length >= 6 && sequence.length <= 7 && wideIntervals.length === 1
        && wideIntervals[0] <= medianInterval * 1.9
        && intervals.filter(interval => interval <= medianInterval * 1.45)
          .every(interval => Math.abs(interval - medianInterval) <= medianInterval * 0.2);
      if (sequence.length < 5 && span < Math.max(18 * scale, width * 0.014)) return;
      if (shortGuide && sequence.length >= 5 && (span < Math.max(24 * scale, width * 0.018)
        || mean < 4 * scale || mean > Math.max(10, 12 * scale) || deviation / mean > 0.2 && !oneWideGap)) return;
      if (!shortGuide && (span < Math.max(40 * scale, width * 0.035) || deviation / mean > 0.35)) return;
      guides.push({ rect: { x: first.x, y: Math.min(...sequence.map(component => component.rect.y)), width: span,
        height: Math.max(...sequence.map(component => component.rect.y + component.rect.height)) - Math.min(...sequence.map(component => component.rect.y)) },
        style: 'dotted', short: shortGuide });
    };
    for (const dot of row.sort((first, second) => first.rect.x - second.rect.x)) {
      const previous = sequence.at(-1);
      if (previous && dot.rect.x - previous.rect.x - previous.rect.width > 12 * scale) { finish(); sequence = []; }
      sequence.push(dot);
    }
    finish();
  }
  for (const component of components) {
    if (component.rect.width >= Math.max(60 * scale, width * 0.05) && component.rect.height <= Math.max(3, 4 * scale)
      && component.rect.width / component.rect.height >= 20 && component.pixels / (component.rect.width * component.rect.height) >= 0.65) {
      guides.push({ rect: component.rect, style: 'underline' });
    }
  }
  return guides.sort((first, second) => first.rect.y - second.rect.y || first.rect.x - second.rect.x).map((guide, index) => {
    const top = Math.max(0, guide.rect.y + guide.rect.height - lineHeight - Math.ceil(2 * scale));
    const bottom = Math.min(height, guide.rect.y + guide.rect.height + Math.ceil(2 * scale));
    const rect = { x: guide.rect.x, y: top, width: guide.rect.width, height: bottom - top };
    return { candidateId: `guide_${index}`, rect, source: 'writing_guide', guideStyle: guide.style,
      shortGuide: guide.short,
      areaRatio: rect.width * rect.height / (width * height), aspectRatio: rect.width / rect.height,
      contourArea: rect.width * rect.height, rectangularity: 1, parentIndex: -1, childIndex: -1, isContainer: false };
  });
}
