import { describe, it, expect } from 'vitest';
import {
  MAX_WEEKLY_HOURS,
  MAX_BLOCK_DURATION,
  MAX_HOURS_PER_DAY,
} from '../src/lib/limits.js';
import { WRITABLE_SETTING_KEYS } from '../electron/db/repositories/settings.js';

describe('limits — tek kaynak değerleri makul aralıkta', () => {
  it('sınırlar tanımlı ve FET slot uzayıyla uyumlu', () => {
    expect(MAX_WEEKLY_HOURS).toBe(40);
    expect(MAX_BLOCK_DURATION).toBe(8);
    // FET slot indeksi 1..20 (SlotSchema.hour max 20) ile uyumlu olmalı.
    expect(MAX_HOURS_PER_DAY).toBeLessThanOrEqual(20);
  });
});

describe('güvenlik — fetBinaryPath yazılabilir ayar DEĞİL', () => {
  it('WRITABLE_SETTING_KEYS fetBinaryPath içermez (RCE yüzeyi + ölü ayar)', () => {
    expect(WRITABLE_SETTING_KEYS.has('fetBinaryPath')).toBe(false);
    // Gerçek yazılabilir ayarlar hâlâ mevcut (regresyon).
    expect(WRITABLE_SETTING_KEYS.has('fetTimeLimitSec')).toBe(true);
    expect(WRITABLE_SETTING_KEYS.has('theme')).toBe(true);
  });
});
