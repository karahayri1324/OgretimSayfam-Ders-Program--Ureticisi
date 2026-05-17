/**
 * Dataset validator — Plans/dataset_samples/*.jsonl içindeki örnekleri kontrol eder.
 *
 * Kontroller:
 *  1. Satır geçerli JSON mı
 *  2. messages dizisi 3 elemanlı mı (system + user + assistant)
 *  3. Assistant content geçerli JSON mı
 *  4. AIResponseSchema'ya uyuyor mu (Zod)
 *  5. Constraint type ConstraintTypeEnum'da mı
 *  6. user content [CONTEXT]...[/CONTEXT] ve [USER_REQUEST]...[/USER_REQUEST] içeriyor mu
 *
 * Çalıştırma:
 *   npx tsx scripts/validate_dataset.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIResponseSchema } from '../electron/ai/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DS = path.resolve(__dirname, '..', 'Plans', 'dataset_samples');

type Issue = { file: string; line: number; reason: string };
const issues: Issue[] = [];
let total = 0;
let valid = 0;

function checkFile(file: string) {
  const full = path.join(DS, file);
  const lines = fs.readFileSync(full, 'utf-8').split('\n');
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    total++;

    let row: any;
    try {
      row = JSON.parse(trimmed);
    } catch (e) {
      issues.push({ file, line: lineNo, reason: `Satır geçerli JSON değil: ${(e as Error).message}` });
      continue;
    }

    if (!Array.isArray(row.messages) || row.messages.length !== 3) {
      issues.push({ file, line: lineNo, reason: 'messages 3 elemanlı dizi olmalı' });
      continue;
    }

    const [sys, user, asst] = row.messages;
    if (sys.role !== 'system' || user.role !== 'user' || asst.role !== 'assistant') {
      issues.push({ file, line: lineNo, reason: 'role sırası system/user/assistant olmalı' });
      continue;
    }

    if (!user.content.includes('[CONTEXT]') || !user.content.includes('[/CONTEXT]')) {
      issues.push({ file, line: lineNo, reason: 'user mesajında [CONTEXT] bloğu yok' });
      continue;
    }
    if (!user.content.includes('[USER_REQUEST]') || !user.content.includes('[/USER_REQUEST]')) {
      issues.push({ file, line: lineNo, reason: 'user mesajında [USER_REQUEST] bloğu yok' });
      continue;
    }

    let asstJson: any;
    try {
      asstJson = JSON.parse(asst.content);
    } catch (e) {
      issues.push({ file, line: lineNo, reason: `assistant içeriği JSON değil: ${(e as Error).message}` });
      continue;
    }

    const parsed = AIResponseSchema.safeParse(asstJson);
    if (!parsed.success) {
      issues.push({
        file,
        line: lineNo,
        reason: `Schema fail: ${parsed.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      });
      continue;
    }

    valid++;
  }
}

const targetFiles = fs.readdirSync(DS).filter((f) => f.endsWith('.jsonl'));
for (const f of targetFiles) {
  checkFile(f);
}

const splitDir = path.join(DS, 'train_test_split');
if (fs.existsSync(splitDir)) {
  for (const f of fs.readdirSync(splitDir).filter((f) => f.endsWith('.jsonl'))) {
    checkFile(path.join('train_test_split', f));
  }
}

console.log(`\nKontrol edilen: ${total}`);
console.log(`Geçerli       : ${valid}`);
console.log(`Sorunlu       : ${issues.length}`);

if (issues.length > 0) {
  console.log('\nİlk 20 sorun:');
  for (const i of issues.slice(0, 20)) {
    console.log(`  ${i.file}:${i.line}  ${i.reason}`);
  }
  process.exit(1);
}
console.log('\n✓ Tüm dataset örnekleri geçerli.');
