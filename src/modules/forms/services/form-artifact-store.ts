import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { FormWorkflow, FormPageMetadata } from '@/shared/contracts';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const PREFIX = 'afl-template-v1:';
export interface FormDisplayArtifact {
  kind: 'afl-template-v1'; formCode: string; pages: FormPageMetadata[];
  circularInfo?: string; department?: string;
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

  async saveImage(formCode: string, bytes: Uint8Array): Promise<FormPageMetadata> {
    const { data, info } = await sharp(bytes, { limitInputPixels: 12_000_000 }).png().toBuffer({ resolveWithObject: true });
    if (data.length > 8 * 1024 * 1024) throw new Error('FORM_ASSET_TOO_LARGE');
    const hash = this.write(data, 'png');
    return { pageNumber: 1, imageUrl: this.imageUrl(formCode, 1, hash), width: info.width, height: info.height };
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
    if (!Array.isArray(pages) || pages.length !== 1 || !pages[0] || pages[0].pageNumber !== 1) throw new Error('INVALID_WORKFLOW');
    for (const page of pages) {
      const match = /\?asset=([a-f0-9]{64})$/.exec(page.imageUrl);
      if (!match || page.imageUrl !== this.imageUrl(formCode, page.pageNumber, match[1])) throw new Error('INVALID_WORKFLOW');
      const metadata = await sharp(this.readImage(match[1])).metadata();
      if (metadata.width !== page.width || metadata.height !== page.height) throw new Error('INVALID_WORKFLOW');
    }
  }

  async save(workflow: FormWorkflow): Promise<string | null> {
    if (!workflow.pages?.length) return null;
    try { await this.verifyPages(workflow.formCode, workflow.pages); }
    catch (reason) {
      if (reason instanceof Error && reason.message === 'INVALID_WORKFLOW') throw reason;
      throw new Error('FORM_ASSET_UNAVAILABLE');
    }
    if (workflow.steps.some(step => (step.pageNumber ?? 1) !== 1)) throw new Error('INVALID_WORKFLOW');
    const artifact: FormDisplayArtifact = { kind: 'afl-template-v1', formCode: workflow.formCode, pages: workflow.pages,
      circularInfo: workflow.circularInfo, department: workflow.department };
    if ([artifact.circularInfo, artifact.department].some(value => value !== undefined && (typeof value !== 'string' || value.length > 1000))) throw new Error('INVALID_WORKFLOW');
    try { return PREFIX + this.write(Buffer.from(JSON.stringify(artifact)), 'json'); }
    catch { throw new Error('FORM_ASSET_UNAVAILABLE'); }
  }

  async read(reference: string | null | undefined, formCode: string): Promise<FormDisplayArtifact | null> {
    if (!reference?.startsWith(PREFIX)) return null;
    try {
      const hash = reference.slice(PREFIX.length);
      if (!HASH.test(hash)) throw new Error('INVALID_FORM_ASSET');
      const file = path.join(this.root, `${hash}.json`);
      if (fs.statSync(file).size > 64 * 1024) throw new Error('INVALID_FORM_ASSET');
      const bytes = fs.readFileSync(file);
      if (digest(bytes) !== hash) throw new Error('INVALID_FORM_ASSET');
      const artifact = JSON.parse(bytes.toString()) as FormDisplayArtifact;
      if (artifact.kind !== 'afl-template-v1' || artifact.formCode !== formCode || !Array.isArray(artifact.pages)) throw new Error('INVALID_FORM_ASSET');
      await this.verifyPages(formCode, artifact.pages);
      return artifact;
    } catch { throw new Error('FORM_ASSET_UNAVAILABLE'); }
  }
}

export const formArtifactStore = new FormArtifactStore();
