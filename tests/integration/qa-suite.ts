import fs from 'fs';
import path from 'path';
import { validateManifest, validateWorkflow } from '@/modules/forms/services/form-validation.service';
import { isValidMp3 } from '@/modules/voice-ai/services/tts.service';
import { FormWorkflow } from '@/shared/contracts';

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[a-f\d]{2}/gi)?.map(channel => parseInt(channel, 16) / 255) ?? [];
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function run() {
  const manifest = validateManifest(JSON.parse(fs.readFileSync('assets/mock-data/mock-manifest.json', 'utf8')));
  const fixture: FormWorkflow = JSON.parse(fs.readFileSync('assets/mock-data/mock-workflow.json', 'utf8'));
  const workflow = { ...fixture, formCode: manifest.formCode, formTitle: manifest.formTitle };
  const results: Array<[string, boolean]> = [];
  const check = (name: string, valid: boolean) => results.push([name, valid]);

  let workflowValid = true;
  try { validateWorkflow(manifest, workflow); } catch { workflowValid = false; }
  check('Fixture: một bước hợp lệ cho mỗi box', workflowValid);
  check('Fixture: mã form trùng manifest', workflow.formCode === manifest.formCode);
  check('Fixture: chữ mẫu viết hoa', workflow.steps.every(step => step.exampleRedText === step.exampleRedText.toUpperCase()));
  check('Fixture: FAQ có nội dung', workflow.steps.every(step => step.faqs.length > 0 && step.faqs.every(faq => faq.question.trim() && faq.answer.trim())));
  check('Fixture: MP3 thật có header hợp lệ', workflow.steps.every(step => {
    if (!/^\/audio\/[A-Za-z0-9_-]+\.mp3$/.test(step.audioUrl)) return false;
    const audioPath = path.join(process.cwd(), 'public', step.audioUrl.substring(1));
    return fs.existsSync(audioPath) && isValidMp3(fs.readFileSync(audioPath));
  }));

  const ratio = contrastRatio('#D32F2F', '#FFFFFF');
  check('Màu #D32F2F trên trắng xấp xỉ 4.98:1, KHÔNG đạt AAA 7:1', Math.abs(ratio - 4.98) < 0.02 && ratio < 7);
  for (const [name, valid] of results) console.log(`${valid ? 'PASS' : 'FAIL'} ${name}`);
  console.log(`Kiểm tra fixture/hợp đồng dữ liệu: ${results.filter(([, valid]) => valid).length}/${results.length}. Không phải nghiệm thu 11 FR.`);
  if (results.some(([, valid]) => !valid)) process.exitCode = 1;
}

run();
