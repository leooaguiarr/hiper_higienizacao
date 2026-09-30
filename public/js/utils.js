// Formatadores e helpers puros compartilhados pelos demais módulos.

export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
export const fullDateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
export const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function localISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function parseDate(value) {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
export function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
export function addMonths(date, months) { const result = new Date(date); result.setMonth(result.getMonth() + months); return result; }
export function startOfWeek(date) { const result = new Date(date); result.setDate(result.getDate() - result.getDay()); result.setHours(0,0,0,0); return result; }
export function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
export function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
export function esc(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
export function phoneDigits(phone) { return String(phone || '').replace(/\D/g, ''); }
export function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''; }

export function whatsappLink(phone, text = '') {
  const number = phoneDigits(phone);
  if (!number) return '#';
  const param = text ? `&text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/55${number}?${param}`;
}

export function maskPhone(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length > 10) v = `${v.slice(0, 10)}-${v.slice(10)}`;
  else if (v.length > 9) v = `${v.slice(0, 9)}-${v.slice(9)}`;
  return v;
}

export function maskCep(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length > 8) v = v.slice(0, 8);
  if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
  return v;
}

export function maskCpf(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
  else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
  return v;
}

export function maskCnpj(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length > 14) v = v.slice(0, 14);
  if (v.length > 12) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
  else if (v.length > 8) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
  else if (v.length > 5) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
  else if (v.length > 2) v = `${v.slice(0, 2)}.${v.slice(2)}`;
  return v;
}

export function maskCpfCnpj(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length <= 11) return maskCpf(v);
  return maskCnpj(v);
}

export function maskCurrency(value) {
  let v = String(value).replace(/\D/g, '');
  if (!v) return '';
  v = (Number(v) / 100).toFixed(2);
  v = v.replace('.', ',');
  v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
  return v;
}

export function parseCurrency(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  let v = String(value).replace(/\./g, '').replace(',', '.');
  return Number(v) || 0;
}

export function getBirthdayInfo(birthDateStr) {
  if (!birthDateStr) return null;
  const parts = String(birthDateStr).slice(0, 10).split('-').map(Number);
  if (parts.length < 3) return null;
  const [bYear, bMonth, bDay] = parts;
  if (!bMonth || !bDay) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentYear = today.getFullYear();
  let nextBday = new Date(currentYear, bMonth - 1, bDay, 0, 0, 0);

  if (nextBday < today) {
    nextBday = new Date(currentYear + 1, bMonth - 1, bDay, 0, 0, 0);
  }

  const diffMs = nextBday.getTime() - today.getTime();
  const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const ageTurning = bYear > 1900 ? nextBday.getFullYear() - bYear : null;
  const isThisMonth = (bMonth - 1) === today.getMonth();

  return {
    day: bDay,
    month: bMonth,
    daysUntil,
    ageTurning,
    isThisMonth,
    isToday: daysUntil === 0,
    isTomorrow: daysUntil === 1,
    nextDate: nextBday
  };
}

export function googleCalendarLink({ title, date, time, duration = 120, address = '', details = '' }) {
  if (!date || !time) return '#';
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0);
  const end = new Date(start.getTime() + (Number(duration) || 120) * 60000);

  const pad = n => String(n).padStart(2, '0');
  const formatGCal = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const dates = `${formatGCal(start)}/${formatGCal(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Agendamento Hiper Higienizações',
    dates,
    details: details || '',
    location: address || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateIcsContent({ title, date, time, duration = 120, address = '', details = '' }) {
  if (!date || !time) return '';
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0);
  const end = new Date(start.getTime() + (Number(duration) || 120) * 60000);

  const pad = n => String(n).padStart(2, '0');
  const formatIcs = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hiper Higienizacoes//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@hiper`,
    `DTSTAMP:${formatIcs(new Date())}`,
    `DTSTART:${formatIcs(start)}`,
    `DTEND:${formatIcs(end)}`,
    `SUMMARY:${title || 'Agendamento Hiper'}`,
    `DESCRIPTION:${(details || '').replace(/\r?\n/g, '\\n')}`,
    `LOCATION:${address || ''}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

export function downloadIcs(eventData, filename = 'agendamento-hiper.ics') {
  const content = generateIcsContent(eventData);
  if (!content) return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

