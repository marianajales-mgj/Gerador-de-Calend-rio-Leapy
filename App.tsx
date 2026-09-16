import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, FileDown, Building2,
  Clock, MapPin, AlertCircle, Calculator, Info,
  CheckSquare, Square, Laptop, Users, Blend, Table, X
} from 'lucide-react';
import { AppFormData, CalculationResult, EntityType, Modality, WeeklyModality, DayType, EntidadeCursoConfig } from './types';
import { WEEK_DAYS, BRAZIL_STATES, CITIES_BY_STATE, ENTIDADE_CURSO_CONFIG } from './constants';
import { calculateCalendar } from './services/calculator';
import { generatePDF } from './services/pdfGenerator';
import { generateExcel } from './services/excelGenerator';
import { format, getDay, differenceInCalendarDays } from 'date-fns';
import { getPotentialHolidays } from './utils/dateUtils';
import { ptBR } from 'date-fns/locale';

// Applies a matched Entidade+Curso config row onto the form data.
// Fields set here remain manually editable afterwards.
const applyEntidadeCursoConfig = (data: AppFormData, config: EntidadeCursoConfig): AppFormData => ({
  ...data,
  courseName: config.curso,
  cboNumber: config.cbo,
  protocol: config.protocolo,
  totalTheoryHours: config.totalTheoryHours,
  totalPracticeHours: config.totalPracticeHours,
  modalityInitial: config.immersionModalityInitial,
  modalityFinal: config.immersionModalityFinal,
  immersionDays: config.immersionDays,
  immersionDaysEnd: config.immersionDaysEnd,
  entityName: config.entityName,
  entityCnpj: config.entityCnpj,
  courseAddress: config.courseAddress,
  state: config.uf,
  city: config.city,
});

const DEFAULT_CONFIG = ENTIDADE_CURSO_CONFIG.find(c => c.entidade === EntityType.INSTITUTO_LEAPY_LIBERDADE) || ENTIDADE_CURSO_CONFIG[0];

