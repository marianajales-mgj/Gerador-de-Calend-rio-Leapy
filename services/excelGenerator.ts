import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { AppFormData, CalculationResult, DayType } from '../types';

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
      ['Data de Início', format(new Date(data.startDate + 'T00:00:00'), 'dd/MM/yyyy')],
      ['Data de Fim', format(result.endDate, 'dd/MM/yyyy')],
      [], // Spacer
      ['DETALHAMENTO DOS DIAS DE FORMAÇÃO'],
      ['Data', 'Tipo']
    ];

    // 2. Prepare Table Data (Only formation-relevant days)
    const tableRows = result.calendar
      .filter(day => 
        day.dayType === DayType.THEORY || 
        day.dayType === DayType.THEORY_RECESS || 
        day.dayType === DayType.HOLIDAY || 
        day.dayType === DayType.RECESS
      )
      .map(day => {
        let typeLabel = 'Outro';
        const desc = day.description || '';

        if (day.dayType === DayType.HOLIDAY) {
          typeLabel = 'Feriado';
        } else if (desc.toLowerCase().includes('imersão')) {
          typeLabel = 'Imersão';
        } else if (desc.toLowerCase().includes('emenda')) {
          typeLabel = 'Emenda';
        } else if (day.dayType === DayType.THEORY_RECESS || desc.toLowerCase().includes('recesso')) {
          typeLabel = 'Recesso';
        } else if (day.dayType === DayType.RECESS) {
          typeLabel = 'Férias jovem';
        } else if (day.dayType === DayType.THEORY) {
          typeLabel = 'Aula Semanal';
        }

        return [format(day.date, 'dd/MM/yyyy'), typeLabel];
      });

    // Combine data
    const finalData = [...summary, ...tableRows];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(finalData);

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Date
      { wch: 30 }  // Type
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