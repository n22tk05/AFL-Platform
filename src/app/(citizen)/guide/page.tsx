'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { documentSession, prerequisiteValue } from '@/modules/documents/session';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import type { WorkflowStep, FormWorkflow } from '@/shared/contracts';
import { MOCK_WORKFLOW_REGISTRY } from '@/config/app.config';
import { canonicalFormCode, fetchWorkflow, prepareWorkflowFixture, WorkflowSource } from '@/modules/forms/client';
import { VisualTwin } from '@/components/mobile/VisualTwin';
import { RedTextExample } from '@/components/mobile/RedTextExample';
import { StepHeader } from '@/components/mobile/StepHeader';
import { VoiceAssistantPanel } from '@/components/mobile/VoiceAssistantPanel';

const LIVE_FORM_CODE = 'Mẫu số: 01/LPTB';
function prerequisiteExampleText(step: WorkflowStep, fields: Record<string, string> | null): string {
  if (!step.requiresPrerequisiteDoc) return step.exampleRedText || '';
  return prerequisiteValue(fields, step.sourceFieldFromPrerequisite)?.toUpperCase() ?? 'CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT';
}
function completeGuideWorkflow(clear: () => void): void {
  clear();
}
const aliases: Record<string, { formCode: string; fixtureId: string }> = {
  tpl_01_lptb: { formCode: LIVE_FORM_CODE, fixtureId: 'tpl_01_lptb' },
  '01-lptb': { formCode: LIVE_FORM_CODE, fixtureId: 'tpl_01_lptb' },
  '01/lptb': { formCode: LIVE_FORM_CODE, fixtureId: 'tpl_01_lptb' },
  'mẫu số: 01/lptb': { formCode: LIVE_FORM_CODE, fixtureId: 'tpl_01_lptb' },
  tpl_03_khai_sinh: { formCode: 'KHAI_SINH_LAI', fixtureId: 'tpl_03_khai_sinh' },
  khai_sinh_lai: { formCode: 'KHAI_SINH_LAI', fixtureId: 'tpl_03_khai_sinh' },
};
function resolveForm(alias: string): { formCode: string; fixtureId?: string } {
  const value = alias.trim().toLocaleLowerCase('vi');
  return aliases[value] ?? { formCode: alias.trim() };
}
function fixtureFor(fixtureId: string | undefined, expectedCode: string): FormWorkflow | undefined {
  if (!fixtureId) return undefined;
  const fixture = MOCK_WORKFLOW_REGISTRY[fixtureId];
  if (!fixture) return undefined;
  const acceptedCodes = fixtureId === 'tpl_01_lptb' ? ['01/LPTB', 'Mẫu số: 01/LPTB'] : [fixture.formCode];
  return prepareWorkflowFixture(fixture, expectedCode, acceptedCodes) ?? undefined;
}
function enrichPresentation(live: FormWorkflow, fixture: FormWorkflow): FormWorkflow {
  const lptbAliases = ['01/LPTB', 'Mẫu số: 01/LPTB'].map(canonicalFormCode);
  const sameIdentity = canonicalFormCode(live.formCode) === canonicalFormCode(fixture.formCode) ||
    (lptbAliases.includes(canonicalFormCode(live.formCode)) && lptbAliases.includes(canonicalFormCode(fixture.formCode)));
  if (!sameIdentity) return live;
  const fixtureSteps = new Map(fixture.steps.map(step => [step.boxId, step]));
  return {
    ...live,
    pages: live.pages?.length ? live.pages : fixture.pages,
    totalPages: live.totalPages ?? fixture.totalPages,
    steps: live.steps.map(step => {
      const display = fixtureSteps.get(step.boxId);
      return { ...step, ...(step.pageNumber === undefined && display?.pageNumber ? { pageNumber: display.pageNumber } : {}) };
    }),
  };
}

function GuideContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams?.get('templateId') || 'tpl_01_lptb';
  const { formCode, fixtureId } = resolveForm(templateId);
  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [source, setSource] = useState<WorkflowSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [prerequisiteFields, setPrerequisiteFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    try { window.sessionStorage.removeItem('afl_prerequisite_document_data'); } catch { /* Discard legacy data. */ }
    const refresh = () => setPrerequisiteFields(documentSession.read());
    refresh();
    return documentSession.subscribe(refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setWorkflow(null); setSource(null); setLoadError(null); setCurrentStepIndex(0);
    const fixture = fixtureFor(fixtureId, formCode);
    fetchWorkflow(formCode, {
      storage: window.localStorage,
      fallback: fixture,
      onSource: value => { if (active) setSource(value); },
    }).then(result => {
      if (active) setWorkflow(fixture ? enrichPresentation(result, fixture) : result);
    }).catch(() => {
      if (active) setLoadError('Không tải được hướng dẫn. Vui lòng kiểm tra kết nối rồi thử lại.');
    });
    return () => { active = false; };
  }, [formCode, fixtureId, templateId]);

  if (loadError) return <div role="alert" className="p-6 text-center text-slate-700">{loadError}</div>;
  if (!workflow) return <div role="status" className="p-6 text-center text-slate-600 font-bold">Đang tải hướng dẫn...</div>;
  const steps: WorkflowStep[] = workflow.steps;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex];
  if (!currentStep) return <div role="alert" className="p-6 text-center text-slate-700">Không tìm thấy dữ liệu quy trình biểu mẫu.</div>;
  const currentPageNumber = currentStep.pageNumber || 1;
  const handleNextStep = () => currentStepIndex < totalSteps - 1
    ? setCurrentStepIndex(index => index + 1)
    : (completeGuideWorkflow(() => documentSession.clear()), alert(`Chúc mừng bác đã hoàn thành toàn bộ ${workflow.formTitleVi || workflow.formTitle || 'tờ khai'}!`));

  return <div className="flex flex-col flex-1 pb-24 no-scrollbar">
    {source !== 'live' && <p role="status" className="px-4 pt-2 text-center text-xs font-semibold text-amber-800">
      {source === 'cache' ? 'Đang dùng bản hướng dẫn đã lưu trên thiết bị.' : 'Đang dùng bản hướng dẫn có sẵn trên thiết bị.'}
    </p>}
    <div className="p-4 flex flex-col gap-4">
      <StepHeader currentIndex={currentStepIndex} totalSteps={totalSteps} sectionName={currentStep.sectionName}
        fieldLabel={currentStep.label} requiresPrerequisiteDoc={currentStep.requiresPrerequisiteDoc} legalWarningFlag={currentStep.legalWarningFlag} />
      <VisualTwin pages={workflow.pages || []} currentPageNumber={currentPageNumber} highlightCoords={currentStep.highlightCoords}
        fieldLabel={currentStep.label} stepNumber={currentStepIndex + 1} />
      <VoiceAssistantPanel voiceGuidance={currentStep.voiceGuidance} audioUrl={currentStep.audioUrl} faqs={currentStep.faqs}
        formCode={workflow.formCode} stepIndex={currentStep.stepIndex || (currentStepIndex + 1)} />
      <RedTextExample exampleText={prerequisiteExampleText(currentStep, prerequisiteFields)} fieldNote={currentStep.requiresPrerequisiteDoc && prerequisiteFields
        ? '✨ Đã tự động trích xuất thông tin từ Biên bản phạt của bác (Nghị định 13)!'
        : currentStep.faqs?.[0]?.answer} />
    </div>
    <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t-2 border-slate-300 px-4 py-3 flex items-center justify-between gap-3 z-40 shadow-lg">
      <button type="button" onClick={() => setCurrentStepIndex(index => Math.max(0, index - 1))} disabled={currentStepIndex === 0}
        className="min-h-touch-lg px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 border-2 border-slate-300 rounded-xl font-extrabold text-base flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm" aria-label="Quay lại dòng trước">
        <ChevronLeft className="w-6 h-6" /><span className="hidden sm:inline">Dòng trước</span>
      </button>
      <div className="text-center"><div className="font-black text-sm text-slate-800">Dòng {currentStepIndex + 1} / {totalSteps}</div><div className="text-[11px] font-bold text-slate-500">Trang {currentPageNumber}</div></div>
      <button type="button" onClick={handleNextStep} className="min-h-touch-lg bg-afl-green flex-1 px-5 hover:bg-afl-green-dark text-white border-2 border-afl-green rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md" aria-label={currentStepIndex === totalSteps - 1 ? 'Hoàn tất biểu mẫu' : 'Chuyển sang dòng tiếp theo'}>
        {currentStepIndex === totalSteps - 1 ? <><CheckCircle className="w-6 h-6" /><span>Hoàn Thành</span></> : <><span>Dòng Tiếp Theo</span><ChevronRight className="w-6 h-6" /></>}
      </button>
    </footer>
  </div>;
}

export default function GuidePage() {
  return <Suspense fallback={<div className="p-6 text-center text-slate-600 font-bold">Đang tải hướng dẫn...</div>}><GuideContent /></Suspense>;
}
