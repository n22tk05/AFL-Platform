-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BoxType" AS ENUM ('TEXT', 'CHECKBOX', 'TABLE_CELL');

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "formCode" TEXT NOT NULL,
    "formTitle" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "originalPdfUrl" TEXT,
    "qrCodeUrl" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_geometric_manifests" (
    "id" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_geometric_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_geometric_boxes" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "boxType" "BoxType" NOT NULL DEFAULT 'TEXT',
    "estimatedWidthRatio" DOUBLE PRECISION NOT NULL,
    "spatialOrder" INTEGER NOT NULL DEFAULT 0,
    "box_ymin" DOUBLE PRECISION NOT NULL,
    "box_xmin" DOUBLE PRECISION NOT NULL,
    "box_ymax" DOUBLE PRECISION NOT NULL,
    "box_xmax" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_geometric_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_workflows" (
    "id" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "boxId" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "voiceGuidance" TEXT NOT NULL,
    "audioUrl" TEXT,
    "exampleRedText" TEXT,
    "highlightYmin" DOUBLE PRECISION,
    "highlightXmin" DOUBLE PRECISION,
    "highlightYmax" DOUBLE PRECISION,
    "highlightXmax" DOUBLE PRECISION,
    "requiresPrerequisiteDoc" BOOLEAN NOT NULL DEFAULT false,
    "sourceFieldFromPrerequisite" TEXT,
    "legalWarningFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_faqs" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prerequisite_documents" (
    "id" TEXT NOT NULL,
    "docCode" TEXT NOT NULL,
    "docName" TEXT NOT NULL,
    "description" TEXT,
    "sampleImageUrl" TEXT,
    "extractableFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prerequisite_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "voiceName" TEXT NOT NULL DEFAULT 'vi-VN-Neural2-A',
    "speakingRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_audit_logs" (
    "id" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_formCode_key" ON "form_templates"("formCode");

-- CreateIndex
CREATE UNIQUE INDEX "form_geometric_manifests_formTemplateId_key" ON "form_geometric_manifests"("formTemplateId");

-- CreateIndex
CREATE INDEX "form_geometric_boxes_manifestId_spatialOrder_idx" ON "form_geometric_boxes"("manifestId", "spatialOrder");

-- CreateIndex
CREATE UNIQUE INDEX "form_geometric_boxes_manifestId_boxId_key" ON "form_geometric_boxes"("manifestId", "boxId");

-- CreateIndex
CREATE UNIQUE INDEX "form_workflows_formTemplateId_key" ON "form_workflows"("formTemplateId");

-- CreateIndex
CREATE INDEX "workflow_steps_workflowId_stepIndex_idx" ON "workflow_steps"("workflowId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflowId_stepIndex_key" ON "workflow_steps"("workflowId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "prerequisite_documents_docCode_key" ON "prerequisite_documents"("docCode");

-- CreateIndex
CREATE UNIQUE INDEX "voice_cache_cacheKey_key" ON "voice_cache"("cacheKey");

-- AddForeignKey
ALTER TABLE "form_geometric_manifests" ADD CONSTRAINT "form_geometric_manifests_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_geometric_boxes" ADD CONSTRAINT "form_geometric_boxes_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "form_geometric_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_workflows" ADD CONSTRAINT "form_workflows_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "form_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_faqs" ADD CONSTRAINT "step_faqs_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_audit_logs" ADD CONSTRAINT "form_audit_logs_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
