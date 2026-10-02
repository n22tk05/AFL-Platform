'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { validateMarkdown } from '@/modules/documents/markdown-validator';
import { rehypeTableLineBreaks } from '@/modules/documents/markdown-preview';
import type { MarkdownDraft } from '@/modules/documents/markdown.types';

const button = 'rounded-lg border border-slate-600 px-4 py-3 font-semibold disabled:opacity-40';

/** Mount a fresh instance for each draft. No HTML execution or remote image requests. */
export function MarkdownReview({ draft, filename, disabled = false }: { draft: MarkdownDraft; filename: string; disabled?: boolean }) {
  const [content, setContent] = useState(draft.markdown);
  const [reviewed, setReviewed] = useState(false);
  const [tab, setTab] = useState<'preview' | 'edit'>('preview');
  const [notice, setNotice] = useState('');
  const validation = useMemo(() => validateMarkdown(content), [content]);
  const canDownload = reviewed && validation.valid && !disabled;

  function download() {
    if (!canDownload) return;
    const blob = new Blob([validation.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'document'}.md`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Đã tải bản Markdown đã duyệt.');
  }

  return <section aria-label="Duyệt Markdown" className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-5">
    <h2 className="text-xl font-bold">2. Đối chiếu và duyệt Markdown</h2>
    <p>Đối chiếu với ảnh bên cạnh, đặc biệt tên riêng, số liệu, bảng và dấu tiếng Việt. Kiểm tra định dạng không đảm bảo OCR đọc đúng nội dung.</p>
    {draft.confidence !== null && <p className="text-sm text-slate-400">Điểm tin cậy OCR thấp nhất: {(draft.confidence * 100).toFixed(1)}% (không phải tỷ lệ chính xác đã đo).</p>}
    {draft.warnings.map((warning, i) => <p key={i} className="text-amber-200">{warning}</p>)}
    <div aria-live="polite">
      <p className={validation.valid ? 'text-emerald-300' : 'text-amber-200'}>{validation.valid ? 'Kiểm tra Markdown: không có lỗi chặn xuất.' : 'Cần sửa lỗi Markdown trước khi tải.'}</p>
      <ul className="list-disc pl-5">{validation.issues.map((issue, i) => <li key={i} className={issue.severity === 'error' ? 'text-red-300' : 'text-amber-200'}>
        {issue.line ? `Dòng ${issue.line}: ` : ''}{issue.message}
      </li>)}</ul>
    </div>
    <div className="flex gap-3">
      <button className={button} aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Xem trước</button>
      <button className={button} aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Sửa Markdown</button>
    </div>
    {tab === 'edit' ? <label className="block">Nội dung Markdown
      <textarea className="mt-2 min-h-96 w-full rounded-lg border border-slate-600 bg-slate-900 p-4 font-mono text-sm" value={content} spellCheck={false} disabled={disabled}
        onChange={event => { setContent(event.target.value); setReviewed(false); setNotice(''); }} />
    </label> : <div data-testid="markdown-preview" className="max-h-[650px] overflow-auto break-words rounded-lg bg-slate-900 p-4 text-base [&_h1]:my-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-bold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-3 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-600 [&_td]:p-2 [&_th]:border [&_th]:border-slate-600 [&_th]:p-2 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_blockquote]:border-l-4 [&_blockquote]:pl-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeTableLineBreaks]} urlTransform={(url, key) => key === 'src'
        ? (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) ? url : '') : defaultUrlTransform(url)}
        components={{
          a: ({ children }) => <span className="text-sky-300 underline">{children}</span>,
          img: ({ src, alt }) => src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt={alt || 'Ảnh trích xuất'} className="max-w-full" />
            : <span>[Ảnh ngoài không được tải: {alt}]</span>,
        }}>{content}</ReactMarkdown>
    </div>}
    <details><summary className="cursor-pointer py-2">Văn bản OCR nguyên bản để đối chiếu</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-sm">{draft.rawText}</pre></details>
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={reviewed} disabled={!validation.valid || disabled} onChange={event => setReviewed(event.target.checked)} />
      Tôi đã đối chiếu nội dung với ảnh và xác nhận bản Markdown này.
    </label>
    <button className={`${button} bg-sky-800`} disabled={!canDownload} onClick={download}>3. Tải file .md đã duyệt</button>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
