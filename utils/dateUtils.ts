
import { addDays, isSameDay, subDays, startOfYear, endOfYear, eachDayOfInterval, format, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Calculate Easter date using Meeus/Jones/Butcher's algorithm
export const getEasterDate = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
};

export interface HolidayInfo {
  date: Date;
  name: string;
  type: 'NATIONAL' | 'ESTADUAL' | 'MUNICIPAL';
}

// Expanded Data for Capitals/States - MOCK DATA
// Note: In a real production app, this would be a database or external API.
const MUNICIPAL_DATA: Record<string, { stateHolidays: {m:number, d:number, name:string}[], cities: Record<string, {m:number, d:number, name:string}[]> }> = {
  'SP': {
    stateHolidays: [{ m: 6, d: 9, name: 'Revolução Constitucionalista' }],
    cities: {
      'SÃO PAULO': [{ m: 0, d: 25, name: 'Aniversário de São Paulo' }], // Consciencia Negra is now National
      'CAMPINAS': [{ m: 11, d: 8, name: 'Nossa Senhora da Conceição' }]
    }
  },
  'RJ': {
    stateHolidays: [{ m: 3, d: 23, name: 'Dia de São Jorge' }], // Zumbi is now National
    cities: { 'RIO DE JANEIRO': [{ m: 0, d: 20, name: 'São Sebastião' }] }
  },
  'MG': { stateHolidays: [{ m: 3, d: 21, name: 'Data Magna de MG' }], cities: { 'BELO HORIZONTE': [{ m: 7, d: 15, name: 'Assunção de Nossa Senhora' }, { m: 11, d: 8, name: 'Imaculada Conceição' }] } },
  'ES': { stateHolidays: [], cities: { 'VITÓRIA': [{ m: 8, d: 8, name: 'Nossa Senhora da Vitória' }] } },
  'PR': { stateHolidays: [], cities: { 'CURITIBA': [{ m: 8, d: 8, name: 'Nossa Senhora da Luz dos Pinhais' }] } },
  'SC': { stateHolidays: [{ m: 7, d: 11, name: 'Criação da Capitania' }], cities: { 'FLORIANÓPOLIS': [{ m: 2, d: 23, name: 'Aniversário de Florianópolis' }] } },
  'RS': { stateHolidays: [{ m: 8, d: 20, name: 'Revolução Farroupilha' }], cities: { 'PORTO ALEGRE': [{ m: 1, d: 2, name: 'Nossa Senhora dos Navegantes' }] } },
  'BA': { stateHolidays: [{ m: 6, d: 2, name: 'Independência da Bahia' }], cities: { 'SALVADOR': [{ m: 5, d: 24, name: 'São João' }, { m: 11, d: 8, name: 'Nossa Senhora da Conceição' }] } },
  'PE': { stateHolidays: [{ m: 2, d: 6, name: 'Data Magna' }], cities: { 'RECIFE': [{ m: 6, d: 16, name: 'Nossa Senhora do Carmo' }] } },
  'CE': { stateHolidays: [{ m: 2, d: 25, name: 'Data Magna' }], cities: { 'FORTALEZA': [{ m: 7, d: 15, name: 'Nossa Senhora da Assunção' }] } },
  'DF': { stateHolidays: [{ m: 3, d: 21, name: 'Fundação de Brasília' }, { m: 10, d: 30, name: 'Dia do Evangélico' }], cities: { 'BRASÍLIA': [] } },
  'GO': { stateHolidays: [], cities: { 'GOIÂNIA': [{ m: 9, d: 24, name: 'Aniversário de Goiânia' }] } },
  'AM': { stateHolidays: [{ m: 8, d: 5, name: 'Elevação do Amazonas' }], cities: { 'MANAUS': [{ m: 9, d: 24, name: 'Aniversário de Manaus' }] } },
  'PA': { stateHolidays: [{ m: 7, d: 15, name: 'Adesão do Grão-Pará' }], cities: { 'BELÉM': [{ m: 0, d: 12, name: 'Aniversário de Belém' }] } },
  // ... Fallbacks would go here
};

