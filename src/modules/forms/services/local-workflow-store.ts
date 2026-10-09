import type { FormWorkflow } from '@/shared/contracts';

export type LocalWorkflowStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const draftPrefix = 'afl_workflow_draft_';
const publishedPrefix = 'afl_workflow_published_';
export const LOCAL_WORKFLOW_EVENT = 'afl:workflow-changed';

/** Template data only. Citizen documents must stay in their separate Session RAM. */
export function normalizeLocalWorkflow(value: unknown, id: string, allowEmpty = true): FormWorkflow | null {
  if (!value || typeof value !== 'object' || !id) return null;
  const w = value as FormWorkflow;
  if ((w.templateId && w.templateId !== id) || typeof w.formCode !== 'string' || !w.formCode.trim()
    || typeof w.formTitle !== 'string' || !w.formTitle.trim() || !Array.isArray(w.steps) || w.steps.length > 200
    || (!allowEmpty && w.steps.length === 0)) return null;
  const status = String(w.status ?? 'DRAFT').toUpperCase();
  if (!['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'ARCHIVED'].includes(status)) return null;
  if (w.pages && (!Array.isArray(w.pages) || w.pages.some(p => !p || !Number.isSafeInteger(p.pageNumber) || p.pageNumber < 1
    || typeof p.imageUrl !== 'string' || !p.imageUrl || p.imageUrl.startsWith('blob:')
    || !Number.isFinite(p.width) || p.width <= 0 || !Number.isFinite(p.height) || p.height <= 0))) return null;
  if (w.steps.some(s => !s || typeof s.boxId !== 'string' || !s.boxId.trim()
    || typeof s.label !== 'string' || !s.label.trim() || typeof s.sectionName !== 'string' || !s.sectionName.trim()
    || typeof s.voiceGuidance !== 'string' || !s.voiceGuidance.trim() || typeof s.audioUrl !== 'string'
    || typeof s.exampleRedText !== 'string' || !Array.isArray(s.highlightCoords) || s.highlightCoords.length !== 4
    || s.highlightCoords.some(v => !Number.isFinite(v) || v < 0 || v > 1)
    || s.highlightCoords[0] >= s.highlightCoords[2] || s.highlightCoords[1] >= s.highlightCoords[3]
    || (s.faqs !== undefined && (!Array.isArray(s.faqs) || s.faqs.some(f => !f || typeof f.question !== 'string' || typeof f.answer !== 'string'))))) return null;
  return { ...w, templateId: id, status: status as FormWorkflow['status'], totalSteps: w.steps.length,
    steps: w.steps.map((s, i) => ({ ...s, stepIndex: i + 1 })), version: Number.isSafeInteger(w.version) && w.version! > 0 ? w.version : 1 };
}

export function readLocalWorkflow(storage: LocalWorkflowStorage, id: string, options: { publishedOnly?: boolean } = {}): FormWorkflow | null {
  for (const prefix of options.publishedOnly ? [publishedPrefix] : [draftPrefix, publishedPrefix]) {
    try {
      const raw = storage.getItem(prefix + id);
      const w = raw ? normalizeLocalWorkflow(JSON.parse(raw), id, !options.publishedOnly) : null;
      if (w && (!options.publishedOnly || w.status === 'ACTIVE')) return w;
    } catch { /* One invalid item must not hide another valid template. */ }
  }
  return null;
}

export function listLocalWorkflows(storage: LocalWorkflowStorage, options: { publishedOnly?: boolean } = {}): FormWorkflow[] {
  const ids = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i) ?? '';
    const prefix = key.startsWith(draftPrefix) ? draftPrefix : key.startsWith(publishedPrefix) ? publishedPrefix : null;
    if (prefix) ids.add(key.slice(prefix.length));
  }
  return Array.from(ids, id => readLocalWorkflow(storage, id, options)).filter((w): w is FormWorkflow => w !== null);
}

function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_WORKFLOW_EVENT)); }

export function saveLocalDraft(storage: LocalWorkflowStorage, workflow: FormWorkflow): FormWorkflow {
  const draft = normalizeLocalWorkflow({ ...workflow, status: 'DRAFT' }, workflow.templateId ?? '');
  if (!draft) throw new Error('Bản nháp chưa hợp lệ hoặc ảnh đang dùng URL tạm.');
  storage.setItem(draftPrefix + draft.templateId, JSON.stringify(draft));
  changed();
  return draft;
}

export function publishLocalWorkflow(storage: LocalWorkflowStorage, workflow: FormWorkflow,
  confirmation: { reviewConfirmed: boolean; blankTemplateConfirmed: boolean }): FormWorkflow {
  if (!confirmation.reviewConfirmed || !confirmation.blankTemplateConfirmed) throw new Error('Cần đối soát và xác nhận phôi trống trước khi áp dụng cục bộ.');
  const checked = normalizeLocalWorkflow(workflow, workflow.templateId ?? '', false);
  if (!checked || checked.steps.some(s => !s.exampleRedText.trim())) throw new Error('Kịch bản chưa đủ bước, nội dung hoặc tọa độ hợp lệ.');
  const previous = readLocalWorkflow(storage, checked.templateId!, { publishedOnly: true });
  const published: FormWorkflow = { ...checked, status: 'ACTIVE', version: previous ? (previous.version ?? 1) + 1 : checked.version,
    publishedAt: new Date().toISOString() };
  storage.setItem(publishedPrefix + published.templateId, JSON.stringify(published));
  storage.removeItem(draftPrefix + published.templateId);
  changed();
  return published;
}
