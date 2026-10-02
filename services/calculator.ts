import { addDays, subDays, isSameDay, isWeekend, getDay, isAfter, isBefore, parseISO, startOfDay, eachMonthOfInterval, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { AppFormData, CalculationResult, CalendarDay, CreditBreakdown, DayType, HolidayReportItem } from '../types';
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

// A Monday/Friday that bridges into an adjacent Tue/Thu holiday ("emenda"), when the user
// adheres to bridge holidays. Never true for weekends or for a holiday itself.
const isBridgeHolidayDate = (date: Date, data: AppFormData): boolean => {
  if (!data.adhereBridgeHolidays || isWeekend(date)) return false;
  if (getHolidayInfo(date, data.city, data.state, data.excludedHolidays)) return false;
  const weekday = getDay(date);
  if (weekday === 1) return !!getHolidayInfo(addDays(date, 1), data.city, data.state, data.excludedHolidays);
  if (weekday === 5) return !!getHolidayInfo(subDays(date, 1), data.city, data.state, data.excludedHolidays);
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
  // Reserves room for Final Immersion's own fixed contribution: the ongoing weekly
  // course day stops crediting NEW theory hours once what's left to reach the official
  // load is small enough for Immersion alone to cover - otherwise the weekly day would
  // race past the point Immersion needs to still be "owed" hours, and Immersion's own
  // dynamic trigger (which requires loopTheoryHours < totalTheoryHours) would never fire.
  const isWeeklyTheoryQuotaOpen = () => (loopTheoryHours + hoursForFinalImmersion) < data.totalTheoryHours;

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

  // Index of the last calendar entry that actually credited hours (a holiday that counts
  // as a class day credits hours but isn't a THEORY/PRACTICE-typed square).
  let lastCreditedIndex = -1;

  while (shouldContinue()) {
    const theoryBefore = theoryHoursConsumed;
    const practiceBefore = practiceHoursConsumed;
    const creditedBefore = theoryBefore + practiceBefore;
    const dateKey = currentDate.toISOString().split('T')[0];
    const manualOverride = data.overrides?.[dateKey];

    const isWknd = isWeekend(currentDate);
    const holidayInfo = getHolidayInfo(currentDate, data.city, data.state, data.excludedHolidays);
    const weekday = getDay(currentDate); // 0=Sun, 1=Mon...

    const isRecessPeriod = recessWindows.some(w =>
      (isAfter(currentDate, w.start) || isSameDay(currentDate, w.start)) &&
      (isBefore(currentDate, w.end) || isSameDay(currentDate, w.end))
    );

    const isBridgeHoliday = isBridgeHolidayDate(currentDate, data);

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
        // The designated weekly course day is a standing weekly commitment for the whole
        // contract, not just until the official theory load is technically covered: by
        // rule the apprentice can never have a practice-only week (1x theory + 4x
        // practice, never 5x practice). It always stays THEORY-track, even once Immersion
        // has already delivered the full official load - see the matching fallback branch
        // below in day processing that keeps it visually THEORY without adding more hours.
        if (weekday === data.weeklyCourseDay) {
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
             if (scheduledType === 'THEORY' && isWeeklyTheoryQuotaOpen()) {
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
          if (isInitialImmersionPhase && data.immersionDaysEnd === 0 && isBridgeHoliday) {
              // Presencial-format initial immersion EXTENDS past holidays and emendas (the
              // window was sized to N real attendance days), so an emenda inside it is not
              // an immersion day: it credits no hours at all (the window was extended to
              // compensate it).
              dayType = DayType.THEORY_RECESS;
              description = 'Emenda de Feriado';
          } else if (isInitialImmersionPhase || isFinalImmersionPhase) {
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
          } else if (isRecessPeriod) {
              // School recess applies to the course day in EVERY December of the contract,
              // whether or not the official theory load is already covered - the class
              // itself pauses. Each square counts ONCE: as a theory class when the recess
              // does not impact the load, and never as practice (the course day is the
              // theory-track day of the week).
              dayType = DayType.THEORY_RECESS;
              description = 'Recesso Teórico';
              if (data.recessImpact === 'NO_IMPACT' && isWeeklyTheoryQuotaOpen()) {
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
          } else if (isBridgeHoliday) {
              dayType = DayType.THEORY_RECESS;
              description = 'Emenda de Feriado';
              if (data.bridgeHolidayImpact === 'NO_IMPACT' && isWeeklyTheoryQuotaOpen()) {
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
          } else if (isWeeklyTheoryQuotaOpen()) {
              dayType = DayType.THEORY;
              description = scheduledDesc;
              modality = scheduledModality;
              theoryHoursConsumed += HOURS_PER_DAY;
              loopTheoryHours += HOURS_PER_DAY;
          } else {
              // Theory's official hour load is already met, but the designated weekly
              // course day itself never stops: the apprentice can't have a practice-only
              // week, so this day stays THEORY-track for the rest of the contract - it
              // just no longer adds to the reported real hours (the official load is
              // already fully accounted for).
              dayType = DayType.THEORY;
              description = 'Dia de Curso (Carga Teórica Já Cumprida)';
              modality = scheduledModality;
          }
      } else {
          dayType = DayType.PRACTICE;
          description = scheduledDesc;
          if (!isPracticeFull()) practiceHoursConsumed += HOURS_PER_DAY;
          loopPracticeHours += HOURS_PER_DAY;
      }
    }

    if (theoryHoursConsumed + practiceHoursConsumed > creditedBefore) lastCreditedIndex = calendar.length;

    calendar.push({
      date: new Date(currentDate),
      dayType,
      description,
      isStart: isSameDay(currentDate, startDate),
      modality,
      theoryCredit: theoryHoursConsumed > theoryBefore,
      practiceCredit: practiceHoursConsumed > practiceBefore
    });

    currentDate = addDays(currentDate, 1);
    safetyCounter++;
  }

  // Determine End Date: the last square that is real activity, or the last day that
  // credited hours (e.g. a holiday counted as a class), whichever comes later.
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
  lastActivityIndex = Math.max(lastActivityIndex, lastCreditedIndex);
  if (lastActivityIndex !== -1) calendar[lastActivityIndex].isEnd = true;
  const endDate = lastActivityIndex !== -1 ? calendar[lastActivityIndex].date : startDate;

  return { calendar, endDate, holidayReport, finalImmersionStart, theoryHoursConsumed, practiceHoursConsumed };
};

// Counts the calendar squares by the role they play in the REAL hours, so the on-screen
// summary can show exactly which coloured squares add up to each real total.
const buildCreditBreakdown = (calendar: CalendarDay[]): CreditBreakdown => {
  const b: CreditBreakdown = {
    theory: { immersion: 0, weekly: 0, recess: 0, holiday: 0 },
    practice: { practice: 0 },
    noCredit: { weeklyCovered: 0, practiceOver: 0, immersionOver: 0, recess: 0, holiday: 0, manual: 0 },
  };
  for (const d of calendar) {
    if (isWeekend(d.date) && d.dayType !== DayType.HOLIDAY) continue;
    const t = !!d.theoryCredit;
    const p = !!d.practiceCredit;
    if (d.description === 'Alteração Manual') { if (!t && !p) b.noCredit.manual++; continue; }
    switch (d.dayType) {
      case DayType.IMMERSION: if (t) b.theory.immersion++; else b.noCredit.immersionOver++; break;
      case DayType.THEORY: if (t) b.theory.weekly++; else b.noCredit.weeklyCovered++; break;
      case DayType.THEORY_RECESS:
        if (t) b.theory.recess++;
        else b.noCredit.recess++;
        break;
      case DayType.HOLIDAY:
        if (t) b.theory.holiday++;
        else if (!isWeekend(d.date)) b.noCredit.holiday++;
        break;
      case DayType.PRACTICE: if (p) b.practice.practice++; else b.noCredit.practiceOver++; break;
      default: break;
    }
  }
  return b;
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
  // after the calendar's natural end. This walks every single calendar day (never
  // skipping one - a skipped day with no pushed entry renders as a blank cell) and never
  // puts PRACTICE on the designated weekly course day (1x teórica/4x prática rule holds
  // even in this top-up tail, same as the main simulation above).
  // Start right after the LAST date the main simulation actually produced an entry for
  // (not after `endDate`, which skips trailing holidays/weekends on purpose for the
  // "last real activity" meaning elsewhere) - otherwise a trailing holiday at the very
  // end of Final Immersion's window would make topUpDate land on a date that already
  // has a calendar entry, creating a duplicate.
  let topUpDate = addDays(calendar[calendar.length - 1].date, 1);
  let safetyTopUp = 0;
  while ((theoryHoursConsumed < data.totalTheoryHours || practiceHoursConsumed < data.totalPracticeHours) && safetyTopUp < 400) {
    calendar.forEach(d => { d.isEnd = false; });

    const isWknd = isWeekend(topUpDate);
    const holidayInfo = !isWknd ? getHolidayInfo(topUpDate, data.city, data.state, data.excludedHolidays) : null;
    const isDesignatedDay = getDay(topUpDate) === data.weeklyCourseDay;
    const inRecess = !isWknd && !holidayInfo && isInRecess(topUpDate);

    if (isWknd) {
      calendar.push({ date: new Date(topUpDate), dayType: DayType.WEEKEND, isEnd: false });
    } else if (holidayInfo) {
      calendar.push({ date: new Date(topUpDate), dayType: DayType.HOLIDAY, description: holidayInfo.name, isEnd: false });
    } else if (isDesignatedDay) {
      if (inRecess || isBridgeHolidayDate(topUpDate, data)) {
        // Recess / emenda on the course day: the class pauses (same treatment as the main
        // simulation, no hours credited in this tail). Never a theory reposição day.
        calendar.push({ date: new Date(topUpDate), dayType: DayType.THEORY_RECESS, description: inRecess ? 'Recesso Teórico' : 'Emenda de Feriado', isEnd: false, theoryCredit: false, practiceCredit: false });
      } else if (theoryHoursConsumed < data.totalTheoryHours) {
        calendar.push({ date: new Date(topUpDate), dayType: DayType.THEORY, description: 'Reposição de Carga Teórica', modality: data.modalityWeekly, isEnd: true, theoryCredit: true, practiceCredit: false });
        theoryHoursConsumed += HOURS_PER_DAY;
        endDate = new Date(topUpDate);
      } else {
        // Theory already covered - still never PRACTICE on the course day, just a
        // non-crediting theory-track filler.
        calendar.push({ date: new Date(topUpDate), dayType: DayType.THEORY, description: 'Dia de Curso (Carga Teórica Já Cumprida)', isEnd: false });
      }
    } else {
      if (practiceHoursConsumed < data.totalPracticeHours) {
        calendar.push({ date: new Date(topUpDate), dayType: DayType.PRACTICE, description: 'Reposição de Carga Prática', isEnd: true, theoryCredit: false, practiceCredit: true });
        practiceHoursConsumed += HOURS_PER_DAY;
        endDate = new Date(topUpDate);
      } else {
        calendar.push({ date: new Date(topUpDate), dayType: DayType.PRACTICE, isEnd: false });
      }
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

  // Real stats - the exact count of calendar squares that credit hours (each square = 6h),
  // so a mismatch against the official hours above is visible before finalizing.
  const realDaysTheory = calendar.filter(d => d.theoryCredit).length;
  const realDaysPractice = calendar.filter(d => d.practiceCredit).length;
  const realTheoryHours = realDaysTheory * HOURS_PER_DAY;
  const realPracticeHours = realDaysPractice * HOURS_PER_DAY;
  const creditBreakdown = buildCreditBreakdown(calendar);

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
    creditBreakdown,
  };
};
