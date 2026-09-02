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
