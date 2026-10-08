import {
  FormGeometricManifest,
  FormWorkflow,
  NormalizedBoundingBox,
} from "@/shared/contracts";

const BOX_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function validCoords(value: unknown): value is NormalizedBoundingBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (coord) =>
        typeof coord === "number" &&
        Number.isFinite(coord) &&
        coord >= 0 &&
        coord <= 1,
    ) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

export function validateManifest(value: unknown): FormGeometricManifest {
  if (!value || typeof value !== "object") throw new Error("INVALID_MANIFEST");
  const manifest = value as FormGeometricManifest;
  if (
    typeof manifest.formId !== "string" ||
    !BOX_ID.test(manifest.formId) ||
    typeof manifest.formCode !== "string" ||
    !manifest.formCode.trim() ||
    manifest.formCode.length > 200 ||
    !/^[A-Za-z0-9À-ỹ][A-Za-z0-9À-ỹ\s:()./_-]*$/.test(manifest.formCode) ||
    /[\x00-\x1f]/.test(manifest.formCode) ||
    typeof manifest.formTitle !== "string" ||
    !manifest.formTitle.trim() ||
    manifest.formTitle.length > 300 ||
    !Number.isSafeInteger(manifest.imageDimensions?.width) ||
    manifest.imageDimensions.width <= 0 ||
    !Number.isSafeInteger(manifest.imageDimensions?.height) ||
    manifest.imageDimensions.height <= 0 ||
    !Array.isArray(manifest.boxes) ||
    manifest.boxes.length < 1 ||
    manifest.boxes.length > 200
  ) {
    throw new Error("INVALID_MANIFEST");
  }
  const ids = new Set<string>();
  if (manifest.pages !== undefined && (!Array.isArray(manifest.pages) || manifest.pages.length !== 1 || !manifest.pages[0] || manifest.pages[0].pageNumber !== 1
    || manifest.pages[0].width !== manifest.imageDimensions.width || manifest.pages[0].height !== manifest.imageDimensions.height
    || typeof manifest.pages[0].imageUrl !== 'string' || !manifest.pages[0].imageUrl)) throw new Error('INVALID_MANIFEST_PAGES');
  if ([manifest.circularInfo, manifest.department].some(value => value !== undefined && (typeof value !== 'string' || value.length > 1000))) throw new Error('INVALID_MANIFEST');
  for (const box of manifest.boxes) {
    if (
      !box ||
      typeof box.boxId !== "string" ||
      !BOX_ID.test(box.boxId) ||
      ids.has(box.boxId) ||
      typeof box.rawText !== "string" ||
      !box.rawText.trim() ||
      box.rawText.length > 1000 ||
      !["text", "checkbox", "table_cell"].includes(box.boxType) ||
      typeof box.estimatedWidthRatio !== "number" ||
      !Number.isFinite(box.estimatedWidthRatio) ||
      box.estimatedWidthRatio < 0 ||
      box.estimatedWidthRatio > 1 ||
      !validCoords(box.normalizedCoords)
    ) {
      throw new Error("INVALID_MANIFEST");
    }
    ids.add(box.boxId);
  }
  return manifest;
}

export function validateWorkflow(
  manifest: FormGeometricManifest,
  workflow: FormWorkflow,
): void {
  if (
    workflow.formCode !== manifest.formCode ||
    workflow.formId !== manifest.formId ||
    !Array.isArray(workflow.steps) ||
    workflow.steps.length !== manifest.boxes.length
  ) {
    throw new Error("INVALID_WORKFLOW");
  }
  const ids = new Set(manifest.boxes.map((box) => box.boxId));
  const seen = new Set<string>();
  for (let index = 0; index < workflow.steps.length; index++) {
    const step = workflow.steps[index];
    if (
      !step ||
      step.stepIndex !== index + 1 ||
      !ids.has(step.boxId) ||
      seen.has(step.boxId) ||
      typeof step.label !== "string" ||
      !step.label.trim() ||
      step.label.length > 1000 ||
      typeof step.voiceGuidance !== "string" ||
      !step.voiceGuidance.trim() ||
      step.voiceGuidance.length > 2000 ||
      (step.pageNumber !== undefined && step.pageNumber !== 1) ||
      typeof step.sectionName !== "string" ||
      !step.sectionName.trim() ||
      step.sectionName.length > 1000 ||
      typeof step.exampleRedText !== "string" ||
      !step.exampleRedText.trim() ||
      step.exampleRedText.length > 2000 ||
      !validCoords(step.highlightCoords) ||
      (step.requiresPrerequisiteDoc !== undefined && typeof step.requiresPrerequisiteDoc !== 'boolean') ||
      (step.sourceFieldFromPrerequisite !== undefined && typeof step.sourceFieldFromPrerequisite !== 'string') ||
      (step.legalWarningFlag !== undefined && typeof step.legalWarningFlag !== 'boolean') ||
      (!Array.isArray(step.faqs) || step.faqs.length < 1 || step.faqs.length > 10 ||
        step.faqs.some(
            (faq: { question: string; answer: string } | null) =>
              !faq ||
              typeof faq.question !== "string" ||
              !faq.question.trim() ||
              faq.question.length > 1000 ||
              typeof faq.answer !== "string" ||
              !faq.answer.trim() || faq.answer.length > 2000,
        ))
    ) {
      throw new Error("INVALID_WORKFLOW");
    }
    seen.add(step.boxId);
  }
}
