/**
 * Pure utilities for generating training-series occurrences.
 * No DB calls — safe to import from client and server.
 */

export type SeriesSlotInput = {
  weekday: number; // 0=Sun … 6=Sat (JS Date.getDay)
  meeting_time?: string | null; // "HH:MM"
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  location?: string | null;
};

export type ExcludedRange = { from: string; to: string }; // YYYY-MM-DD inclusive

export type GenerateInput = {
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  slots: (SeriesSlotInput & { id?: string })[];
  excludedDates?: string[]; // YYYY-MM-DD
  excludedRanges?: ExcludedRange[];
  defaultLocation?: string | null;
};

export type GeneratedOccurrence = {
  date: string; // YYYY-MM-DD
  weekday: number;
  slotIndex: number;
  slotId?: string;
  meetingISO: string | null;
  startISO: string;
  endISO: string;
  location: string | null;
};

function ymdToDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function combineLocal(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function isExcluded(ymd: string, excluded: Set<string>, ranges: ExcludedRange[]): boolean {
  if (excluded.has(ymd)) return true;
  for (const r of ranges) {
    if (ymd >= r.from && ymd <= r.to) return true;
  }
  return false;
}

export function generateOccurrences(input: GenerateInput): GeneratedOccurrence[] {
  const out: GeneratedOccurrence[] = [];
  if (!input.slots.length) return out;
  const start = ymdToDate(input.startsOn);
  const end = ymdToDate(input.endsOn);
  if (end < start) return out;
  const excludedSet = new Set(input.excludedDates ?? []);
  const ranges = input.excludedRanges ?? [];
  const byWeekday = new Map<number, (SeriesSlotInput & { id?: string; idx: number })[]>();
  input.slots.forEach((s, idx) => {
    if (!byWeekday.has(s.weekday)) byWeekday.set(s.weekday, []);
    byWeekday.get(s.weekday)!.push({ ...s, idx });
  });
  const cursor = new Date(start);
  while (cursor <= end) {
    const wd = cursor.getDay();
    const slots = byWeekday.get(wd);
    if (slots) {
      const ymd = dateToYmd(cursor);
      if (!isExcluded(ymd, excludedSet, ranges)) {
        for (const s of slots) {
          out.push({
            date: ymd,
            weekday: wd,
            slotIndex: s.idx,
            slotId: s.id,
            meetingISO: s.meeting_time ? combineLocal(ymd, s.meeting_time) : null,
            startISO: combineLocal(ymd, s.start_time),
            endISO: combineLocal(ymd, s.end_time),
            location: s.location ?? input.defaultLocation ?? null,
          });
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function summarizeByWeekday(occurrences: GeneratedOccurrence[]): Record<number, number> {
  const r: Record<number, number> = {};
  for (const o of occurrences) r[o.weekday] = (r[o.weekday] ?? 0) + 1;
  return r;
}
