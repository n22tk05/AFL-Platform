'use client';
import { useMemo, useState } from 'react';
import type { DocumentJsonExport, ExportBox, GroundedNode } from '@/shared/document-export.types';
import { validateJsonExport } from '@/modules/documents/json-validator';
import { safeJsonFilename } from '@/modules/documents/json-download';
const button = 'min-h-14 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 font-bold disabled:opacity-40';
export function JsonReview({ draft, filename, disabled = false, onSelect }: { draft: DocumentJsonExport; filename: string; disabled?: boolean; onSelect?: (box: ExportBox | null) => void }) {
  const [content, setContent] = useState(draft), [tab, setTab] = useState<'tree' | 'raw' | 'ocr'>('tree');
  const [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState('');
  const validation = useMemo(() => validateJsonExport(content), [content]);
  const serialized = useMemo(() => JSON.stringify(content, null, 2), [content]);
  function select(node: GroundedNode) {
    const box = content.blocks.find(b => node.sourceBlockIds.includes(b.id) && b.bbox)?.bbox ?? null;
    onSelect?.(box); setNotice(box ? 'Đã chọn vùng nguồn.' : 'Nguồn này không có bbox. Hãy đối chiếu toàn trang.');
  }
  function editField(id: string, value: string) {
    setConfirmed(false);
    setContent(prev => ({ ...prev, structure: { ...prev.structure, fields: prev.structure.fields.map(f => f.id === id ? {
      ...f, normalizedValue: value === '' ? null : value, status: 'needs_review', reviewReasons: [...new Set([...f.reviewReasons, 'USER_EDIT'])],
    } : f) } }));
  }
  function confirmField(id: string) {
    setConfirmed(false);
    setContent(prev => ({ ...prev, structure: { ...prev.structure, fields: prev.structure.fields.map(f => f.id === id ? {
      ...f, status: 'confirmed', reviewReasons: [...new Set([...f.reviewReasons, 'USER_CONFIRMED'])],
    } : f) } }));
  }
  const nodeView = (node: GroundedNode) => <li key={node.id} className="my-2 break-words">
    <button className={button + ' text-left w-full'} onClick={() => select(node)}>{node.type} · {node.text || '(dòng trống)'}</button>
    <small>Trang {node.page ?? 'không xác định'} · nguồn {[...node.sourceLineIds, ...node.sourceBlockIds].join(', ')} · {node.status}</small>
  </li>;
  return <section aria-label="Duyệt JSON" className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100">
    <h2 className="text-xl font-bold">2. Đối chiếu và duyệt JSON</h2>
    <p>Trạng thái xử lý: {content.status}. Phân loại theo text cần đối chiếu ảnh; chưa đo độ chính xác OCR.</p>
    <p>Nguồn OCR được giữ nguyên. Sửa giá trị sử dụng không thay đổi chữ gốc. JSON này không tự lưu vào phiên hướng dẫn.</p>
    <details><summary className="cursor-pointer min-h-14">Warnings ({content.warnings.length})</summary><ul>{content.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul></details>
    {!validation.valid && <p role="alert">{validation.issues.join(', ')}</p>}
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={() => setTab('tree')} aria-pressed={tab === 'tree'}>Cấu trúc</button>
      <button className={button} onClick={() => setTab('raw')} aria-pressed={tab === 'raw'}>JSON raw</button>
      <button className={button} onClick={() => setTab('ocr')} aria-pressed={tab === 'ocr'}>Raw OCR</button>
    </div>
    {tab === 'raw' && <pre data-testid="json-raw" className="max-h-[650px] overflow-auto whitespace-pre-wrap break-all text-sm">{serialized}</pre>}
    {tab === 'ocr' && <div><pre data-testid="raw-ocr" className="whitespace-pre-wrap break-words">{content.rawText}</pre>
      {content.review.attempts.map(a => <details key={a.attempt}><summary>Lần {a.attempt}: {a.variant} · {a.errorCode ?? a.provider}</summary><pre className="whitespace-pre-wrap break-words">{a.rawText ?? 'Không có kết quả OCR'}</pre></details>)}
    </div>}
    {tab === 'tree' && <div data-testid="json-preview" className="max-h-[650px] overflow-auto space-y-4">
      {content.structure.sections.map(s => <details open key={s.id}><summary>{content.nodes.find(n => n.id === s.headingNodeId)?.text}</summary><ul>{content.nodes.filter(n => s.nodeIds.includes(n.id) || n.id === s.headingNodeId).map(nodeView)}</ul></details>)}
      <details open><summary>Tất cả dòng và vùng nguồn ({content.nodes.length})</summary><ul>{content.nodes.map(nodeView)}</ul></details>
      <details open><summary>Unknown / chưa phân loại ({content.structure.unclassified.length})</summary><ul>{content.nodes.filter(n => content.structure.unclassified.includes(n.id)).map(nodeView)}</ul></details>
      {content.structure.fields.map(f => <article className="border border-slate-600 rounded-xl p-4 space-y-2" key={f.id}>
        <button className={button} onClick={() => { const n = content.nodes.find(n => n.id === f.nodeId); if(n) select(n); }}>{f.label} — xem nguồn</button>
        <p>Giá trị gốc: {f.rawValue === null ? '(chưa có giá trị)' : f.rawValue} · {f.valueState} · {f.status}</p>
        <label className="block">Giá trị sử dụng: {f.label}<input className="block w-full bg-slate-800 p-3 min-h-14 border border-slate-500" value={f.normalizedValue ?? ''} onChange={e => editField(f.id,e.target.value)} /></label>
        <button className={button} onClick={() => confirmField(f.id)}>Xác nhận {f.label}</button>
      </article>)}
      {content.structure.checkboxes.map(c => <article key={c.id}><p>{c.label}: {c.state} · {c.evidence.method} · chưa xác minh hình học</p>
        <label>Trạng thái {c.label}<select className="bg-slate-800 p-3" value={c.state} onChange={e => { const state = e.target.value as typeof c.state; setConfirmed(false); setContent(prev => ({ ...prev, structure: { ...prev.structure, checkboxes: prev.structure.checkboxes.map(item => item.id === c.id ? { ...item, state, status: 'confirmed', reviewReasons: [...item.reviewReasons, 'USER_CONFIRMED'] } : item) } })); }}>
          <option value="unknown">Chưa rõ</option><option value="checked">Có dấu tích</option><option value="unchecked">Không tích</option>
        </select></label></article>)}
      {content.structure.tables.map(table => <details open key={table.id}><summary>Bảng nguồn trang {table.page} · cần kiểm tra</summary><table><tbody>{table.rows.map((row,i) => <tr key={i}>{row.map(cell => <td key={cell.columnIndex} rowSpan={cell.rowSpan} colSpan={cell.columnSpan} className="border border-slate-500 p-2">{cell.rawValue}</td>)}</tr>)}</tbody></table></details>)}
    </div>}
    <label className="flex gap-3"><input type="checkbox" checked={confirmed} disabled={disabled || !validation.valid || content.status === 'failed'} onChange={e => setConfirmed(e.target.checked)} />Tôi đã đối chiếu nội dung JSON với ảnh nguồn trước khi tải.</label>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled || !validation.valid} onClick={async () => { try { await navigator.clipboard.writeText(serialized); setNotice('Đã sao chép JSON.'); } catch { setNotice('Không thể sao chép tự động. Dùng tab JSON raw.'); } }}>Copy JSON</button>
      <button className={button} disabled={disabled || !confirmed || !validation.valid || content.status === 'failed'} onClick={() => {
        const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = safeJsonFilename(filename); link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Đã tải JSON đã đối chiếu.');
      }}>Tải .json</button>
    </div><p role="status">{notice}</p>
  </section>;
}
