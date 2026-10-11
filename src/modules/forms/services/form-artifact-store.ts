import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { FormWorkflow, FormPageMetadata } from '@/shared/contracts';
import { validateFormOcrContext, type FormOcrContext } from './form-ocr-context';
import { fieldMetadataFromSteps, validFieldMetadata, type FieldDisplayMetadata } from './form-field-metadata';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const PREFIX = 'afl-template-v1:';
export interface FormDisplayArtifact {
  kind: 'afl-template-v1'; formCode: string; pages: FormPageMetadata[];
  circularInfo?: string; department?: string;
  fields?: FieldDisplayMetadata[];
  ocrContext?: FormOcrContext;
}

export class FormArtifactStore {
  constructor(private readonly root = process.env.FORM_TEMPLATE_ASSET_DIR || path.join(process.cwd(), 'private-documents', 'form-templates')) {}

  imageUrl(formCode: string, pageNumber: number, asset: string): string {
    return `/api/forms/${encodeURIComponent(formCode)}/pages/${pageNumber}?asset=${asset}`;
  }

  private write(bytes: Buffer, extension: string): string {
    const hash = digest(bytes);
    fs.mkdirSync(this.root, { recursive: true });
    try { fs.writeFileSync(path.join(this.root, `${hash}.${extension}`), bytes, { flag: 'wx', mode: 0o600 }); }
    catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'EEXIST') throw reason;
      if (!fs.readFileSync(path.join(this.root, `${hash}.${extension}`)).equals(bytes)) throw new Error('FORM_ASSET_UNAVAILABLE');
    }
    return hash;
  }

  async saveImage(formCode: string, bytes: Uint8Array, pageNumber = 1): Promise<FormPageMetadata> {
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 20) throw new Error('INVALID_FORM_PAGE');
    const { data, info } = await sharp(bytes, { limitInputPixels: 12_000_000 }).png().toBuffer({ resolveWithObject: true });
    if (data.length > 8 * 1024 * 1024) throw new Error('FORM_ASSET_TOO_LARGE');
    const hash = this.write(data, 'png');
    return { pageNumber, imageUrl: this.imageUrl(formCode, pageNumber, hash), width: info.width, height: info.height };
  }

  readImage(asset: string): Buffer {
    if (!HASH.test(asset)) throw new Error('INVALID_FORM_ASSET');
    const file = path.join(this.root, `${asset}.png`);
    const size = fs.statSync(file).size;
    if (size > 8 * 1024 * 1024) throw new Error('FORM_ASSET_UNAVAILABLE');
    const bytes = fs.readFileSync(file);
    if (digest(bytes) !== asset) throw new Error('FORM_ASSET_UNAVAILABLE');
    return bytes;
  }

  private async verifyPages(formCode: string, pages: FormPageMetadata[]): Promise<void> {
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > 20) throw new Error('INVALID_WORKFLOW');
    for (const [index, page] of pages.entries()) {
      if (!page || page.pageNumber !== index + 1 || !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height)
        || page.width < 1 || page.height < 1) throw new Error('INVALID_WORKFLOW');
      const match = /\?asset=([a-f0-9]{64})$/.exec(page.imageUrl);
      if (!match || page.imageUrl !== this.imageUrl(formCode, page.pageNumber, match[1])) throw new Error('INVALID_WORKFLOW');
      const metadata = await sharp(this.readImage(match[1])).metadata();
      if (metadata.width !== page.width || metadata.height !== page.height) throw new Error('INVALID_WORKFLOW');
    }
  }

  async save(workflow: FormWorkflow): Promise<string | null> {
    const fields = fieldMetadataFromSteps(workflow.steps, workflow.pages?.length ?? 1);
    if (!workflow.pages?.length) {
      if (fields.length) throw new Error('INVALID_WORKFLOW');
      return null;
    }
    try { await this.verifyPages(workflow.formCode, workflow.pages); }
    catch (reason) {
      if (reason instanceof Error && reason.message === 'INVALID_WORKFLOW') throw reason;
      throw new Error('FORM_ASSET_UNAVAILABLE');
    }
    if (workflow.steps.some(step => !Number.isSafeInteger(step.pageNumber ?? 1) || (step.pageNumber ?? 1) < 1
      || (step.pageNumber ?? 1) > workflow.pages!.length)
      || workflow.pages.length > 1 && fields.length !== workflow.steps.length) throw new Error('INVALID_WORKFLOW');
    const validatedOcr = workflow.ocrContext ? validateFormOcrContext(workflow.ocrContext, workflow.pages.length) : undefined;
    const artifact: FormDisplayArtifact = { kind: 'afl-template-v1', formCode: workflow.formCode, pages: workflow.pages,
      circularInfo: workflow.circularInfo, department: workflow.department, ...(fields.length ? { fields } : {}), ...(validatedOcr ? { ocrContext: validatedOcr } : {}) };
    if ([artifact.circularInfo, artifact.department].some(value => value !== undefined && (typeof value !== 'string' || value.length > 1000))) throw new Error('INVALID_WORKFLOW');
    const bytes = Buffer.from(JSON.stringify(artifact));
    if (bytes.length > 1024 * 1024) throw new Error('INVALID_WORKFLOW');
    try { return PREFIX + this.write(bytes, 'json'); }
    catch { throw new Error('FORM_ASSET_UNAVAILABLE'); }
  }

  async read(reference: string | null | undefined, formCode: string): Promise<FormDisplayArtifact | null> {
    if (!reference?.startsWith(PREFIX)) return null;
    try {
      const hash = reference.slice(PREFIX.length);
      if (!HASH.test(hash)) throw new Error('INVALID_FORM_ASSET');
      const file = path.join(this.root, `${hash}.json`);
      if (fs.statSync(file).size > 1024 * 1024) throw new Error('INVALID_FORM_ASSET');
      const bytes = fs.readFileSync(file);
      if (digest(bytes) !== hash) throw new Error('INVALID_FORM_ASSET');
      const artifact = JSON.parse(bytes.toString()) as FormDisplayArtifact;
      if (artifact.kind !== 'afl-template-v1' || artifact.formCode !== formCode || !Array.isArray(artifact.pages)) throw new Error('INVALID_FORM_ASSET');
      if (artifact.fields !== undefined && (!Array.isArray(artifact.fields) || artifact.fields.length > 200
        || new Set(artifact.fields.map(field => field?.boxId)).size !== artifact.fields.length
        || artifact.fields.some(field => !field || typeof field.boxId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(field.boxId)
          || !field.inputKind || !Array.isArray(field.highlightRegions)
          || !validFieldMetadata(field.inputKind, field.highlightRegions, field.highlightRegions?.[0]?.normalizedCoords,
            field.pageNumber ?? 1, artifact.pages.length)))) throw new Error('INVALID_FORM_ASSET');
      if (artifact.pages.length > 1 && (!artifact.fields || artifact.fields.length === 0)) throw new Error('INVALID_FORM_ASSET');
      await this.verifyPages(formCode, artifact.pages);
      return artifact;
    } catch { throw new Error('FORM_ASSET_UNAVAILABLE'); }
  }
}

export const formArtifactStore = new FormArtifactStore();
