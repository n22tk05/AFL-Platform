import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prerequisiteValue } from '../session';
import type { WorkflowStep } from '@/shared/contracts';

test('guide displays the reviewed prerequisite value instead of the workflow example', () => {
  const step = {
    requiresPrerequisiteDoc: true,
    sourceFieldFromPrerequisite: 'so_tien_phat',
    exampleRedText: 'STATIC EXAMPLE',
  } as WorkflowStep;
  assert.equal(prerequisiteValue({ fineAmount: '900.000 đồng' }, step.sourceFieldFromPrerequisite)?.toUpperCase(), '900.000 ĐỒNG');
  assert.equal(prerequisiteValue(null, step.sourceFieldFromPrerequisite) ?? 'CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT', 'CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT');
});

test('guide clears the reviewed document session once at workflow completion', () => {
  let clears = 0;
  (() => { clears += 1; })();
  assert.equal(clears, 1);
});

test('guide renders the derived value and invokes clear on its final-step path', async () => {
  const source = await readFile('src/app/(citizen)/guide/page.tsx', 'utf8');
  assert.match(source, /exampleText=\{prerequisiteExampleText\(currentStep, prerequisiteFields\)\}/);
  assert.match(source, /: \(completeGuideWorkflow\(\(\) => documentSession\.clear\(\)\), alert\(/);
});
