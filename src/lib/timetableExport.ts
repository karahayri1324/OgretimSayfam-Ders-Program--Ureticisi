import * as XLSX from 'xlsx';
import type { Day, Hour, Subject, TimetableSlot } from './types';

/**
 * Görüntülenen timetable grid'ini export edilebilir tabloya çevirir.
 *
 * Renderer'da Timetable.tsx 3 view (class/teacher/room) içerir; her view tek
 * bir entity için (örn: 9A sınıfı) gün × saat matrisini gösterir. Bu modül
 * UI'daki aynı matrisi alır ve PDF/Excel/HTML için ortak tabloyu üretir.
 */

const DAY_LABELS: Record<string, string> = {
  mon: 'Pazartesi',
  tue: 'Salı',
  wed: 'Çarşamba',
  thu: 'Perşembe',
  fri: 'Cuma',
  sat: 'Cumartesi',
  sun: 'Pazar',
};

export type ViewMode = 'class' | 'teacher' | 'room';

export type ExportContext = {
  viewMode: ViewMode;
  entityName: string;
  schoolName?: string;
  generatedAt?: string;
  days: Day[];
  hours: Hour[];
  subjects: Subject[];
  filteredSlots: TimetableSlot[];
};

function dayLabel(d: Day): string {
  const key = d.name?.toLowerCase();
  return DAY_LABELS[key] ?? d.name;
}

function viewLabel(v: ViewMode): string {
  if (v === 'class') return 'Sınıf';
  if (v === 'teacher') return 'Öğretmen';
  return 'Derslik';
}

/**
 * UI'daki gibi `${dayIndex}_${hourIndex}` anahtarlı bir slot haritası kurar.
 */
function buildSlotMap(slots: TimetableSlot[]): Map<string, TimetableSlot> {
  const m = new Map<string, TimetableSlot>();
  for (const s of slots) m.set(`${s.dayIndex}_${s.hourIndex}`, s);
  return m;
}

/**
 * Bir hücredeki metin temsilini üretir. View moduna göre hangi alanlar
 * gizleniyor onu da uygular (teacher view'da teacher tekrar etmesin).
 */
function cellText(slot: TimetableSlot, view: ViewMode): string[] {
  const parts: string[] = [];
  if (slot.subjectName) parts.push(slot.subjectName);
  if (view !== 'teacher' && slot.teacherName) parts.push(slot.teacherName);
  if (view !== 'class' && slot.className) parts.push(slot.className);
  if (view !== 'room' && slot.roomName) parts.push(slot.roomName);
  return parts;
}

/**
 * HTML export — Türkçe karakter destekli, inline CSS. Yazdırılabilir.
 * Subject color "borderLeft" olarak korunur.
 */
