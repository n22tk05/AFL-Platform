import type { FormWorkflow } from '@/shared/contracts';
import { APP_CONFIG, MOCK_WORKFLOW_REGISTRY } from '@/config/app.config';
import { canonicalFormCode, fetchWorkflow, prepareWorkflowFixture, type WorkflowFetch } from '../client';
import { listLocalWorkflows, readLocalWorkflow } from './local-workflow-store';
import { capturedFormSession } from '../citizen-session';

type CitizenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
export interface CitizenFormOption { id: string; formCode: string; formTitle: string; source: 'live' | 'local' | 'demo' }
export interface CitizenWorkflow { workflow: FormWorkflow; source: CitizenFormOption['source'] }
const active = (workflow: { status?: string }) => workflow.status?.toUpperCase() === 'ACTIVE';
const abortIfNeeded = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };

export function resolveCitizenFormCode(formCode: string | null, templateId: string | null, storage?: CitizenStorage): string | null {
  if (formCode?.trim()) return canonicalFormCode(formCode);
  if (!templateId) return capturedFormSession.selectedFormCode();
  const fixture = MOCK_WORKFLOW_REGISTRY[templateId];
  if (fixture) return canonicalFormCode(fixture.formCode);
  const local = storage ? readLocalWorkflow(storage, templateId, { publishedOnly: true }) : null;
  return local ? canonicalFormCode(local.formCode) : null;
}

export async function loadCitizenWorkflow(formCode: string, options: {
  templateId?: string | null; storage?: CitizenStorage; fetcher?: WorkflowFetch; signal?: AbortSignal; allowDemo?: boolean;
} = {}): Promise<CitizenWorkflow> {
  abortIfNeeded(options.signal);
  const code = canonicalFormCode(formCode);
  let live: FormWorkflow | undefined;
  try {
    live = await fetchWorkflow(code, { fetcher: (input, init) => (options.fetcher ?? fetch)(input, { ...init, signal: options.signal, cache: 'no-store' }) });
  } catch { abortIfNeeded(options.signal); }
  abortIfNeeded(options.signal);
  if (live) {
    if (!active(live)) throw new Error('WORKFLOW_NOT_PUBLISHED');
    return { workflow: live, source: 'live' };
  }
  const local = options.storage ? listLocalWorkflows(options.storage, { publishedOnly: true })
    .find(workflow => canonicalFormCode(workflow.formCode) === code) : undefined;
  if (local) {
    const prepared = prepareWorkflowFixture(local, code);
    if (prepared && active(prepared)) return { workflow: prepared, source: 'local' };
  }
  if (options.allowDemo ?? APP_CONFIG.useMockData) {
    const fixture = Object.values(MOCK_WORKFLOW_REGISTRY).find(workflow => canonicalFormCode(workflow.formCode) === code);
    const prepared = fixture && prepareWorkflowFixture(fixture, code);
    if (prepared) return { workflow: prepared, source: 'demo' };
  }
  throw new Error('WORKFLOW_UNAVAILABLE');
}

export async function listCitizenForms(options: {
  storage?: CitizenStorage; fetcher?: WorkflowFetch; signal?: AbortSignal; allowDemo?: boolean;
} = {}): Promise<{ forms: CitizenFormOption[]; offline: boolean }> {
  const byCode = new Map<string, CitizenFormOption>();
  let offline = false;
  try {
    const response = await (options.fetcher ?? fetch)('/api/forms', { signal: options.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('FORMS_UNAVAILABLE');
    const envelope = await response.json();
    if (envelope?.success !== true || !Array.isArray(envelope.data?.forms)) throw new Error('INVALID_FORMS');
    for (const form of envelope.data.forms) {
      if (!form || !active(form) || typeof form.formCode !== 'string' || !form.formCode.trim()
        || typeof form.formTitle !== 'string' || !form.formTitle.trim()) continue;
      const code = canonicalFormCode(form.formCode);
      byCode.set(code, { id: String(form.formId ?? form.templateId ?? code), formCode: code, formTitle: form.formTitle, source: 'live' });
    }
  } catch { abortIfNeeded(options.signal); offline = true; }
  abortIfNeeded(options.signal);
  for (const workflow of options.storage ? listLocalWorkflows(options.storage, { publishedOnly: true }) : []) {
    const code = canonicalFormCode(workflow.formCode);
    if (!byCode.has(code)) byCode.set(code, { id: workflow.templateId ?? code, formCode: code, formTitle: workflow.formTitle, source: 'local' });
  }
  if (offline && (options.allowDemo ?? APP_CONFIG.useMockData)) for (const [id, workflow] of Object.entries(MOCK_WORKFLOW_REGISTRY)) {
    const code = canonicalFormCode(workflow.formCode);
    if (!byCode.has(code)) byCode.set(code, { id, formCode: code, formTitle: workflow.formTitle, source: 'demo' });
  }
  return { forms: Array.from(byCode.values()), offline };
}
