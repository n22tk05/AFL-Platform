import assert from 'node:assert/strict';
import { fetchWorkflow, workflowStorageKey } from '@/modules/forms/client';
import type { FormWorkflow } from '@/shared/contracts';
import bundledLptb from '../../../../assets/mock-data/mock-workflow-tpl_01_lptb.json';
import { prepareWorkflowFixture } from '@/modules/forms/client';

const workflow: FormWorkflow = {
  formCode: '01/LPTB', formTitle: 'Live', steps: [{
    stepIndex: 1, boxId: 'box_1', sectionName: 'I', label: 'Name', voiceGuidance: 'Say name',
    audioUrl: '', exampleRedText: 'NAME', highlightCoords: [0, 0, 1, 1], faqs: [],
  }],
};

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function run() {
  assert.equal(workflowStorageKey(' 01/lptb '), workflowStorageKey('01/LPTB'));
  const storage = new MemoryStorage();
  let requests = 0;
  const live = await fetchWorkflow('01/LPTB', {
    storage,
    fetcher: async () => { requests++; return Response.json({ success: true, data: workflow }); },
  });
  assert.equal(requests, 1);
  assert.equal(live.formTitle, 'Live');
  assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), JSON.stringify(workflow));

  const fallback = { ...workflow, formTitle: 'Fixture' };
  const staleCached = { ...workflow, formTitle: 'Cached' };
  storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(staleCached));
  const cached = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  });
  assert.equal(cached.formTitle, 'Cached', 'empty success responses are rejected and cache wins over fixture');

  storage.values.clear();
  const fixture = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  });
  assert.equal(fixture.formTitle, 'Fixture');

  for (const invalidSteps of [
    [{ ...workflow.steps[0], stepIndex: 2 }],
    [{ ...workflow.steps[0] }, { ...workflow.steps[0], stepIndex: 1, boxId: 'box_2' }],
    [{ ...workflow.steps[0] }, { ...workflow.steps[0], stepIndex: 3, boxId: 'box_3' }],
  ]) {
    const preserved = { ...workflow, formTitle: 'Preserved cache' };
    storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(preserved));
    const result = await fetchWorkflow('01/LPTB', {
      storage, fallback,
      fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: invalidSteps } }),
    });
    assert.equal(result.formTitle, 'Preserved cache', 'noncontiguous live steps fall back to the valid cache');
    assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), JSON.stringify(preserved), 'malformed live data does not replace the valid cache');
  }

  storage.values.clear();
  const malformed = { ...workflow, steps: [{ stepIndex: 1, label: 'Missing required contract fields' }] } as unknown as FormWorkflow;
  const malformedFallback = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: malformed }),
  });
  assert.equal(malformedFallback.formTitle, 'Fixture', 'malformed successful envelopes use the bundled fallback');
  assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), null, 'malformed successful envelopes are never cached');

  storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(malformed));
  const malformedCacheFallback = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(malformedCacheFallback.formTitle, 'Fixture', 'malformed cached workflows are rejected');

  const preparedFixture = prepareWorkflowFixture(bundledLptb as unknown as FormWorkflow, 'Mẫu số: 01/LPTB', ['01/LPTB']);
  assert.ok(preparedFixture, 'real LPTB bundled fixture matches its known alias');
  assert.equal(preparedFixture.steps[0].stepIndex, 1, 'fixture copy is converted to one-based indices');
  assert.equal(bundledLptb.steps[0].stepIndex, 0, 'imported fixture remains unchanged');
  assert.equal(prepareWorkflowFixture(bundledLptb as unknown as FormWorkflow, 'OTHER_FORM', ['OTHER_FORM']), null,
    'unrelated forms cannot consume LPTB fixture data');
  const offlineFixture = await fetchWorkflow('Mẫu số: 01/LPTB', {
    fallback: preparedFixture!, fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(offlineFixture.formCode, 'Mẫu số: 01/LPTB');
  assert.equal(offlineFixture.steps[0].stepIndex, 1, 'valid prepared bundled fixture works as offline fallback');

  await assert.rejects(fetchWorkflow('01/LPTB', {
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  }), /WORKFLOW_UNAVAILABLE/);
  console.log('forms client tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
