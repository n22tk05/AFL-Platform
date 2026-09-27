'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import type { WorkflowStep, FormWorkflow } from '@/shared/contracts';
import { getMockWorkflow } from '@/config/app.config';
import { fetchWorkflow, workflowStorageKey, WorkflowSource } from '@/modules/forms/client';
import { VisualTwin } from '@/components/mobile/VisualTwin';
import { RedTextExample } from '@/components/mobile/RedTextExample';
import { StepHeader } from '@/components/mobile/StepHeader';
import { VoiceAssistantPanel } from '@/components/mobile/VoiceAssistantPanel';

const LIVE_FORM_CODE = 'Mẫu số: 01/LPTB';
function resolveFormCode(alias: string): string {
  const value = alias.trim().toLocaleLowerCase('vi');
  return ['tpl_01_lptb', '01-lptb', '01/lptb', 'mẫu số: 01/lptb'].includes(value) ? LIVE_FORM_CODE : alias.trim();
}
function enrichPresentation(live: FormWorkflow, fixture: FormWorkflow): FormWorkflow {
  const fixtureSteps = new Map(fixture.steps.map(step => [step.stepIndex, step]));
  return {
    ...live,
    pages: live.pages?.length ? live.pages : fixture.pages,
    totalPages: live.totalPages ?? fixture.totalPages,
    steps: live.steps.map(step => {
      const display = fixtureSteps.get(step.stepIndex);
      return { ...step, ...(step.pageNumber === undefined && display?.pageNumber ? { pageNumber: display.pageNumber } : {}) };
    }),
  };
}

function GuideContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams?.get('templateId') || 'tpl_01_lptb';
  const formCode = resolveFormCode(templateId);
  const [workflow, setWorkflow] = useState<FormWorkflow | null>(null);
  const [source, setSource] = useState<WorkflowSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setWorkflow(null); setSource(null); setLoadError(null); setCurrentStepIndex(0);
    const fixtureBase = getMockWorkflow(templateId);
    const fixture = { ...fixtureBase, formCode: LIVE_FORM_CODE };
    fetchWorkflow(formCode, {
      storage: window.localStorage,
      fallback: fixture,
      onSource: value => { if (active) setSource(value); },
    }).then(result => {
      if (active) setWorkflow(enrichPresentation(result, fixture));
    }).catch(() => {
      if (active) setLoadError('Không tải được hướng dẫn. Vui lòng kiểm tra kết nối rồi thử lại.');
    });
    return () => { active = false; };
  }, [formCode, templateId]);

  if (loadError) return <div role="alert" className="p-6 text-center text-slate-700">{loadError}</div>;
  if (!workflow) return <div role="status" className="p-6 text-center text-slate-600 font-bold">Đang tải hướng dẫn...</div>;
  const steps: WorkflowStep[] = workflow.steps;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex];
  if (!currentStep) return <div role="alert" className="p-6 text-center text-slate-700">Không tìm thấy dữ liệu quy trình biểu mẫu.</div>;
  const currentPageNumber = currentStep.pageNumber || 1;
  const handleNextStep = () => currentStepIndex < totalSteps - 1
    ? setCurrentStepIndex(index => index + 1)
    : alert(`Chúc mừng bác đã hoàn thành toàn bộ ${workflow.formTitleVi || workflow.formTitle || 'tờ khai'}!`);

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
        formCode={workflow.formCode} stepIndex={currentStep.stepIndex} />
      <RedTextExample exampleText={currentStep.exampleRedText} fieldNote={currentStep.faqs?.[0]?.answer} />
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
