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
  return v;
}

export function maskCpfCnpj(value) {
  let v = String(value).replace(/\D/g, '');
  if (v.length <= 11) {
    if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
    else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
    else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
  } else {
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 12) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
    else if (v.length > 8) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
    else if (v.length > 5) v = `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
    else if (v.length > 2) v = `${v.slice(0, 2)}.${v.slice(2)}`;
  }
  return v;
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
