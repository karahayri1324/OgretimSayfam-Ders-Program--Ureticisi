/**
 * Son program-üretim (FET) başarısızlığını tutar ve AI bağlamına (context) taşır.
 *
 * AMAÇ: FET bir programı üretemediğinde (kısıt çatışması, yetersiz saat, zaman aşımı,
 * geçersiz veri…) bu bilgi AI modeline ulaşsın. Böylece kullanıcı "neden olmadı / düzelt"
 * dediğinde model gerçek nedeni bilir ve CONSTRAINTS listesine bakıp somut çözüm önerir
 * (kısıt gevşet, gün/saat ekle, ders azalt) — capability parity: önerdiğini uygulayabilir de.
 *
 * Tasarım: tek-process (main) içinde modül-singleton. Üretim başarılı olunca temizlenir;
 * yeni bir başarısızlıkta üzerine yazılır. Uygulama yeniden başlarsa sıfırlanır — eski
 * oturumun başarısızlığı zaten bayat olduğu için bu istenen davranıştır.
 */

/** FET üretim hatası kategorisi. runner.ts'in FetResult.errorCode'u + pre-flight kodları. */
export type GenerationFailureReason =
  | 'NO_SOLUTION'
  | 'PARTIAL'
  | 'TIMEOUT'
  | 'XML_ERROR'
  | 'PARSE_ERROR'
  | 'BINARY_NOT_FOUND'
  | 'NO_TEACHERS'
  | 'NO_CLASSES'
  | 'NO_ACTIVITIES'
  | 'NO_SCHEDULE'
  | 'UNKNOWN';

export type GenerationFailure = {
  reason: GenerationFailureReason;
  /** Kullanıcıya gösterilecek sade Türkçe mesaj. */
  message: string;
  /** FET'in ham çıktısı (stdout+logs). Sadece iç kullanım — özeti modele message'a iliştirilir. */
  rawError?: string;
  /** PARTIAL: yerleştirilemeyen aktivite sayısı. */
  unplaced?: number;
  /** PARTIAL: toplam aktivite sayısı. */
  total?: number;
  /** Kaydedilme zamanı (ISO). Sadece iç kullanım — modele GÖNDERİLMEZ. */
  at: string;
};

/** Modele gönderilen kompakt biçim (zaman damgası ve gürültü olmadan). */
export type GenerationFailureContext = {
  reason: GenerationFailureReason;
  message: string;
  unplaced?: number;
  total?: number;
};

let current: GenerationFailure | null = null;

export function recordGenerationFailure(
  failure: Omit<GenerationFailure, 'at'> & { at?: string },
): void {
  current = { ...failure, at: failure.at ?? new Date().toISOString() };
}

/** Üretim başarılı olduğunda veya kullanıcı bilinçli temizlediğinde çağrılır. */
export function clearGenerationFailure(): void {
  current = null;
}

export function getGenerationFailure(): GenerationFailure | null {
  return current;
}

/** Bağlama (AIContext) gömülecek kompakt nesneyi döndürür; hata yoksa null.
 *  message'a FET'in gerçek neden satırının özeti iliştirilir (ayrı alan DEĞİL — context alan
 *  yapısı, dolayısıyla eğitim formatı, korunur). Model böylece "hangi kısıt/öğretmen çözümü
 *  imkânsız kıldı" gibi somut bilgiyle daha isabetli düzeltme önerir. */
export function getGenerationFailureContext(): GenerationFailureContext | null {
  if (!current) return null;
  const detail = summarizeFetError(current.rawError);
  const out: GenerationFailureContext = {
    reason: current.reason,
    message: detail ? `${current.message} [FET: ${detail}]` : current.message,
  };
  if (typeof current.unplaced === 'number') out.unplaced = current.unplaced;
  if (typeof current.total === 'number') out.total = current.total;
  return out;
}

// FET ham çıktısından en bilgilendirici 1-2 satırı ayıklar (çözümü imkânsız kılan gerçek neden).
// Gürültü (çeviri uyarıları, sürüm notları) atlanır; uzunluk sınırlanır (context şişmesin).
const FET_SIGNAL_RE =
  /cannot (optimize|precompute|generate|schedule)|impossible|not enough|conflict|has at most|refers to removed|too late|number of (hours|activities)/i;
export function summarizeFetError(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && FET_SIGNAL_RE.test(l));
  if (lines.length === 0) return null;
  // İlk iki anlamlı satır yeterli; toplam ~400 karakterle sınırla.
  const picked = lines.slice(0, 2).join(' | ');
  return picked.length > 400 ? picked.slice(0, 397) + '…' : picked;
}

/**
 * PARTIAL hata mesajından "X/Y ders yerleştirilemedi" sayısını ayıklar.
 * runner.ts mesaj formatı: "Program tamamlanamadı: 3/40 ders yerleştirilemedi. …"
 */
export function parseUnplacedFromMessage(
  message: string,
): { unplaced: number; total: number } | null {
  const m = message.match(/(\d+)\s*\/\s*(\d+)\s+ders/);
  if (!m) return null;
  const unplaced = parseInt(m[1]!, 10);
  const total = parseInt(m[2]!, 10);
  if (!Number.isFinite(unplaced) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return { unplaced, total };
}
