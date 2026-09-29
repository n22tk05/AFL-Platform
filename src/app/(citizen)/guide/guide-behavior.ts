import { prerequisiteValue } from '@/modules/documents/session';
import type { WorkflowStep } from '@/shared/contracts';

export function prerequisiteExampleText(step: WorkflowStep, fields: Record<string, string> | null): string {
  if (!step.requiresPrerequisiteDoc) return step.exampleRedText || '';
  return prerequisiteValue(fields, step.sourceFieldFromPrerequisite)?.toUpperCase() ?? 'CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT';
}

export function createGuideController(options: {
  getStepIndex: () => number;
  getTotalSteps: () => number;
  setStepIndex: (update: (index: number) => number) => void;
  clearSession: () => void;
  complete: () => void;
}) {
  return {
    nextStep(): void {
      if (options.getStepIndex() < options.getTotalSteps() - 1) {
        options.setStepIndex(index => index + 1);
        return;
      }
      options.clearSession();
      options.complete();
    },
  };
}

export function createGuideStepView(step: WorkflowStep, fields: Record<string, string> | null, controller: { nextStep: () => void }) {
  return {
    exampleText: prerequisiteExampleText(step, fields),
    onNext: () => controller.nextStep(),
  };
}