const App: React.FC = () => {
  const [formData, setFormData] = useState<AppFormData>({
    entity: DEFAULT_CONFIG.entidade,
    courseName: DEFAULT_CONFIG.curso,
    cboNumber: DEFAULT_CONFIG.cbo,
    startDate: '',

    immersionDays: DEFAULT_CONFIG.immersionDays,
    modalityInitial: DEFAULT_CONFIG.immersionModalityInitial,

    immersionDaysEnd: DEFAULT_CONFIG.immersionDaysEnd,
    modalityFinal: DEFAULT_CONFIG.immersionModalityFinal,

    weeklyCourseDay: 1, // Monday
    modalityWeekly: 'PRESENTIAL',

    totalTheoryHours: DEFAULT_CONFIG.totalTheoryHours,
    totalPracticeHours: DEFAULT_CONFIG.totalPracticeHours,
    city: DEFAULT_CONFIG.city,
    state: DEFAULT_CONFIG.uf,
    recessStart: '',
    recessEnd: '',
    recessImpact: 'NO_IMPACT',

    holidayImpact: 'IMPACT', // Default: Holidays impact (reduce) workload, requiring makeup or resulting in deficit

    adhereBridgeHolidays: false,
    bridgeHolidayImpact: 'NO_IMPACT',
    extendTheory: false,

    protocol: DEFAULT_CONFIG.protocolo,
    entityCnpj: DEFAULT_CONFIG.entityCnpj,
    entityName: DEFAULT_CONFIG.entityName,
    courseAddress: DEFAULT_CONFIG.courseAddress,

    excludedHolidays: [],
    overrides: {}
  });

  const [noRecess, setNoRecess] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [editingDay, setEditingDay] = useState<Date | null>(null);

  // Recalculate whenever form data changes
  useEffect(() => {
    if (formData.startDate && formData.totalTheoryHours && formData.totalPracticeHours) {
      const calc = calculateCalendar(formData);
      setResult(calc);
    }
  }, [formData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => {
      const newData = { ...prev };
      
      if (type === 'checkbox') {
        // @ts-ignore
        newData[name] = checked;
      } else {
         if (['immersionDays', 'immersionDaysEnd', 'weeklyCourseDay', 'totalTheoryHours', 'totalPracticeHours'].includes(name)) {
            // @ts-ignore
            newData[name] = Number(value);
         } else {
            // @ts-ignore
            newData[name] = value;
         }
      }

      // Reset City if State changes
      if (name === 'state') {
        const cities = CITIES_BY_STATE[value];
        if (cities && cities.length > 0) {
          newData.city = cities[0];
        } else {
          newData.city = '';
        }
      }

      return newData;
    });
  };

  const coursesForEntity = useMemo(
    () => ENTIDADE_CURSO_CONFIG.filter(c => c.entidade === formData.entity),
    [formData.entity]
  );

  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEntity = e.target.value as EntityType;
    const firstConfig = ENTIDADE_CURSO_CONFIG.find(c => c.entidade === newEntity);
    setFormData(prev => {
      const newData = { ...prev, entity: newEntity };
      return firstConfig ? applyEntidadeCursoConfig(newData, firstConfig) : newData;
    });
  };

  const handleCourseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCourse = e.target.value;
    const config = ENTIDADE_CURSO_CONFIG.find(c => c.entidade === formData.entity && c.curso === newCourse);
    setFormData(prev => {
      const newData = { ...prev, courseName: newCourse };
      return config ? applyEntidadeCursoConfig(newData, config) : newData;
    });
  };

  const handleToggleHoliday = (dateStr: string) => {
    setFormData(prev => {
      const isExcluded = prev.excludedHolidays.includes(dateStr);
      if (isExcluded) {
        return { ...prev, excludedHolidays: prev.excludedHolidays.filter(d => d !== dateStr) };
      } else {
        return { ...prev, excludedHolidays: [...prev.excludedHolidays, dateStr] };
      }
    });
  };

  const handleDayClick = (date: Date) => {
    setEditingDay(date);
  };

  const handleSaveOverride = (type: DayType | 'DEFAULT') => {
    if (!editingDay) return;
    const dateStr = editingDay.toISOString().split('T')[0];

    setFormData(prev => {
      const newOverrides = { ...(prev.overrides || {}) };
      if (type === 'DEFAULT') {
        delete newOverrides[dateStr];
      } else {
        newOverrides[dateStr] = { type };
      }
      return { ...prev, overrides: newOverrides };
    });
    setEditingDay(null);
  };

  const handleGeneratePDF = () => {
    if (result) {
      generatePDF(formData, result).catch(err => {
        console.error('Erro ao gerar PDF:', err);
        alert('Ocorreu um erro ao gerar o PDF. Verifique o console para mais detalhes.');
      });
    }
  };

  const handleGenerateExcel = () => {
    if (result) {
      generateExcel(formData, result);
    }
  };

  const potentialHolidays = useMemo(() => {
    if (!formData.startDate) return [];
    const startYear = new Date(formData.startDate).getFullYear();
    return getPotentialHolidays(startYear, startYear + 2, formData.city, formData.state);
  }, [formData.startDate, formData.city, formData.state]);

  const isRecessValid = noRecess || (formData.recessStart !== '' && formData.recessEnd !== '');

  const isFormValid = 
    formData.startDate !== '' && 
    formData.courseName !== '' && 
    formData.cboNumber !== '' && 
    formData.totalTheoryHours > 0 && 
    formData.totalPracticeHours > 0 &&
    formData.immersionDays >= 0 &&
    isRecessValid;

  const totalDays = result ? result.totalDaysTheory + result.totalDaysPractice : 0;
  const theoryPct = result && totalDays > 0 ? Math.round((result.totalDaysTheory / totalDays) * 100) : 0;
  const practicePct = result && totalDays > 0 ? Math.round((result.totalDaysPractice / totalDays) * 100) : 0;
  
  const cities = CITIES_BY_STATE[formData.state] || [];

  const ModalitySelector = ({ name, value, onChange, allowHybrid = false }: { name: string, value: WeeklyModality, onChange: any, allowHybrid?: boolean }) => (
    <div className="flex gap-2 mt-1">
      <label className={`cursor-pointer px-2 py-1 rounded text-xs flex items-center gap-1 border ${value === 'PRESENTIAL' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-500'}`}>
        <input type="radio" name={name} value="PRESENTIAL" checked={value === 'PRESENTIAL'} onChange={onChange} className="hidden" />
        <Users size={12} /> Presencial
      </label>
      <label className={`cursor-pointer px-2 py-1 rounded text-xs flex items-center gap-1 border ${value === 'ONLINE' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-500'}`}>
        <input type="radio" name={name} value="ONLINE" checked={value === 'ONLINE'} onChange={onChange} className="hidden" />
        <Laptop size={12} /> Online
      </label>
      {allowHybrid && (
        <label className={`cursor-pointer px-2 py-1 rounded text-xs flex items-center gap-1 border ${value === 'HYBRID' ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-500'}`}>
          <input type="radio" name={name} value="HYBRID" checked={value === 'HYBRID'} onChange={onChange} className="hidden" />
          <Blend size={12} /> Híbrido
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center font-sans">
      <header className="w-full max-w-7xl mb-8 flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-4 md:mb-0">
          <div className="p-3 bg-[#373afd] rounded-lg text-white">
            <Calendar size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Gerador de Calendário</h1>
            <p className="text-slate-500 text-sm">Aprendizagem Profissional • Teoria & Prática</p>
          </div>
        </div>
        {result && (
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={handleGenerateExcel}
              disabled={!isFormValid}
              title={!isFormValid ? "Preencha todos os campos obrigatórios" : "Baixar Plano de Aula em Excel"}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors shadow-lg ${
                isFormValid 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/10' 
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Table size={20} />
              Baixar XLS
            </button>
            <button 
              onClick={handleGeneratePDF}
              disabled={!isFormValid}
              title={!isFormValid ? "Preencha todos os campos obrigatórios, incluindo o recesso" : "Baixar Calendário PDF"}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors shadow-lg ${
                isFormValid 
                  ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/10' 
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <FileDown size={20} />
              Baixar PDF
            </button>
          </div>
        )}
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Section */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-[#373afd]" /> 
              Dados Gerais
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entidade</label>
                <select
                  name="entity"
                  value={formData.entity}
                  onChange={handleEntityChange}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#373afd] focus:border-[#373afd] outline-none"
                >
                  {Object.values(EntityType).map(ent => (
                    <option key={ent} value={ent}>{ent}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Curso</label>
                  <select
                    name="courseName"
                    value={formData.courseName}
                    onChange={handleCourseChange}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none bg-white"
                  >
                    {coursesForEntity.map(c => (
                      <option key={c.curso} value={c.curso}>{c.curso}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CBO</label>
                  <input 
                    type="text" 
                    name="cboNumber"
                    value={formData.cboNumber}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                    placeholder="000000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Protocolo</label>
                <input 
                  type="text" 
                  name="protocol"
                  value={formData.protocol}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razão Social</label>
                <input 
                  type="text" 
                  name="entityName"
                  value={formData.entityName}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ</label>
                  <input 
                    type="text" 
                    name="entityCnpj"
                    value={formData.entityCnpj}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  {/* Placeholder for alignment if needed */}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Endereço do Curso</label>
                <textarea 
                  name="courseAddress"
                  value={formData.courseAddress}
                  onChange={(e) => handleInputChange(e as any)}
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none resize-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-[#373afd]" /> 
              Cargas e Prazos
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data de Início</label>
                <input 
                  type="date" 
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teóricas (Horas)</label>
                  <input 
                    type="number" 
                    name="totalTheoryHours"
                    value={formData.totalTheoryHours}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Práticas (Horas)</label>
                  <input 
                    type="number" 
                    name="totalPracticeHours"
                    value={formData.totalPracticeHours}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              {/* Routine & Modalities */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                 {/* Initial Immersion */}
                 <div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-700 font-medium">Imersão Inicial (Dias)</span>
                      <input 
                        type="number" 
                        name="immersionDays"
                        value={formData.immersionDays}
                        onChange={handleInputChange}
                        className="w-16 p-1 text-right border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <ModalitySelector name="modalityInitial" value={formData.modalityInitial} onChange={handleInputChange} />
                 </div>

                 <hr className="border-slate-200" />

                 {/* Weekly Day */}
                 <div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-700 font-medium">Dia de Curso (Semanal)</span>
                      <select 
                        name="weeklyCourseDay" 
                        value={formData.weeklyCourseDay} 
                        onChange={handleInputChange}
                        className="w-32 p-1 border border-slate-300 rounded text-sm"
                      >
                        {WEEK_DAYS.map(day => (
                          <option key={day.id} value={day.id}>{day.label}</option>
                        ))}
                      </select>
                    </div>
                    <ModalitySelector name="modalityWeekly" value={formData.modalityWeekly} onChange={handleInputChange} allowHybrid />
                 </div>

                 <hr className="border-slate-200" />

                 {/* Final Immersion */}
                 <div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-700 font-medium">Imersão Final (Dias)</span>
                      <input 
                        type="number" 
                        name="immersionDaysEnd"
                        value={formData.immersionDaysEnd}
                        onChange={handleInputChange}
                        className="w-16 p-1 text-right border border-slate-300 rounded text-sm"
                      />
                    </div>
                    <ModalitySelector name="modalityFinal" value={formData.modalityFinal} onChange={handleInputChange} />
                 </div>
              </div>

              {/* Rules Configuration */}
              <div className="space-y-4 pt-2">
                 
                 {/* Holiday Impact */}
                 <div className="space-y-2 border-b border-slate-100 pb-2">
                   <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Feriado em dia de Curso:</span>
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                           <input type="radio" name="holidayImpact" value="NO_IMPACT" checked={formData.holidayImpact === 'NO_IMPACT'} onChange={handleInputChange} />
                           Não impacta carga (Conta como aula)
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                           <input type="radio" name="holidayImpact" value="IMPACT" checked={formData.holidayImpact === 'IMPACT'} onChange={handleInputChange} />
                           Impacta carga (Não conta - deve repor)
                        </label>
                      </div>
                   </div>
                 </div>

                 {/* Recess Rules */}
                 <div className="space-y-2 border-b border-slate-100 pb-2">
                   <div className="flex items-start gap-2">
                      <input 
                        type="checkbox" 
                        id="noRecess"
                        checked={noRecess}
                        onChange={(e) => {
                          setNoRecess(e.target.checked);
                          if (e.target.checked) {
                            setFormData(prev => ({...prev, recessStart: '', recessEnd: ''}));
                          }
                        }}
                        className="mt-1"
                      />
                      <label htmlFor="noRecess" className="text-xs text-slate-600 cursor-pointer">
                         Não haverá recesso escolar em Dezembro?
                      </label>
                   </div>

                   {!noRecess && (
                     <div className="pl-6 space-y-2">
                       <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="date" 
                            name="recessStart" 
                            value={formData.recessStart} 
                            onChange={handleInputChange} 
                            className="w-full p-1 border border-slate-300 rounded text-xs"
                          />
                          <input 
                            type="date" 
                            name="recessEnd" 
                            value={formData.recessEnd} 
                            onChange={handleInputChange} 
                            className="w-full p-1 border border-slate-300 rounded text-xs" 
                          />
                       </div>
                       
                       <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Impacto do Recesso:</span>
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                               <input type="radio" name="recessImpact" value="NO_IMPACT" checked={formData.recessImpact === 'NO_IMPACT'} onChange={handleInputChange} />
                               Sem impactar carga (Conta como aula)
                            </label>
                            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                               <input type="radio" name="recessImpact" value="IMPACT" checked={formData.recessImpact === 'IMPACT'} onChange={handleInputChange} />
                               Impactando carga (Não conta como aula)
                            </label>
                          </div>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Bridge Holiday Rules */}
                 <div className="space-y-2 border-b border-slate-100 pb-2">
                   <div className="flex items-start gap-2">
                      <input 
                        type="checkbox" 
                        id="adhereBridgeHolidays"
                        name="adhereBridgeHolidays"
                        checked={formData.adhereBridgeHolidays}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                      <label htmlFor="adhereBridgeHolidays" className="text-xs text-slate-600 cursor-pointer leading-tight">
                         Aderir a emendas de feriado?
                      </label>
                   </div>
                   
                   {formData.adhereBridgeHolidays && (
                     <div className="ml-6 space-y-1">
                       <div className="flex flex-col gap-1">
                         <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                           <input type="radio" name="bridgeHolidayImpact" value="NO_IMPACT" checked={formData.bridgeHolidayImpact === 'NO_IMPACT'} onChange={handleInputChange} />
                           Sem impactar carga (Conta como aula)
                         </label>
                         <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                           <input type="radio" name="bridgeHolidayImpact" value="IMPACT" checked={formData.bridgeHolidayImpact === 'IMPACT'} onChange={handleInputChange} />
                           Impactando carga (Não conta como aula)
                         </label>
                       </div>
                     </div>
                   )}
                 </div>
                 
                 {/* Extension Rule */}
                 <div className="flex items-start gap-2">
                    <input 
                      type="checkbox" 
                      id="extendTheory"
                      name="extendTheory"
                      checked={formData.extendTheory}
                      onChange={handleInputChange}
                      className="mt-1"
                    />
                    <label htmlFor="extendTheory" className="text-xs text-slate-600 cursor-pointer leading-tight">
                       Expandir contrato para repor horas faltantes?
                    </label>
                 </div>
              </div>

            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-[#373afd]" /> 
              Localização
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">UF</label>
                    <select 
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      {BRAZIL_STATES.map(s => (
                        <option key={s.value} value={s.value}>{s.value}</option>
                      ))}
                    </select>
                 </div>
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cidade</label>
                    <select 
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      {cities.length > 0 ? (
                        cities.map(c => <option key={c} value={c}>{c}</option>)
                      ) : (
                        <option value="">Selecione UF...</option>
                      )}
                    </select>
                 </div>
              </div>

              {potentialHolidays.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center sticky top-0">
                    <p className="text-xs font-semibold text-slate-700">Feriados Locais e Nacionais</p>
                    <span className="text-[10px] text-slate-400 italic">Desmarque para excluir</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto p-2 space-y-2">
                    {potentialHolidays.map((h, idx) => {
                      const dateStr = h.date.toISOString().split('T')[0];
                      const isExcluded = formData.excludedHolidays.includes(dateStr);
                      const dayOfWeek = format(h.date, 'eee', { locale: ptBR }).replace('.', '');
                      
                      return (
                        <div 
                          key={`${dateStr}-${idx}`} 
                          className={`flex items-center gap-3 text-xs p-2 rounded-md transition-colors ${isExcluded ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}`}
                        >
                          <button 
                            onClick={() => handleToggleHoliday(dateStr)}
                            className="text-slate-600 hover:text-slate-800 shrink-0"
                            title={isExcluded ? "Incluir feriado" : "Excluir feriado"}
                          >
                            {isExcluded ? <Square size={16} /> : <CheckSquare size={16} className="text-[#373afd]" />}
                          </button>
                          
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-0.5">
                               <span className={`font-medium ${isExcluded ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                  {format(h.date, 'dd/MM/yyyy')} <span className="text-slate-400 font-normal ml-1 capitalize">({dayOfWeek})</span>
                               </span>
                               <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  h.type === 'NATIONAL' ? 'bg-slate-100 text-slate-600' :
                                  h.type === 'ESTADUAL' ? 'bg-blue-50 text-blue-600' :
                                  'bg-amber-50 text-amber-600'
                               }`}>
                                  {h.type === 'NATIONAL' ? 'NAC' : h.type === 'ESTADUAL' ? 'EST' : 'MUN'}
                               </span>
                            </div>
                            <span className={`block truncate ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                              {h.name}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Preview Section */}
        <section className="lg:col-span-8 space-y-6">
           {!result ? (
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-96 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
               <AlertCircle size={48} className="mb-4 text-slate-300" />
               <p className="text-lg font-medium text-slate-600">Preencha os dados de início e carga horária</p>
               <p className="text-sm">O calendário será gerado automaticamente aqui.</p>
             </div>
           ) : (
             <>
                {/* Result Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500">
                     <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Previsão de Término</p>
                     <p className="text-2xl font-bold text-slate-800">{format(result.endDate, 'dd/MM/yyyy')}</p>
                     <p className="text-xs text-slate-400 mt-1">Dia da última atividade</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500">
                     <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Duração do Contrato</p>
                     <p className="text-2xl font-bold text-slate-800">
                        {differenceInCalendarDays(result.endDate, new Date(formData.startDate)) + 1} Dias
                     </p>
                     <div className="flex gap-2 text-xs mt-1">
                        <span className="text-slate-600 font-medium">{result.monthsSpanned.length} Meses</span>
                     </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-blue-400">
                     <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Feriados</p>
                     <p className="text-2xl font-bold text-slate-800">
                        {result.totalDaysHoliday}
                     </p>
                     <p className="text-xs text-slate-400 mt-1">Dias não letivos (Feriados)</p>
                  </div>
                </div>

                {/* Fechamento / Resumo Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                   <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                     <Calculator size={18} className="text-[#373afd]" />
                     <h3 className="font-semibold text-slate-700">Resumo / Fechamento</h3>
                   </div>
                   <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left">
                       <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                         <tr>
                           <th className="px-6 py-3 font-medium">Item</th>
                           <th className="px-6 py-3 font-medium">Dias</th>
                           <th className="px-6 py-3 font-medium">Horas</th>
                           <th className="px-6 py-3 font-medium">%</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         <tr>
                           <td className="px-6 py-3 font-medium text-slate-700">Teóricas</td>
                           <td className="px-6 py-3">{result.totalDaysTheory}</td>
                           <td className="px-6 py-3">{result.totalDaysTheory * 6}h</td>
                           <td className="px-6 py-3 text-blue-600 font-medium">{theoryPct}%</td>
                         </tr>
                         <tr>
                           <td className="px-6 py-3 font-medium text-slate-700">Práticas</td>
                           <td className="px-6 py-3">{result.totalDaysPractice}</td>
                           <td className="px-6 py-3">{result.totalDaysPractice * 6}h</td>
                           <td className="px-6 py-3 text-amber-600 font-medium">{practicePct}%</td>
                         </tr>
                         <tr className="bg-slate-50 font-semibold text-slate-800">
                           <td className="px-6 py-3">Total</td>
                           <td className="px-6 py-3">{totalDays}</td>
                           <td className="px-6 py-3">{totalDays * 6}h</td>
                           <td className="px-6 py-3">100%</td>
                         </tr>
                       </tbody>
                     </table>
                   </div>
                </div>

                {/* Legend Preview */}
                <div className="flex flex-wrap gap-4 text-xs bg-white p-3 rounded-lg border border-slate-200">
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#1e3a8a]"></div>
                      <span>Atividade Teórica - Imersão ({formData.modalityInitial === 'PRESENTIAL' ? 'Presencial' : 'Online'})</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#373afd]"></div>
                      <span>Atividade Teórica - Semanal ({
                        formData.modalityWeekly === 'PRESENTIAL' ? 'Presencial' :
                        formData.modalityWeekly === 'ONLINE' ? 'Online' : 'Híbrido'
                      })</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#FEF08A]"></div>
                      <span>Atividade Prática</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#374151]"></div>
                      <span>Feriados</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#bfdbfe]"></div>
                      <span>Recesso Teórico</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm bg-slate-100 border border-dashed border-slate-300"></div>
                      <span>Em Branco</span>
                   </div>
                </div>

                {/* Calendar Preview Grid */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                   <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                     <h3 className="font-semibold text-slate-700">Prévia do Calendário</h3>
                     <span className="text-xs text-slate-400">Clique em um dia para alterar manualmente</span>
                   </div>
                   <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {result.monthsSpanned.map((month, i) => (
                        <MonthPreview key={i} month={month} calendar={result.calendar} onDayClick={handleDayClick} />
                      ))}
                   </div>
                </div>
             </>
           )}
        </section>
      </main>

      {/* Manual Override Modal */}
      {editingDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Alterar Dia: {format(editingDay, 'dd/MM/yyyy')}</h3>
              <button onClick={() => setEditingDay(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Atividade</label>
                <select 
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#373afd]"
                  defaultValue={formData.overrides?.[editingDay.toISOString().split('T')[0]]?.type || 'DEFAULT'}
                  id="overrideType"
                >
                  <option value="DEFAULT">Padrão (Calculado)</option>
                  <option value={DayType.IMMERSION}>Atividade Teórica - Imersão</option>
                  <option value={DayType.THEORY}>Atividade Teórica - Semanal</option>
                  <option value={DayType.PRACTICE}>Atividade Prática</option>
                  <option value={DayType.HOLIDAY}>Feriado</option>
                  <option value={DayType.THEORY_RECESS}>Recesso Teórico</option>
                  <option value={DayType.EMPTY}>Em Branco (Sem atividade)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setEditingDay(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const type = (document.getElementById('overrideType') as HTMLSelectElement).value as DayType | 'DEFAULT';
                    handleSaveOverride(type);
                  }}
                  className="flex-1 px-4 py-2 bg-[#373afd] text-white rounded-lg font-medium hover:bg-[#2d30d1] transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Mini Component for Month Rendering
const MonthPreview: React.FC<{ 
  month: Date, 
  calendar: CalculationResult['calendar'],
  onDayClick: (date: Date) => void
}> = ({ month, calendar, onDayClick }) => {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = getDay(monthStart);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  return (
    <div className="text-xs">
      <div className="bg-[#373afd] text-white p-1 text-center font-bold rounded-t mb-1">
        {format(month, 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
      </div>
      <div className="grid grid-cols-7 gap-px mb-1 text-slate-400 font-medium text-center">
         <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {/* Padding for empty days */}
        {Array.from({ length: startDay }).map((_, i) => <div key={`empty-${i}`} />)}
        
        {/* Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
           const current = new Date(month.getFullYear(), month.getMonth(), i + 1);
           const dayInfo = calendar.find(c => c.date.toDateString() === current.toDateString());
           
           let bgClass = 'bg-white text-slate-300'; // Default empty/weekend
           let cursorClass = 'cursor-pointer hover:ring-2 hover:ring-slate-300';
           
           if (dayInfo) {
              if (dayInfo.dayType === DayType.THEORY) bgClass = 'bg-[#373afd] text-white';
              else if (dayInfo.dayType === DayType.IMMERSION) bgClass = 'bg-[#1e3a8a] text-white';
              else if (dayInfo.dayType === DayType.PRACTICE) bgClass = 'bg-[#FEF08A] text-slate-900';
              else if (dayInfo.dayType === DayType.THEORY_RECESS) bgClass = 'bg-[#bfdbfe] text-slate-900'; 
              else if (dayInfo.dayType === DayType.RECESS) bgClass = 'bg-gray-400 text-white';
              else if (dayInfo.dayType === DayType.HOLIDAY) bgClass = 'bg-gray-700 text-white';
              else if (dayInfo.dayType === DayType.EMPTY) bgClass = 'bg-slate-100 text-slate-400 border border-dashed border-slate-300';
              
              if (dayInfo.description === 'Alteração Manual') {
                cursorClass += ' ring-1 ring-inset ring-orange-400';
              }
           }

           return (
             <div 
               key={i} 
               onClick={() => onDayClick(current)}
               className={`h-6 w-full flex items-center justify-center rounded-sm transition-all ${bgClass} ${cursorClass}`}
               title={dayInfo?.description || ''}
             >
               {i + 1}
             </div>
           );
        })}
      </div>
    </div>
  );
};

export default App;