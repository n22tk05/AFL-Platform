'use client';
import type { OcrReview } from '@/shared/document-extraction.types';
export function OcrAttemptReview({ review, onRegion }: { review?: OcrReview; onRegion: (index: number) => void }) {
  if (!review) return null;
  return <section className="bg-slate-950 border border-slate-700 rounded-2xl p-5 space-y-4" aria-label="Vùng cần kiểm tra">
    <h2 className="font-bold text-xl">Vùng cần kiểm tra</h2>
    <p>Điểm tin cậy cao vẫn có thể sai. Đối chiếu ảnh nguồn; hệ thống giữ nguyên kết quả từng lần đọc.</p>
    {review.documentDetectionFailed && <p>Đã đọc toàn ảnh vì chưa xác định được vùng giấy; ảnh này chưa nắn phối cảnh.</p>}
    {review.regions.map((region, index) => <article className="border border-amber-600 rounded-xl p-3 space-y-2" key={index}>
      <button className="min-h-14 px-4 py-3 rounded-xl bg-amber-950 w-full text-left" onClick={() => onRegion(index)}>
        Vùng cần kiểm tra {index + 1} — {region.status === 'unreadable' ? 'Chưa đọc được vùng này' : 'Cần đối chiếu ảnh nguồn'}
      </button>
      {!region.boundingBox && <p>Chưa đủ tọa độ để khoanh vùng đáng tin cậy; hãy kiểm tra toàn trang.</p>}
      {region.reason.includes('DISAGREEMENT') && <p>Các lần đọc không đồng ý. Hãy sửa hoặc xác nhận; hệ thống không tự chọn số liệu.</p>}
      {region.sources.map((source, i) => <p className="whitespace-pre-wrap break-words" key={i}>Lần {source.attempt}: {source.text || 'Chưa đọc được vùng này'}</p>)}
    </article>)}
    {!review.regions.length && <p>Không phát hiện vùng nghi ngờ bằng các quy tắc hiện tại. Hãy đối chiếu các thông tin quan trọng.</p>}
    <details><summary className="min-h-14 cursor-pointer">Kết quả nguyên bản từng lần đọc</summary>
      {review.attempts.map(attempt => <article className="my-3 space-y-2" key={attempt.attempt}>
        <p>Lần {attempt.attempt} · {attempt.variant} · {attempt.provider} · {attempt.timingMs} ms</p>
        {attempt.errorCode ? <p>Không hoàn tất lần đọc này ({attempt.errorCode}).</p> : <>
          <p>{attempt.raw?.lines.some(l => l.confidence === null) ? 'Provider không cung cấp đủ confidence.' : 'Confidence là điểm provider, không phải độ chính xác đã đo.'}</p>
          <pre className="whitespace-pre-wrap font-sans break-words">{attempt.raw?.fullText || 'Chưa đọc được vùng này'}</pre>
        </>}
      </article>)}
    </details>
    <p>Chụp lại hoặc chọn ảnh khác là lựa chọn bổ sung. Phần đã đọc vẫn ở trên để đối chiếu.</p>
  </section>;
}
