// Farm wall-clock helpers. Timestamps are stored as UTC-looking values that mean "farm local time".
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = (x) => new Date(typeof x === 'string' ? Date.parse(x.length === 10 ? x + 'T00:00:00Z' : x + 'Z') : x);

export const fmtDay = (x) => { const d = toDate(x); return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`; };
export const fmtMonthDay = (x) => { const d = toDate(x); return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`; };
export const fmtWeekday = (x) => WD[toDate(x).getUTCDay()];
export const fmtTime = (ms) => {
  const d = new Date(ms); const h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtDayTime = (ms) => `${fmtDay(ms)}, ${fmtTime(ms)}`;
export const timeInput = (ms) => new Date(ms).toISOString().slice(11, 16);
export const dateInput = (ms) => new Date(ms).toISOString().slice(0, 10);
export const clock = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
