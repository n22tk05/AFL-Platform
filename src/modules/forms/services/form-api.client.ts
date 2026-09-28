'use client';

import type { FormWorkflow } from '@/shared/contracts';
import type { AdminFormSummary } from '@/modules/forms/types/form.types';

export type AdminApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }

  get isConfigurationError() { return this.status === 503 && this.code === 'ADMIN_KEY_UNCONFIGURED'; }
  get isUnauthorized() { return this.status === 401 || this.code === 'UNAUTHORIZED'; }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: unknown };

function errorDetails(error: unknown): { code: string; message: string } {
  if (typeof error === 'string') return { code: error, message: error };
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; message_vi?: unknown };
    const code = typeof value.code === 'string' ? value.code : 'ADMIN_API_ERROR';
    const message = typeof value.message_vi === 'string' ? value.message_vi
      : typeof value.message === 'string' ? value.message : code;
    return { code, message };
  }
  return { code: 'ADMIN_API_ERROR', message: 'The admin API returned an invalid error.' };
}

async function request<T>(path: string, adminKey: string, init: RequestInit = {}, fetcher: AdminApiFetch = fetch): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: { ...init.headers, 'x-admin-key': adminKey, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  let envelope: Envelope<T> | undefined;
  try { envelope = await response.json() as Envelope<T>; } catch { /* classified below */ }
  if (!response.ok || !envelope || envelope.success !== true) {
    const details = errorDetails(envelope && envelope.success === false ? envelope.error : undefined);
    throw new AdminApiError(response.status, details.code, details.message);
  }
  return envelope.data;
}

function endpoint(formCode: string, suffix = '') {
  return `/api/admin/forms/${encodeURIComponent(formCode)}${suffix}`;
}

export function listAdminForms(adminKey: string, fetcher?: AdminApiFetch): Promise<{ forms: AdminFormSummary[] }> {
  return request('/api/admin/forms', adminKey, {}, fetcher);
}

export function readAdminWorkflow(formCode: string, adminKey: string, fetcher?: AdminApiFetch): Promise<FormWorkflow> {
  return request(endpoint(formCode, '/workflow'), adminKey, {}, fetcher);
}

export function saveAdminWorkflow(formCode: string, adminKey: string, workflow: FormWorkflow, fetcher?: AdminApiFetch): Promise<unknown> {
  return request(endpoint(formCode, '/workflow'), adminKey, { method: 'PUT', body: JSON.stringify(workflow) }, fetcher);
}

export function approveAdminWorkflow(
  formCode: string, adminKey: string, input: { performedBy: string; note: string }, fetcher?: AdminApiFetch
): Promise<{ formCode: string; status: string; approvedAt: string }> {
  const performedBy = input.performedBy.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120);
  const note = input.note.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
  return request(endpoint(formCode, '/approve'), adminKey, {
    method: 'POST', body: JSON.stringify({ reviewConfirmed: true, performedBy, note }),
  }, fetcher);
}

export type AdminReviewState = {
  workflow: FormWorkflow | null;
  editor: string;
  dirty: boolean;
  busy: boolean;
  error: unknown | null;
  message: string;
};

export type AdminReviewResult = { stale: true; state: AdminReviewState } | { stale: false; state: AdminReviewState };

/** Framework independent owner for one route/key review lifecycle. */
export class AdminReviewSession {
  private valid = true;
  private state: AdminReviewState = { workflow: null, editor: '', dirty: false, busy: false, error: null, message: '' };

  constructor(readonly formCode: string, private readonly adminKey: string, private readonly fetcher?: AdminApiFetch) {}

  isBoundTo(formCode: string, adminKey: string): boolean { return this.formCode === formCode && this.adminKey === adminKey && this.valid; }
  snapshot(): AdminReviewState { return { ...this.state }; }
  invalidate(): void { this.valid = false; }
  setEditor(editor: string): AdminReviewState {
    if (this.valid) this.state = { ...this.state, editor, dirty: this.state.workflow !== null && editor !== JSON.stringify(this.state.workflow, null, 2), error: null, message: '' };
    return this.snapshot();
  }