export function buildHtml(ctx: ExportContext): string {
  const { days, hours, viewMode, entityName, schoolName, generatedAt, filteredSlots, subjects } =
    ctx;
  const subjectColor = new Map<number, string>();
  for (const s of subjects) subjectColor.set(s.id, s.color ?? '#3b82f6');
  const slotMap = buildSlotMap(filteredSlots);

  const tableHead = `
    <tr>
      <th class="hd corner">Saat / Gün</th>
      ${days
        .map((d) => `<th class="hd">${escapeHtml(dayLabel(d))}</th>`)
        .join('')}
    </tr>`;

  const tableBody = hours
    .map((h, hi) => {
      const label = h.name || `${hi + 1}. Ders`;
      const time =
        h.startTime && h.endTime
          ? `<div class="time">${escapeHtml(h.startTime)}–${escapeHtml(h.endTime)}</div>`
          : '';
      const cells = days
        .map((_d, di) => {
          const slot = slotMap.get(`${di}_${hi}`);
          if (!slot) return '<td class="empty">—</td>';
          const color =
            slot.subjectId != null
              ? subjectColor.get(slot.subjectId) ?? '#3b82f6'
              : '#3b82f6';
          const parts = cellText(slot, viewMode);
          return `<td class="cell" style="background:${color}1f;border-left:3px solid ${color};">${parts
            .map(
              (p, idx) =>
                `<div class="${idx === 0 ? 'subj' : 'meta'}">${escapeHtml(p)}</div>`,
            )
            .join('')}</td>`;
        })
        .join('');
      return `<tr><th class="hd row">${escapeHtml(label)}${time}</th>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`Ders Programı — ${entityName}`)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f172a; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
  th.hd { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  th.hd.corner { text-align: left; }
  th.hd.row { text-align: left; font-weight: 500; min-width: 90px; }
  td.cell { font-size: 11px; }
  td.cell .subj { font-weight: 600; color: #0f172a; }
  td.cell .meta { color: #334155; }
  td.empty { color: #cbd5e1; text-align: center; }
  .time { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .footer { margin-top: 12px; font-size: 10px; color: #94a3b8; }
</style>
</head>
<body>
  <h1>Ders Programı — ${escapeHtml(entityName)}</h1>
  <div class="subtitle">${escapeHtml(viewLabel(viewMode))} görünümü${
    schoolName ? ` · ${escapeHtml(schoolName)}` : ''
  }${generatedAt ? ` · ${escapeHtml(generatedAt)}` : ''}</div>
  <table>
    <thead>${tableHead}</thead>
    <tbody>${tableBody}</tbody>
  </table>
  <div class="footer">Bu doküman Ders Program Oluşturucu ile üretildi.</div>
</body>
</html>`;
}

/**
 * Tarayıcı/Renderer ortamında HTML'i blob olarak indirir.
 * UTF-8 BOM eklenmez — modern uygulamalar (Chrome, MS Word) charset attr'unu
 * okuyor; metin Türkçe karakter dahil doğru görünür.
 */
export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

/**
 * Tablo verisini xlsx olarak yazar. Hücre içeriği "{Ders}\n{Öğretmen}\n{...}".
 * Sütun genişlikleri otomatik hesaplanır.
 */
export function downloadXlsx(ctx: ExportContext, filename: string): void {
  const { days, hours, filteredSlots, viewMode } = ctx;
  const slotMap = buildSlotMap(filteredSlots);

  const header = ['Saat / Gün', ...days.map((d) => dayLabel(d))];
  const rows: (string | number)[][] = [header];
  hours.forEach((h, hi) => {
    const label = h.name || `${hi + 1}. Ders`;
    const time = h.startTime && h.endTime ? ` (${h.startTime}–${h.endTime})` : '';
    const row: (string | number)[] = [`${label}${time}`];
    days.forEach((_d, di) => {
      const slot = slotMap.get(`${di}_${hi}`);
      if (!slot) {
        row.push('');
        return;
      }
      row.push(cellText(slot, viewMode).join('\n'));
    });
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Excel hücrelerinde satır arası newline gösterimi için wrap text gerekli;
  // worksheet/cell-level format. Tüm hücrelere uygulayalım.
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) {
        cell.s = { alignment: { wrapText: true, vertical: 'top' } };
      }
    }
  }
  ws['!cols'] = header.map((_, i) => ({ wch: i === 0 ? 18 : 22 }));
  ws['!rows'] = rows.map((_, i) => ({ hpx: i === 0 ? 22 : 60 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, viewLabel(viewMode));
  XLSX.writeFile(wb, filename);
}

/**
 * "Ders Programı 2026-05-16.{ext}" formatında varsayılan dosya adı.
 * Boşluklar korunur (Türkçe dosya adlarıyla sorun değil).
 */
export function defaultFilename(
  entityName: string,
  ext: 'pdf' | 'xlsx' | 'html',
): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = entityName.replace(/[/\\?%*:|"<>]/g, '-');
  return `Ders Programı ${safeName} ${date}.${ext}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // küçük gecikme ile URL'i serbest bırak — Safari'de erken revoke download'u
  // bozabiliyor.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
