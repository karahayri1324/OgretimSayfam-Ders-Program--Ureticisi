import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { AIResponseSchema } from '../electron/ai/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DS = path.resolve(__dirname, '..', 'Plans', 'dataset_samples');

type Issue = { file: string; line: number; reason: string };
const issues: Issue[] = [];
let total = 0;
let valid = 0;

async function checkFile(file: string): Promise<void> {
  const full = path.join(DS, file);
  const rl = readline.createInterface({
    input: fs.createReadStream(full, 'utf-8'),
    crlfDelay: Infinity,
  });
  let lineNo = 0;
  for await (const line of rl) {
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

    const msgs = row.messages;
    if (!Array.isArray(msgs) || msgs.length < 3 || msgs.length % 2 === 0) {
      issues.push({ file, line: lineNo, reason: `messages yapısı geçersiz (uzunluk=${msgs?.length})` });
      continue;
    }
    if (msgs[0].role !== 'system') {
      issues.push({ file, line: lineNo, reason: 'ilk mesaj system olmalı' });
      continue;
    }
    let roleOk = true;
    for (let i = 1; i < msgs.length; i++) {
      const expected = i % 2 === 1 ? 'user' : 'assistant';
      if (msgs[i].role !== expected) { roleOk = false; break; }
    }
    if (!roleOk) {
      issues.push({ file, line: lineNo, reason: 'multi-turn rol sırası system,(user,assistant)+ olmalı' });
      continue;
    }

    const firstUser = msgs[1].content as string;
    if (!firstUser.includes('[CONTEXT]') || !firstUser.includes('[/CONTEXT]')) {
      issues.push({ file, line: lineNo, reason: 'ilk user mesajında [CONTEXT] bloğu yok' });
      continue;
    }
    if (!firstUser.includes('[USER_REQUEST]') || !firstUser.includes('[/USER_REQUEST]')) {
      issues.push({ file, line: lineNo, reason: 'ilk user mesajında [USER_REQUEST] bloğu yok' });
      continue;
    }

    let asstOk = true;
    for (let i = 2; i < msgs.length; i += 2) {
      let asstJson: any;
      try {
        asstJson = JSON.parse(msgs[i].content);
      } catch (e) {
        issues.push({ file, line: lineNo, reason: `assistant[${i}] JSON değil: ${(e as Error).message}` });
        asstOk = false;
        break;
      }
      const parsed = AIResponseSchema.safeParse(asstJson);
      if (!parsed.success) {
        issues.push({
          file,
          line: lineNo,
          reason: `assistant[${i}] schema fail: ${parsed.error.issues
            .slice(0, 2)
            .map((i2) => `${i2.path.join('.')}: ${i2.message}`)
            .join('; ')}`,
        });
        asstOk = false;
        break;
      }
    }
    if (!asstOk) continue;

    valid++;
  }
}

async function main(): Promise<void> {
  const targetFiles = fs.readdirSync(DS).filter((f) => f.endsWith('.jsonl'));
  for (const f of targetFiles) {
    await checkFile(f);
  }

  const splitDir = path.join(DS, 'train_test_split');
  if (fs.existsSync(splitDir)) {
    for (const f of fs.readdirSync(splitDir).filter((f) => f.endsWith('.jsonl'))) {
      await checkFile(path.join('train_test_split', f));
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
}

void main();