  async load(): Promise<AdminReviewResult> {
    if (!this.valid) return this.result(true);
    this.state = { ...this.state, busy: true, error: null, message: '', workflow: null, editor: '', dirty: false };
    try {
      const workflow = await readAdminWorkflow(this.formCode, this.adminKey, this.fetcher);
      if (!this.valid) return this.result(true);
      if (workflow.formCode !== this.formCode) throw new Error('Workflow response formCode does not match this review session.');
      this.state = { ...this.state, workflow, editor: JSON.stringify(workflow, null, 2), dirty: false };
    } catch (error) {
      if (!this.valid) return this.result(true);
      this.state = { ...this.state, error };
    } finally {
      if (this.valid) this.state = { ...this.state, busy: false };
    }
    return this.result(false);
  }

  async save(): Promise<AdminReviewResult> {
    if (!this.valid) return this.result(true);
    const baseline = this.state.workflow;
    if (!baseline || !this.editable() || this.state.busy || !this.state.dirty) return this.result(false);
    this.state = { ...this.state, busy: true, error: null, message: '' };
    try {
      const value = JSON.parse(this.state.editor) as FormWorkflow;
      if (value.formCode !== baseline.formCode || value.formCode !== this.formCode) throw new Error('formCode cannot be changed.');
      if (value.status !== baseline.status || String(value.status).toUpperCase() === 'ACTIVE') throw new Error('status is managed by the server and cannot be edited.');
      await saveAdminWorkflow(this.formCode, this.adminKey, value, this.fetcher);
      if (!this.valid) return this.result(true);
      const saved = await readAdminWorkflow(this.formCode, this.adminKey, this.fetcher);
      if (!this.valid) return this.result(true);
      if (saved.formCode !== this.formCode) throw new Error('Workflow response formCode does not match this review session.');
      this.state = { ...this.state, workflow: saved, editor: JSON.stringify(saved, null, 2), dirty: false, message: 'Saved successfully.' };
    } catch (error) {
      if (!this.valid) return this.result(true);
      this.state = { ...this.state, error };
    } finally {
      if (this.valid) this.state = { ...this.state, busy: false };
    }
    return this.result(false);
  }

  async approve(input: { performedBy: string; note: string }): Promise<AdminReviewResult> {
    if (!this.valid) return this.result(true);
    if (!this.state.workflow || !this.editable() || this.state.busy || this.state.dirty) return this.result(false);
    const workflow = this.state.workflow;
    this.state = { ...this.state, busy: true, error: null, message: '' };
    try {
      const result = await approveAdminWorkflow(this.formCode, this.adminKey, input, this.fetcher);
      if (!this.valid) return this.result(true);
      if (String(result.status).toUpperCase() !== 'ACTIVE' || result.formCode !== this.formCode) throw new Error('Approval response did not confirm ACTIVE status.');
      const updated = { ...workflow, status: 'ACTIVE' } as FormWorkflow;
      this.state = { ...this.state, workflow: updated, editor: JSON.stringify(updated, null, 2), dirty: false, message: 'Workflow approved and ACTIVE.' };
    } catch (error) {
      if (!this.valid) return this.result(true);
      this.state = { ...this.state, error };
    } finally {
      if (this.valid) this.state = { ...this.state, busy: false };
    }
    return this.result(false);
  }

  private editable(): boolean {
    const status = String(this.state.workflow?.status ?? '').toUpperCase();
    return !!this.state.workflow && status !== 'ACTIVE' && ['DRAFT', 'PENDING_REVIEW'].includes(status);
  }
  private result(stale: boolean): AdminReviewResult { return { stale, state: this.snapshot() }; }
}

export function createAdminReviewSession(formCode: string, adminKey: string, fetcher?: AdminApiFetch): AdminReviewSession {
  return new AdminReviewSession(formCode, adminKey, fetcher);
}
