import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: { fileName: string } }) {
  const { fileName } = context.params;
  if (!/^[a-f0-9]{64}\.mp3$/.test(fileName)) return new Response(null, { status: 404 });

  let audio: Buffer;
  try {
    audio = await readFile(path.join(process.cwd(), 'public', 'audio', fileName));
  } catch {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'audio/mpeg',
  });
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${audio.length}` } });

    const suffixLength = match[1] ? null : Number(match[2]);
    const start = match[1] ? Number(match[1]) : Math.max(0, audio.length - (suffixLength || 0));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), audio.length - 1) : audio.length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= audio.length || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${audio.length}` } });
    }

    const partial = audio.subarray(start, end + 1);
    headers.set('Content-Length', String(partial.length));
    headers.set('Content-Range', `bytes ${start}-${end}/${audio.length}`);
    return new Response(new Uint8Array(partial), { status: 206, headers });
  }

  headers.set('Content-Length', String(audio.length));
  return new Response(new Uint8Array(audio), { status: 200, headers });
}
