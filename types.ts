export enum EntityType {
  LEAPY_OPG = 'Leapy OPG',
  INSTITUTO_LEAPY = 'Instituto Leapy',
}

export enum DayType {
  THEORY = 'THEORY',
  PRACTICE = 'PRACTICE',
  THEORY_RECESS = 'THEORY_RECESS', // Practice during theoretical recess (or bridge holiday)
  IMMERSION = 'IMMERSION',
  HOLIDAY = 'HOLIDAY',
  RECESS = 'RECESS', 
  WEEKEND = 'WEEKEND',
  EMPTY = 'EMPTY', 
}

export type Modality = 'PRESENTIAL' | 'ONLINE';
export type ImpactType = 'NO_IMPACT' | 'IMPACT';

export interface Holiday {
  date: string; // ISO format YYYY-MM-DD
  name: string;
  type: 'NATIONAL' | 'MUNICIPAL' | 'ESTADUAL' | 'RECESS';
}

export interface RecessPeriod {
  start: string;
  end: string;
}

export interface AppFormData {
  entity: EntityType;
  courseName: string;
  cboNumber: string;
  startDate: string;
  
  // Immersion & Modalities
  immersionDays: number;
  modalityInitial: Modality;
  
  immersionDaysEnd: number; // New: Final Immersion
  modalityFinal: Modality;
  
  weeklyCourseDay: number; // 1 = Monday, 5 = Friday
  modalityWeekly: Modality;

  totalTheoryHours: number;
  totalPracticeHours: number;
  city: string;
  state: string;
  recessStart: string;
  recessEnd: string;
  
  // Rules
  holidayImpact: ImpactType; // New: General Holiday Impact Rule on Course Days
  
  adhereBridgeHolidays: boolean; 
  bridgeHolidayImpact: ImpactType;
  
  recessImpact: ImpactType; // New: Recess Impact Rule

  extendTheory: boolean; 
  
  // New fields
  protocol: string;
  entityCnpj: string;
  entityName: string;
  courseAddress: string;
  
  // Excluded holidays (dates in ISO string)
  excludedHolidays: string[]; 
  
  // Manual day overrides: date string (YYYY-MM-DD) -> { type }
  overrides?: Record<string, { type: DayType }>;
}

export interface CalendarDay {
  date: Date;
  dayType: DayType;
  isStart?: boolean;
  isEnd?: boolean;
  description?: string;
  modality?: Modality; // New
}

export interface HolidayReportItem {
  date: Date;
  name: string;
  type: string;
}

export interface CalculationResult {
  calendar: CalendarDay[];
  endDate: Date;
  totalDaysTheory: number;
  totalDaysPractice: number;
  totalDaysRecess: number;
  totalDaysHoliday: number;
  monthsSpanned: Date[];
  holidayReport: HolidayReportItem[];
}