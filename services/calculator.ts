import { addDays, subDays, isSameDay, isWeekend, getDay, isAfter, isBefore, parseISO, startOfDay, eachMonthOfInterval, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { AppFormData, CalculationResult, CalendarDay, DayType, HolidayReportItem } from '../types';
import { HOURS_PER_DAY } from '../constants';
import { getHolidayInfo } from '../utils/dateUtils';

// Returns the date of the Nth weekday (Mon-Fri) counting from `start` (inclusive).
// Weekends are skipped when counting, but the window length is otherwise fixed -
// holidays landing on a counted weekday do NOT push the window further.
const nthWeekdayFrom = (start: Date, n: number): Date => {
  let count = 0;
  let d = start;
  while (true) {
    if (!isWeekend(d)) {
      count++;
      if (count >= n) return d;
    }
    d = addDays(d, 1);
  }
};

// Monday of the calendar week containing `d` (weeks run Mon-Sun).
const mondayOfWeek = (d: Date): Date => {
  const day = getDay(d); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
};

interface ImmersionWindow {
  start: Date;
  end: Date;
}

interface SimulationResult {
  calendar: CalendarDay[];
  endDate: Date;
  holidayReport: HolidayReportItem[];
  finalImmersionStart: Date | null;
}

// Runs the full day-by-day simulation. When `finalImmersionWindow` is null, the final
// immersion is triggered dynamically (once weekly theory hours + practice hours are
// both done) - used as an estimation pass to find roughly when it should start. When a
// window is provided, final immersion is pinned to those exact dates instead (real run).
const runSimulation = (
  data: AppFormData,
  startDate: Date,
  initialImmersionWindow: ImmersionWindow | null,
  finalImmersionWindow: ImmersionWindow | null
): SimulationResult => {
  const recessStart = data.recessStart ? startOfDay(parseISO(data.recessStart)) : null;
  const recessEnd = data.recessEnd ? startOfDay(parseISO(data.recessEnd)) : null;

  let theoryHoursConsumed = 0;
  let practiceHoursConsumed = 0;

  let loopTheoryHours = 0;
  let loopPracticeHours = 0;

  const calendar: CalendarDay[] = [];
  const holidayReport: HolidayReportItem[] = [];

  let currentDate = startDate;
  let finalImmersionStart: Date | null = null;

  let safetyCounter = 0;
  const MAX_DAYS = 365 * 5;

  const isLoopTheoryFull = () => loopTheoryHours >= data.totalTheoryHours;
  const isLoopPracticeFull = () => loopPracticeHours >= data.totalPracticeHours;

  const overrideDates = Object.keys(data.overrides || {}).map(d => parseISO(d));
  const lastOverrideDate = overrideDates.length > 0 ? new Date(Math.max(...overrideDates.map(d => d.getTime()))) : null;

  const initialImmersionHours = data.immersionDays * HOURS_PER_DAY;
  const hoursForFinalImmersion = data.immersionDaysEnd * HOURS_PER_DAY;

  const inWindow = (date: Date, w: ImmersionWindow | null) =>
    !!w && (isAfter(date, w.start) || isSameDay(date, w.start)) && (isBefore(date, w.end) || isSameDay(date, w.end));

  // Terminal condition: with a fixed final immersion window, the contract is done once
  // that window has been fully processed (final immersion is always the last block).
  // Without one (estimation pass), keep going until both hour totals are met, like before.
  const shouldContinue = () => {
    if (safetyCounter >= MAX_DAYS) return false;
    if (finalImmersionWindow) {
      if (isAfter(currentDate, finalImmersionWindow.end)) return false;
      return true;
    }
    const hoursNotFull = !isLoopTheoryFull() || !isLoopPracticeFull();
    const beforeLastOverride = lastOverrideDate ? (isBefore(currentDate, lastOverrideDate) || isSameDay(currentDate, lastOverrideDate)) : false;
    return hoursNotFull || beforeLastOverride;
  };

  while (shouldContinue()) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const manualOverride = data.overrides?.[dateKey];

    const isWknd = isWeekend(currentDate);
    const holidayInfo = getHolidayInfo(currentDate, data.city, data.state, data.excludedHolidays);
    const weekday = getDay(currentDate); // 0=Sun, 1=Mon...

    let isRecessPeriod = false;
    if (recessStart && recessEnd) {
      if ((isAfter(currentDate, recessStart) || isSameDay(currentDate, recessStart)) &&
          (isBefore(currentDate, recessEnd) || isSameDay(currentDate, recessEnd))) {
        isRecessPeriod = true;
      }
    }

    let isBridgeHoliday = false;
    if (data.adhereBridgeHolidays && !holidayInfo && !isWknd) {
      if (weekday === 1) {
        const tuesday = addDays(currentDate, 1);
        if (getHolidayInfo(tuesday, data.city, data.state, data.excludedHolidays)) isBridgeHoliday = true;
      } else if (weekday === 5) {
        const thursday = subDays(currentDate, 1);
        if (getHolidayInfo(thursday, data.city, data.state, data.excludedHolidays)) isBridgeHoliday = true;
      }
    }

    let dayType: DayType = DayType.WEEKEND;
    let description = '';
    let modality = undefined;

    // --- DETERMINE SCHEDULED ACTIVITY (Natural Progression) ---
    let scheduledType: 'THEORY' | 'PRACTICE' = 'PRACTICE';
    let scheduledDesc = '';
    let scheduledModality = undefined;

    const isInitialImmersionPhase = inWindow(currentDate, initialImmersionWindow);

    let isFinalImmersionPhase: boolean;
    if (finalImmersionWindow) {
      isFinalImmersionPhase = inWindow(currentDate, finalImmersionWindow);
    } else {
      // Estimation pass: trigger dynamically once weekly theory + practice are both done.
      const theoryHoursRemaining = data.totalTheoryHours - loopTheoryHours;
      const isPracticeDoneForFinalImmersion = data.totalPracticeHours <= 0 || loopPracticeHours >= data.totalPracticeHours;
      isFinalImmersionPhase =
          !isInitialImmersionPhase &&
          hoursForFinalImmersion > 0 &&
          loopTheoryHours < data.totalTheoryHours &&
          theoryHoursRemaining <= hoursForFinalImmersion &&
          isPracticeDoneForFinalImmersion;
    }

    if (isFinalImmersionPhase && finalImmersionStart === null) {
      finalImmersionStart = new Date(currentDate);
    }

    if (isInitialImmersionPhase) {
        scheduledType = 'THEORY';
        dayType = DayType.IMMERSION;
        scheduledDesc = 'Imersão Inicial';
        scheduledModality = data.modalityInitial;
    } else if (isFinalImmersionPhase) {
        scheduledType = 'THEORY';
        dayType = DayType.IMMERSION;
        scheduledDesc = 'Imersão Final';
        scheduledModality = data.modalityFinal;
    } else {
        if (weekday === data.weeklyCourseDay) {
            // Weekly theory hours still owed after subtracting what immersion covers.
            const weeklyTheoryTarget = Math.max(0, data.totalTheoryHours - initialImmersionHours - hoursForFinalImmersion);
            const weeklyTheoryConsumed = Math.max(0, loopTheoryHours - initialImmersionHours);
            const weeklyTheoryPending = weeklyTheoryTarget > 0 && weeklyTheoryConsumed < weeklyTheoryTarget;

            // Spread the weekly theory day across the whole contract at the same pace as
            // practice hours accumulate, instead of depleting all weekly theory hours as
            // fast as possible and leaving a practice-only tail with no theoretical activity.
            const theoryOnPace = data.totalPracticeHours <= 0 ||
                (weeklyTheoryConsumed / weeklyTheoryTarget) <= (loopPracticeHours / data.totalPracticeHours);

            if (weeklyTheoryPending && theoryOnPace) {
                scheduledType = 'THEORY';
                scheduledModality = data.modalityWeekly;
            } else {
                scheduledType = 'PRACTICE';
            }
        } else {
            scheduledType = 'PRACTICE';
        }
    }

    // --- PROCESSING THE DAY ---

    if (manualOverride) {
      dayType = manualOverride.type;
      description = 'Alteração Manual';

      // Manual overrides no longer impact consumed hours as per user request
      // The summary must match the input hours exactly.

      // Increment loop counters as if it were natural to prevent extension
      if (!holidayInfo && !isWknd) {
        if (scheduledType === 'THEORY' && !isLoopTheoryFull()) {
          loopTheoryHours += HOURS_PER_DAY;
        } else if (scheduledType === 'PRACTICE' && !isLoopPracticeFull()) {
          loopPracticeHours += HOURS_PER_DAY;
        }
      } else if (holidayInfo && !isWknd && data.holidayImpact === 'NO_IMPACT') {
        if (scheduledType === 'THEORY' && !isLoopTheoryFull()) {
          loopTheoryHours += HOURS_PER_DAY;
        }
      }

    } else if (holidayInfo) {
      dayType = DayType.HOLIDAY;
      description = holidayInfo.name;
      holidayReport.push({
        date: new Date(currentDate),
        name: holidayInfo.name,
        type: holidayInfo.type
      });

      if (!isWknd) {
         if (data.holidayImpact === 'NO_IMPACT') {
             if (scheduledType === 'THEORY' && !isLoopTheoryFull()) {
                 theoryHoursConsumed += HOURS_PER_DAY;
                 loopTheoryHours += HOURS_PER_DAY;
             }
         }
      }

    } else if (isWknd) {
      dayType = DayType.WEEKEND;
    } else {
      // Valid Work Day
      if (scheduledType === 'THEORY') {
          if (isInitialImmersionPhase || isFinalImmersionPhase) {
              // Immersion is an intensive, pre-committed block: recess and bridge
              // holidays only interrupt the ongoing weekly routine, never immersion -
              // and immersion never extends past its fixed window either.
              dayType = DayType.IMMERSION;
              description = scheduledDesc;
              modality = scheduledModality;
              if (!isLoopTheoryFull()) {
                theoryHoursConsumed += HOURS_PER_DAY;
                loopTheoryHours += HOURS_PER_DAY;
              }
          } else if (!isLoopTheoryFull() && isRecessPeriod) {
              dayType = DayType.THEORY_RECESS;
              description = 'Recesso Teórico';
              if (data.recessImpact === 'NO_IMPACT') {
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
              practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY; // Recesso teórico geralmente implica prática na empresa
          } else if (!isLoopTheoryFull() && isBridgeHoliday) {
              dayType = DayType.THEORY_RECESS;
              description = 'Emenda de Feriado';
              if (data.bridgeHolidayImpact === 'NO_IMPACT') {
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
              practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY;
          } else if (!isLoopTheoryFull()) {
              dayType = DayType.THEORY;
              description = scheduledDesc;
              modality = scheduledModality;
              theoryHoursConsumed += HOURS_PER_DAY;
              loopTheoryHours += HOURS_PER_DAY;
          } else {
              dayType = DayType.PRACTICE;
              description = 'Atividade Prática (Carga Teórica Finalizada)';
              practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY;
          }
      } else {
          dayType = DayType.PRACTICE;
          description = scheduledDesc;
          practiceHoursConsumed += HOURS_PER_DAY;
          loopPracticeHours += HOURS_PER_DAY;
      }
    }

    calendar.push({
      date: new Date(currentDate),
      dayType,
      description,
      isStart: isSameDay(currentDate, startDate),
      modality
    });

    currentDate = addDays(currentDate, 1);
    safetyCounter++;
  }

  // Determine End Date
  let lastActivityIndex = -1;
  for (let i = calendar.length - 1; i >= 0; i--) {
    if (calendar[i].dayType === DayType.THEORY ||
        calendar[i].dayType === DayType.PRACTICE ||
        calendar[i].dayType === DayType.THEORY_RECESS ||
        calendar[i].dayType === DayType.IMMERSION) {
      lastActivityIndex = i;
      break;
    }
  }
  if (lastActivityIndex !== -1) calendar[lastActivityIndex].isEnd = true;
  const endDate = lastActivityIndex !== -1 ? calendar[lastActivityIndex].date : startDate;

  return { calendar, endDate, holidayReport, finalImmersionStart };
};

export const calculateCalendar = (data: AppFormData): CalculationResult => {
  const startDate = startOfDay(parseISO(data.startDate));

  // Immersion (initial and final) is a fixed span of `immersionDays`/`immersionDaysEnd`
  // WEEKDAYS - holidays or bridge days landing inside never push it further.
  const initialImmersionWindow: ImmersionWindow | null = data.immersionDays > 0
    ? { start: startDate, end: nthWeekdayFrom(startDate, data.immersionDays) }
    : null;

  let finalImmersionWindow: ImmersionWindow | null = null;

  if (data.immersionDaysEnd > 0) {
    // Pass 1: estimate where Final Immersion would naturally fall (dynamic trigger).
    const estimate = runSimulation(data, startDate, initialImmersionWindow, null);

    if (estimate.finalImmersionStart) {
      // Snap Final Immersion to start on a Monday - whichever is closer (this week's or
      // next week's), extending or shortening the contract by a few days as needed - so
      // the final `immersionDaysEnd` weekdays always land as clean Mon-Fri work weeks.
      const mondayThisWeek = mondayOfWeek(estimate.finalImmersionStart);
      const daysFromMonday = differenceInCalendarDays(estimate.finalImmersionStart, mondayThisWeek);
      const targetMonday = daysFromMonday <= 3 ? mondayThisWeek : addDays(mondayThisWeek, 7);

      finalImmersionWindow = { start: targetMonday, end: nthWeekdayFrom(targetMonday, data.immersionDaysEnd) };
    }
  }

  // Pass 2: real run, with Final Immersion pinned to its Monday-aligned window.
  const { calendar, endDate, holidayReport } = runSimulation(data, startDate, initialImmersionWindow, finalImmersionWindow);

  if (data.recessStart && data.recessEnd) {
    const recessStart = startOfDay(parseISO(data.recessStart));
    const recessEnd = startOfDay(parseISO(data.recessEnd));
    holidayReport.push({
        date: recessStart,
        name: `Início do Recesso Escolar (até ${recessEnd.toLocaleDateString('pt-BR')})`,
        type: 'RECESS'
    });
  }

  // Stats - Forced to match input as per user request
  const totalDaysTheory = Math.round(data.totalTheoryHours / HOURS_PER_DAY);
  const totalDaysPractice = Math.round(data.totalPracticeHours / HOURS_PER_DAY);

  const totalDaysRecess = calendar.filter(d => d.dayType === DayType.RECESS).length;
  const totalDaysHoliday = calendar.filter(d => d.dayType === DayType.HOLIDAY).length;

  const monthsSpanned = eachMonthOfInterval({
    start: startOfMonth(startDate),
    end: endOfMonth(addDays(endDate, 1)) // Ensure we see the full month of the end date
  });

  // Add one extra month to allow clicking "blank" days for extension
  const lastMonth = monthsSpanned[monthsSpanned.length - 1];
  monthsSpanned.push(startOfMonth(addDays(endOfMonth(lastMonth), 1)));

  holidayReport.sort((a, b) => a.date.getTime() - b.date.getTime());
  const uniqueReport = holidayReport.filter((v, i, a) =>
    a.findIndex(t => t.date.getTime() === v.date.getTime() && t.name === v.name) === i
  );

  return {
    calendar,
    endDate,
    totalDaysTheory,
    totalDaysPractice,
    totalDaysRecess,
    totalDaysHoliday,
    monthsSpanned,
    holidayReport: uniqueReport
  };
};
