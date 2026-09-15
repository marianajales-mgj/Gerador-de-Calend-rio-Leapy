import { addDays, subDays, isSameDay, isWeekend, getDay, isAfter, isBefore, parseISO, startOfDay, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { AppFormData, CalculationResult, CalendarDay, DayType, HolidayReportItem } from '../types';
import { HOURS_PER_DAY } from '../constants';
import { getHolidayInfo } from '../utils/dateUtils';

export const calculateCalendar = (data: AppFormData): CalculationResult => {
  const startDate = startOfDay(parseISO(data.startDate));
  const recessStart = data.recessStart ? startOfDay(parseISO(data.recessStart)) : null;
  const recessEnd = data.recessEnd ? startOfDay(parseISO(data.recessEnd)) : null;

  // Track hours strictly
  let theoryHoursConsumed = 0;
  let practiceHoursConsumed = 0;
  
  // Track hours for loop termination (natural progression)
  let loopTheoryHours = 0;
  let loopPracticeHours = 0;
  
  const calendar: CalendarDay[] = [];
  const holidayReport: HolidayReportItem[] = [];
  
  let currentDate = startDate;
  
  // Safety break
  let safetyCounter = 0;
  const MAX_DAYS = 365 * 5; 

  const isTheoryFull = () => theoryHoursConsumed >= data.totalTheoryHours;
  const isPracticeFull = () => practiceHoursConsumed >= data.totalPracticeHours;
  
  const isLoopTheoryFull = () => loopTheoryHours >= data.totalTheoryHours;
  const isLoopPracticeFull = () => loopPracticeHours >= data.totalPracticeHours;

  const overrideDates = Object.keys(data.overrides || {}).map(d => parseISO(d));
  const lastOverrideDate = overrideDates.length > 0 ? new Date(Math.max(...overrideDates.map(d => d.getTime()))) : null;

  const shouldContinue = () => {
    if (safetyCounter >= MAX_DAYS) return false;
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
    
    // Check Recess
    let isRecessPeriod = false;
    if (recessStart && recessEnd) {
      if ((isAfter(currentDate, recessStart) || isSameDay(currentDate, recessStart)) && 
          (isBefore(currentDate, recessEnd) || isSameDay(currentDate, recessEnd))) {
        isRecessPeriod = true;
      }
    }

    // Bridge Logic
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

    const theoryHoursRemaining = data.totalTheoryHours - loopTheoryHours;
    const hoursForFinalImmersion = data.immersionDaysEnd * HOURS_PER_DAY;

    const initialImmersionHours = data.immersionDays * HOURS_PER_DAY;
    const isInitialImmersionPhase = loopTheoryHours < initialImmersionHours;

    const isFinalImmersionPhase = 
        !isInitialImmersionPhase && 
        loopTheoryHours < data.totalTheoryHours &&
        theoryHoursRemaining <= hoursForFinalImmersion;

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
             if (scheduledType === 'THEORY' && !isTheoryFull()) {
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
          if (!isLoopTheoryFull()) {
              if (isRecessPeriod) {
                  dayType = DayType.THEORY_RECESS;
                  description = isFinalImmersionPhase ? 'Recesso (Imersão Final)' : 'Recesso Teórico';
                  if (data.recessImpact === 'NO_IMPACT') {
                      theoryHoursConsumed += HOURS_PER_DAY;
                      loopTheoryHours += HOURS_PER_DAY;
                  }
                  practiceHoursConsumed += HOURS_PER_DAY;
                  loopPracticeHours += HOURS_PER_DAY; // Recesso teórico geralmente implica prática na empresa
              } else if (isBridgeHoliday) {
                  dayType = DayType.THEORY_RECESS;
                  description = isFinalImmersionPhase ? 'Emenda (Imersão Final)' : 'Emenda de Feriado';
                  if (data.bridgeHolidayImpact === 'NO_IMPACT') {
                      theoryHoursConsumed += HOURS_PER_DAY;
                      loopTheoryHours += HOURS_PER_DAY;
                  }
                  practiceHoursConsumed += HOURS_PER_DAY;
                  loopPracticeHours += HOURS_PER_DAY;
              } else {
                  if (isInitialImmersionPhase || isFinalImmersionPhase) {
                      dayType = DayType.IMMERSION;
                  } else {
                      dayType = DayType.THEORY;
                  }
                  description = scheduledDesc;
                  modality = scheduledModality;
                  theoryHoursConsumed += HOURS_PER_DAY;
                  loopTheoryHours += HOURS_PER_DAY;
              }
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
        calendar[i].dayType === DayType.THEORY_RECESS) {
      lastActivityIndex = i;
      break;
    }
  }
  if (lastActivityIndex !== -1) calendar[lastActivityIndex].isEnd = true;
  const endDate = lastActivityIndex !== -1 ? calendar[lastActivityIndex].date : startDate;
  
  if (recessStart && recessEnd) {
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