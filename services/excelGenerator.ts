import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppFormData, CalculationResult, DayType } from '../types';

const DATE_FORMAT = 'dd/mm/yyyy';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// SheetJS serializes Date objects using their raw UTC instant, ignoring the local
// timezone the wall-clock date was built in - so a local midnight in a negative UTC
// offset (e.g. Brasília, UTC-3) gets truncated to the previous day. Shifting by the
// timezone offset before handing the Date to aoa_to_sheet keeps the calendar day intact.
const toExcelDate = (date: Date): Date => new Date(date.getTime() + date.getTimezoneOffset() * 60000);

export const generateExcel = (data: AppFormData, result: CalculationResult) => {
  try {
    // 1. Prepare Summary Data
    const summary = [
      ['SUMÁRIO DO CALENDÁRIO'],
      ['Curso', data.courseName],
      ['CBO', data.cboNumber],
      ['Protocolo', data.protocol],
      ['Razão Social', data.entityName],
      ['CNPJ', data.entityCnpj],
      ['Endereço', data.courseAddress],
      ['Carga Horária', `${data.totalTheoryHours + data.totalPracticeHours}h (Teórica: ${data.totalTheoryHours}h / Prática: ${data.totalPracticeHours}h)`],
      ['Data de Início', toExcelDate(new Date(data.startDate + 'T00:00:00'))],
      ['Data de Fim', toExcelDate(result.endDate)],
      [], // Spacer
      ['DETALHAMENTO DOS DIAS DE FORMAÇÃO'],
      ['Data', 'Dia da Semana', 'Tipo']
    ];

    // 2. Prepare Table Data (course/formation-relevant days: aulas, imersão, feriados, recessos/emendas e férias)
    const tableRows = result.calendar
      .filter(day =>
        day.dayType === DayType.THEORY ||
        day.dayType === DayType.IMMERSION ||
        day.dayType === DayType.THEORY_RECESS ||
        day.dayType === DayType.HOLIDAY ||
        day.dayType === DayType.RECESS
      )
      .map(day => {
        const desc = day.description || '';
        let typeLabel = 'Outro';

        if (day.dayType === DayType.HOLIDAY) {
          typeLabel = 'Feriado';
        } else if (day.dayType === DayType.IMMERSION) {
          typeLabel = 'Imersão';
        } else if (day.dayType === DayType.THEORY_RECESS) {
          typeLabel = desc.toLowerCase().includes('emenda') ? 'Emenda de Feriado' : 'Recesso Teórico';
        } else if (day.dayType === DayType.RECESS) {
          typeLabel = 'Férias jovem';
        } else if (day.dayType === DayType.THEORY) {
          typeLabel = 'Aula Semanal';
        }

        const weekday = capitalize(format(day.date, 'EEEE', { locale: ptBR }));

        return [toExcelDate(day.date), weekday, typeLabel];
      });

    // Combine data
    const finalData = [...summary, ...tableRows];

    // Create workbook and worksheet, keeping Date objects as real Excel dates
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(finalData, { cellDates: true, dateNF: DATE_FORMAT });

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Date
      { wch: 16 }, // Weekday
      { wch: 22 }  // Type
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Calendário de Formação');

    // Export
    const filenameDate = format(new Date(data.startDate + 'T00:00:00'), 'dd-MM-yyyy');
    const sanitizedCourse = data.courseName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);

    // Trigger download
    XLSX.writeFile(wb, `Plano_de_Aula_-_${filenameDate}_-_${sanitizedCourse}.xlsx`);
  } catch (error) {
    console.error("Erro ao gerar Excel:", error);
    alert("Ocorreu um erro ao gerar o arquivo Excel. Verifique o console para mais detalhes.");
  }
};
