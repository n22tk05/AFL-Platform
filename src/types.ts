import type { FormStatus } from "@prisma/client";

export type { FormStatus };

export type StatusKey = FormStatus | "ALL";

export type Status = {
  key: StatusKey;
  value: string;
};

export interface FormOption {
  id: string;
  code: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

export interface AdminFormTemplate {
  id: string;
  formCode: string;
  title: string;
  legalBasis: string;
  department: string;
  version: number;
  totalSteps: number;
  totalPages: number;
  status: FormStatus;
  publishedAt: Date;
  thumbnailUrl: string;
}
