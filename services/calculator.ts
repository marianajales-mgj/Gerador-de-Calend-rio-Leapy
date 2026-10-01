import { addDays, subDays, isSameDay, isWeekend, getDay, isAfter, isBefore, parseISO, startOfDay, eachMonthOfInterval, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { AppFormData, CalculationResult, CalendarDay, DayType, HolidayReportItem } from '../types';
import { HOURS_PER_DAY } from '../constants';
import { getHolidayInfo, getDefaultRecessWindow } from '../utils/dateUtils';

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

// True for a day that doesn't count as immersion attendance: weekend, national/state/
// municipal holiday, or (when the user adheres to bridge holidays) a Monday/Friday
// bridging into an adjacent Tue/Thu holiday.
const isNonAttendanceDay = (date: Date, data: AppFormData): boolean => {
  if (isWeekend(date)) return true;
  if (getHolidayInfo(date, data.city, data.state, data.excludedHolidays)) return true;
  if (data.adhereBridgeHolidays) {
    const weekday = getDay(date);
    if (weekday === 1 && getHolidayInfo(addDays(date, 1), data.city, data.state, data.excludedHolidays)) return true;
    if (weekday === 5 && getHolidayInfo(subDays(date, 1), data.city, data.state, data.excludedHolidays)) return true;
  }
  return false;
};

// Returns the date of the Nth actual attendance day counting from `start` (inclusive) -
// weekends, holidays and bridge days are skipped, so the window EXTENDS to make up for
// them instead of staying a fixed length. Used for a course whose immersion is a single
// initial block only (no final immersion): the location is only reachable on real
// business days, so a holiday inside must be made up with an extra day at the end.
const nthAttendanceDayFrom = (start: Date, n: number, data: AppFormData): Date => {
  let count = 0;
  let d = start;
  while (true) {
    if (!isNonAttendanceDay(d, data)) {
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
  theoryHoursConsumed: number;
  practiceHoursConsumed: number;
}

// Runs the full day-by-day simulation. When `finalImmersionWindow` is null, the final
// immersion is triggered dynamically (once weekly theory hours + practice hours are
// both done) - used as an estimation pass to find roughly when it should start. When a
// window is provided, final immersion is pinned to those exact dates instead (real run).
const runSimulation = (
  data: AppFormData,
  startDate: Date,
  initialImmersionWindow: ImmersionWindow | null,
  finalImmersionWindow: ImmersionWindow | null,
  recessWindows: ImmersionWindow[]
): SimulationResult => {
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
  // Gate the REAL (reported) hour counters specifically - once the official load is met,
  // further days keep their natural type (never blank) but stop adding to the report.
  const isPracticeFull = () => practiceHoursConsumed >= data.totalPracticeHours;

  const overrideDates = Object.keys(data.overrides || {}).map(d => parseISO(d));
  const lastOverrideDate = overrideDates.length > 0 ? new Date(Math.max(...overrideDates.map(d => d.getTime()))) : null;

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

    const isRecessPeriod = recessWindows.some(w =>
      (isAfter(currentDate, w.start) || isSameDay(currentDate, w.start)) &&
      (isBefore(currentDate, w.end) || isSameDay(currentDate, w.end))
    );

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
        // Whether more weekly theory is actually still owed: based on hours truly
        // credited so far (loopTheoryHours - e.g. less than nominal if a holiday was
        // lost inside Immersion's fixed, non-extending window) plus what Final
        // Immersion will still nominally contribute. This self-corrects for any
        // Immersion shortfall by running the weekly phase a little longer, WITHOUT
        // ever touching Immersion's own fixed date window.
        const weeklyTheoryPending = (loopTheoryHours + hoursForFinalImmersion) < data.totalTheoryHours;

        // The designated weekly course day is deterministic: THEORY on every occurrence
        // until the load is fully covered, then PRACTICE for the rest of the contract.
        // No pacing/throttling here - skipping a contracted class day for scheduling
        // reasons isn't acceptable, the day is fixed by contract.
        if (weekday === data.weeklyCourseDay && weeklyTheoryPending) {
            scheduledType = 'THEORY';
            scheduledModality = data.modalityWeekly;
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
      } else if (holidayInfo && !isWknd && !isInitialImmersionPhase && !isFinalImmersionPhase && data.holidayImpact === 'NO_IMPACT') {
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

      // holidayImpact governs the ongoing weekly routine only. A holiday inside an
      // Immersion window must never credit hours here - Immersion's own window sizing
      // (extends for a Presencial-format course, stays fixed for a Híbrido one) is the
      // only thing that determines its credited hours; crediting it again here would
      // double-count the day the window already compensated for (or double-lose it).
      if (!isWknd && !isInitialImmersionPhase && !isFinalImmersionPhase) {
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
              // Recesso teórico geralmente implica prática na empresa - but never credit
              // (report) practice hours past the official target, even though the day is
              // still genuinely worked (never left blank).
              if (!isPracticeFull()) practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY;
          } else if (!isLoopTheoryFull() && isBridgeHoliday) {
              dayType = DayType.THEORY_RECESS;
              description = 'Emenda de Feriado';
              if (data.bridgeHolidayImpact === 'NO_IMPACT') {
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
              if (!isPracticeFull()) practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY;
          } else if (!isLoopTheoryFull()) {
              dayType = DayType.THEORY;
              description = scheduledDesc;
              modality = scheduledModality;
              theoryHoursConsumed += HOURS_PER_DAY;
              loopTheoryHours += HOURS_PER_DAY;
          } else {
              // Theory's official load is already met. The apprentice is still genuinely
              // at the company this day (never shown as blank), but once practice's own
              // official load is also already met, this day no longer adds to the
              // reported real hours - it's calendar time spent waiting for the fixed
              // Immersion window or the natural end date, not additional required load.
              dayType = DayType.PRACTICE;
              description = 'Atividade Prática (Carga Teórica Finalizada)';
              if (!isPracticeFull()) practiceHoursConsumed += HOURS_PER_DAY;
              loopPracticeHours += HOURS_PER_DAY;
          }
      } else {
          dayType = DayType.PRACTICE;
          description = scheduledDesc;
          if (!isPracticeFull()) practiceHoursConsumed += HOURS_PER_DAY;
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

  return { calendar, endDate, holidayReport, finalImmersionStart, theoryHoursConsumed, practiceHoursConsumed };
};

export const calculateCalendar = (data: AppFormData): CalculationResult => {
  const startDate = startOfDay(parseISO(data.startDate));

  // School recess recurs every December for as long as the contract runs, not just once -
  // a contract spanning more than one calendar year must get a recess window for each
  // December it touches. The first window honors whatever the user set (incl. manual
  // edits); subsequent years reuse the same last-3-weeks-of-December formula.
  const recessWindows: ImmersionWindow[] = [];
  if (data.recessStart && data.recessEnd) {
    const firstStart = startOfDay(parseISO(data.recessStart));
    const firstEnd = startOfDay(parseISO(data.recessEnd));
    recessWindows.push({ start: firstStart, end: firstEnd });

    const firstYear = firstStart.getFullYear();
    for (let i = 1; i <= 4; i++) {
      const w = getDefaultRecessWindow(new Date(firstYear + i, 0, 1));
      recessWindows.push({ start: startOfDay(parseISO(w.start)), end: startOfDay(parseISO(w.end)) });
    }
  }
  const isInRecess = (date: Date): boolean =>
    recessWindows.some(r => (isAfter(date, r.start) || isSameDay(date, r.start)) && (isBefore(date, r.end) || isSameDay(date, r.end)));

  // Two different immersion shapes, per course format:
  // - Hybrid course (immersionDaysEnd > 0: initial + final Presencial immersion): both are
  //   a FIXED span of weekdays - a holiday inside never pushes the window further.
  // - Presencial-format course (immersionDaysEnd === 0: a single Online initial immersion
  //   only): the window EXTENDS through holidays/emendas, since it needs that many actual
  //   attendance days.
  const isHybridImmersionShape = data.immersionDaysEnd > 0;
  const initialImmersionWindow: ImmersionWindow | null = data.immersionDays > 0
    ? {
        start: startDate,
        end: isHybridImmersionShape
          ? nthWeekdayFrom(startDate, data.immersionDays)
          : nthAttendanceDayFrom(startDate, data.immersionDays, data),
      }
    : null;

  let finalImmersionWindow: ImmersionWindow | null = null;

  if (data.immersionDaysEnd > 0) {
    // Pass 1: estimate where Final Immersion would naturally fall (dynamic trigger).
    const estimate = runSimulation(data, startDate, initialImmersionWindow, null, recessWindows);

    if (estimate.finalImmersionStart) {
      // Snap Final Immersion to start on a Monday - but only ever FORWARD, never earlier.
      // estimate.finalImmersionStart is the earliest day where practice hours are already
      // fully accrued; picking an earlier Monday would start Immersion (a fixed, non-
      // extending block) before practice is done, permanently losing those hours since no
      // days remain afterward to make them up. Moving later only ever adds slack, never
      // takes hours away - so it's the safe direction whenever the natural date isn't
      // already a Monday.
      const mondayThisWeek = mondayOfWeek(estimate.finalImmersionStart);
      const daysFromMonday = differenceInCalendarDays(estimate.finalImmersionStart, mondayThisWeek);
      let targetMonday = daysFromMonday === 0 ? mondayThisWeek : addDays(mondayThisWeek, 7);
      let candidate: ImmersionWindow = { start: targetMonday, end: nthWeekdayFrom(targetMonday, data.immersionDaysEnd) };

      // Final Immersion is a fixed, intensive presencial block - it must never overlap any
      // school recess (the apprentice's own scheduled break, recurring every December). If
      // the natural Monday-aligned window falls on or inside a recess, push it forward to
      // the Monday right after that recess ends instead of letting it silently swallow
      // recess days.
      let recessGuard = 0;
      while (recessGuard < 10) {
        const overlapping = recessWindows.filter(r =>
          (isBefore(candidate.start, r.end) || isSameDay(candidate.start, r.end)) &&
          (isAfter(candidate.end, r.start) || isSameDay(candidate.end, r.start))
        );
        if (overlapping.length === 0) break;
        const latestEnd = overlapping.reduce((max, r) => isAfter(r.end, max) ? r.end : max, overlapping[0].end);
        targetMonday = addDays(mondayOfWeek(latestEnd), 7);
        candidate = { start: targetMonday, end: nthWeekdayFrom(targetMonday, data.immersionDaysEnd) };
        recessGuard++;
      }

      finalImmersionWindow = candidate;
    }
  }

  // Pass 2: real run, with Final Immersion pinned to its Monday-aligned window.
  const pass2 = runSimulation(data, startDate, initialImmersionWindow, finalImmersionWindow, recessWindows);
  const { calendar, holidayReport } = pass2;
  let endDate = pass2.endDate;
  let theoryHoursConsumed = pass2.theoryHoursConsumed;
  let practiceHoursConsumed = pass2.practiceHoursConsumed;

  // Top-up: Final Immersion's window is fixed (Híbrido must never extend it past its
  // 10-corridos/2-semanas shape), so a holiday landing inside it eats real hours with
  // nothing left afterward to compensate - the only case the "self-correcting" weekly
  // pacing above can't reach. Close that specific gap with extra days appended right
  // after the calendar's natural end, never touching Immersion's own dates and never
  // leaving a blank day. Theory reposição keeps to the contract's own weekly course day
  // (theory only ever happens on that fixed weekday); practice has no such restriction.
  let topUpDate = addDays(endDate, 1);
  let safetyTopUp = 0;
  while (theoryHoursConsumed < data.totalTheoryHours && safetyTopUp < 120) {
    if (getDay(topUpDate) === data.weeklyCourseDay && !isNonAttendanceDay(topUpDate, data) && !isInRecess(topUpDate)) {
      calendar.forEach(d => { d.isEnd = false; });
      calendar.push({ date: new Date(topUpDate), dayType: DayType.THEORY, description: 'Reposição de Carga Teórica', modality: data.modalityWeekly, isEnd: true });
      theoryHoursConsumed += HOURS_PER_DAY;
      endDate = new Date(topUpDate);
    }
    topUpDate = addDays(topUpDate, 1);
    safetyTopUp++;
  }
  while (practiceHoursConsumed < data.totalPracticeHours && safetyTopUp < 240) {
    if (!isNonAttendanceDay(topUpDate, data) && !isInRecess(topUpDate)) {
      calendar.forEach(d => { d.isEnd = false; });
      calendar.push({ date: new Date(topUpDate), dayType: DayType.PRACTICE, description: 'Reposição de Carga Prática', isEnd: true });
      practiceHoursConsumed += HOURS_PER_DAY;
      endDate = new Date(topUpDate);
    }
    topUpDate = addDays(topUpDate, 1);
    safetyTopUp++;
  }

  // Only report recess windows that actually fall within the generated contract span -
  // recessWindows includes a few extra future years generated defensively, most of which
  // never apply to this particular contract.
  recessWindows.filter(w => !isAfter(w.start, endDate)).forEach(w => {
    holidayReport.push({
        date: w.start,
        name: `Início do Recesso Escolar (até ${w.end.toLocaleDateString('pt-BR')})`,
        type: 'RECESS'
    });
  });

  // Official stats - match the contract's input hours exactly (what goes on the PDF).
  const totalDaysTheory = Math.round(data.totalTheoryHours / HOURS_PER_DAY);
  const totalDaysPractice = Math.round(data.totalPracticeHours / HOURS_PER_DAY);

  // Real stats - what the day-by-day calendar actually adds up to (accounting for
  // holiday/recess/bridge impact rules), so a mismatch against the official hours above
  // is visible before finalizing the contract.
  const realTheoryHours = theoryHoursConsumed;
  const realPracticeHours = practiceHoursConsumed;
  const realDaysTheory = Math.round(realTheoryHours / HOURS_PER_DAY);
  const realDaysPractice = Math.round(realPracticeHours / HOURS_PER_DAY);

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
    holidayReport: uniqueReport,
    realTheoryHours,
    realPracticeHours,
    realDaysTheory,
    realDaysPractice,
  };
};