export const getHolidaysForYear = (year: number, city: string, state: string): HolidayInfo[] => {
  const easter = getEasterDate(year);
  const carnaval = subDays(easter, 47);
  const corpusChristi = addDays(easter, 60);
  const goodFriday = subDays(easter, 2);

  const holidays: HolidayInfo[] = [
    { date: new Date(year, 0, 1), name: 'Confraternização Universal', type: 'NATIONAL' },
    { date: new Date(year, 3, 21), name: 'Tiradentes', type: 'NATIONAL' },
    { date: new Date(year, 4, 1), name: 'Dia do Trabalho', type: 'NATIONAL' },
    { date: new Date(year, 8, 7), name: 'Independência do Brasil', type: 'NATIONAL' },
    { date: new Date(year, 9, 12), name: 'Nossa Senhora Aparecida', type: 'NATIONAL' },
    { date: new Date(year, 10, 2), name: 'Finados', type: 'NATIONAL' },
    { date: new Date(year, 10, 15), name: 'Proclamação da República', type: 'NATIONAL' },
    { date: new Date(year, 11, 25), name: 'Natal', type: 'NATIONAL' },
    { date: carnaval, name: 'Carnaval', type: 'NATIONAL' },
    { date: goodFriday, name: 'Sexta-feira Santa', type: 'NATIONAL' },
    { date: corpusChristi, name: 'Corpus Christi', type: 'NATIONAL' },
  ];

  // Consciencia Negra is National from 2024 onwards
  if (year >= 2024) {
    holidays.push({ date: new Date(year, 10, 20), name: 'Dia da Consciência Negra', type: 'NATIONAL' });
  }

  const stateData = MUNICIPAL_DATA[state.toUpperCase()];
  if (stateData) {
    stateData.stateHolidays.forEach(h => {
      // Avoid duplicate Consciencia Negra if it was listed as state holiday previously
      if (h.m === 10 && h.d === 20 && year >= 2024) return;
      holidays.push({ date: new Date(year, h.m, h.d), name: h.name, type: 'ESTADUAL' });
    });

    const cityData = stateData.cities[city.toUpperCase()];
    if (cityData) {
      cityData.forEach(h => {
         if (h.m === 10 && h.d === 20 && year >= 2024) return;
         holidays.push({ date: new Date(year, h.m, h.d), name: h.name, type: 'MUNICIPAL' });
      });
    }
  }

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const getHolidayInfo = (date: Date, city: string, state: string, excludedHolidays: string[] = []): HolidayInfo | null => {
  const year = date.getFullYear();
  const dateStr = date.toISOString().split('T')[0];
  if (excludedHolidays.includes(dateStr)) return null;

  const holidays = getHolidaysForYear(year, city, state);
  return holidays.find(h => isSameDay(h.date, date)) || null;
};

// Helper to generate potential holidays for UI selection spanning multiple years
export const getPotentialHolidays = (startYear: number, endYear: number, city: string, state: string): HolidayInfo[] => {
  let all: HolidayInfo[] = [];
  for (let y = startYear; y <= endYear; y++) {
    all = [...all, ...getHolidaysForYear(y, city, state)];
  }
  return all;
};

// School recess default: always the last 3 weeks of December, starting on a Monday and
// ending on the Friday closest to the first weekday (Mon-Fri) of January the next year.
export const getDefaultRecessWindow = (contractStartDate: Date): { start: string; end: string } => {
  const recessYear = contractStartDate.getFullYear();

  // First weekday (Mon-Fri) of January of the following year.
  let firstWeekdayOfJan = new Date(recessYear + 1, 0, 1);
  const janDow = getDay(firstWeekdayOfJan); // 0=Sun..6=Sat
  if (janDow === 0) firstWeekdayOfJan = addDays(firstWeekdayOfJan, 1); // Sun -> Mon
  else if (janDow === 6) firstWeekdayOfJan = addDays(firstWeekdayOfJan, 2); // Sat -> Mon

  // Nearest Friday to that weekday - either the Friday of its own week, or the previous one.
  const dow = getDay(firstWeekdayOfJan); // 1..5 (Mon..Fri)
  const fridayThisWeek = addDays(firstWeekdayOfJan, 5 - dow);
  const fridayPrevWeek = subDays(fridayThisWeek, 7);
  const distThis = 5 - dow;
  const distPrev = dow + 2;
  const recessEnd = distThis <= distPrev ? fridayThisWeek : fridayPrevWeek;

  // Start 3 full weeks earlier, on the Monday of that week.
  const mondayOfEndWeek = subDays(recessEnd, getDay(recessEnd) - 1);
  const recessStart = subDays(mondayOfEndWeek, 14);

  return { start: format(recessStart, 'yyyy-MM-dd'), end: format(recessEnd, 'yyyy-MM-dd') };
};
