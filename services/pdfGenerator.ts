import jsPDF from 'jspdf';
import { format, getDay, getDaysInMonth, startOfMonth, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppFormData, CalculationResult, DayType, EntityType } from '../types';
import { COLORS, PDF_CONFIG, WEEK_DAYS, LEGEND_DESCRIPTIONS } from '../constants';

// Helper to draw Leapy OPG Logo (Orange Pill)
const drawLeapyOPGLogo = (doc: jsPDF, x: number, y: number, w: number, h: number) => {
  doc.setFillColor(249, 115, 22); // Orange #f97316
  doc.roundedRect(x, y, w, h, h/2, h/2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Leapy GO', x + (w/2), y + (h/1.5), { align: 'center' });
};

// Helper to draw Instituto Leapy Logo (Teal Text)
const drawInstitutoLeapyLogo = (doc: jsPDF, x: number, y: number, w: number, h: number) => {
  doc.setTextColor(53, 220, 178); // Teal #35dcb2
  doc.setFont('helvetica', 'normal'); 
  doc.setFontSize(18);
  doc.text('INSTITUTO | Leapy', x + (w/2), y + (h/1.5), { align: 'center' });
};

export const generatePDF = (data: AppFormData, result: CalculationResult) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, COL_GAP } = PDF_CONFIG;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
  const MONTH_WIDTH = (CONTENT_WIDTH - (COL_GAP * 2)) / 3;

  let currentY = MARGIN;

  // --- Header ---
  const logoW = 60;
  const logoH = 15; 
  if (data.entity === EntityType.INSTITUTO_LEAPY_FREGUESIA || data.entity === EntityType.INSTITUTO_LEAPY_LIBERDADE) {
    drawInstitutoLeapyLogo(doc, MARGIN, currentY, logoW, logoH);
  } else {
    drawLeapyOPGLogo(doc, MARGIN, currentY, logoW, logoH);
  }

  // Title Section
  const titleX = PAGE_WIDTH - MARGIN;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Anexo I', titleX, currentY + 3, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setTextColor(55, 58, 253); 
  doc.setFont('helvetica', 'bold');
  doc.text('Calendário de Atividades Teóricas e Práticas', titleX, currentY + 8, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('Parte Integrante do Contrato de Aprendizagem', titleX, currentY + 13, { align: 'right' });

  currentY += 20;

  // --- Info Grid (Refined for Modalities) ---
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.1);

  const rowHeight = 6;
  // Columns layout
  const col1W = 35; // Label
  const col2W = 60; // Value
  const col3W = 25; // Label
  const col4W = CONTENT_WIDTH - col1W - col2W - col3W; // Value

  const drawInfoCell = (x: number, y: number, w: number, text: string, isLabel: boolean) => {
    if (isLabel) {
      doc.setFillColor(240, 240, 240);
      doc.rect(x, y, w, rowHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }
    doc.rect(x, y, w, rowHeight);
    doc.text(text, x + 2, y + 4.5);
  };

  // Row 1: Course
  drawInfoCell(MARGIN, currentY, col1W, 'Curso:', true);
  drawInfoCell(MARGIN + col1W, currentY, CONTENT_WIDTH - col1W, `${data.courseName} - CBO nº ${data.cboNumber}`, false);
  currentY += rowHeight;

  // Row 1.5: Protocol & CNPJ
  drawInfoCell(MARGIN, currentY, col1W, 'Protocolo:', true);
  drawInfoCell(MARGIN + col1W, currentY, col2W, data.protocol, false);
  drawInfoCell(MARGIN + col1W + col2W, currentY, col3W, 'CNPJ:', true);
  drawInfoCell(MARGIN + col1W + col2W + col3W, currentY, col4W, data.entityCnpj, false);
  currentY += rowHeight;

  // Row 1.6: Razão Social
  drawInfoCell(MARGIN, currentY, col1W, 'Razão Social:', true);
  drawInfoCell(MARGIN + col1W, currentY, CONTENT_WIDTH - col1W, data.entityName, false);
  currentY += rowHeight;

  // Row 1.7: Endereço
  drawInfoCell(MARGIN, currentY, col1W, 'Endereço:', true);
  drawInfoCell(MARGIN + col1W, currentY, CONTENT_WIDTH - col1W, data.courseAddress, false);
  currentY += rowHeight;

  // Row 2: Dates
  drawInfoCell(MARGIN, currentY, col1W, 'Data Início:', true);
  drawInfoCell(MARGIN + col1W, currentY, col2W, format(new Date(data.startDate + 'T00:00:00'), 'dd/MM/yyyy'), false);
  drawInfoCell(MARGIN + col1W + col2W, currentY, col3W, 'Data Fim:', true);
  drawInfoCell(MARGIN + col1W + col2W + col3W, currentY, col4W, format(result.endDate, 'dd/MM/yyyy'), false);
  currentY += rowHeight;

  // Row 3: Immersions (Combined Info)
  const initLabel = `${data.immersionDays} dias (${data.modalityInitial === 'ONLINE' ? 'Remoto' : 'Presencial'})`;
  const endLabel = `${data.immersionDaysEnd} dias (${data.modalityFinal === 'ONLINE' ? 'Remoto' : 'Presencial'})`;
  
  drawInfoCell(MARGIN, currentY, col1W, 'Imersão Inicial:', true);
  drawInfoCell(MARGIN + col1W, currentY, col2W, initLabel, false);
  drawInfoCell(MARGIN + col1W + col2W, currentY, col3W, 'Imersão Final:', true);
  drawInfoCell(MARGIN + col1W + col2W + col3W, currentY, col4W, endLabel, false);
  currentY += rowHeight;

  // Row 4: Weekly Day
  const courseDayName = WEEK_DAYS.find(d => d.id === data.weeklyCourseDay)?.label || '';
  const weeklyModalityLabel = data.modalityWeekly === 'ONLINE' ? 'Remoto' : data.modalityWeekly === 'HYBRID' ? 'Híbrido' : 'Presencial';
  const weeklyLabel = `${courseDayName} (${weeklyModalityLabel})`;
  
  drawInfoCell(MARGIN, currentY, col1W, 'Dia de Curso:', true);
  drawInfoCell(MARGIN + col1W, currentY, col2W, weeklyLabel, false);
  drawInfoCell(MARGIN + col1W + col2W, currentY, col3W, 'Férias:', true);
  drawInfoCell(MARGIN + col1W + col2W + col3W, currentY, col4W, 'Pgto. Rescisão', false);
  currentY += rowHeight + 4;

  // --- Legend ---
  const legendSize = 4;
  const colLegend1 = MARGIN;
  const colLegend2 = MARGIN + 80;
  
  const drawLegendItem = (x: number, y: number, color: string, label: string) => {
    doc.setFillColor(color);
    doc.rect(x, y, legendSize, legendSize, 'F');
    doc.rect(x, y, legendSize, legendSize);
    doc.setFontSize(6.5);
    doc.setTextColor(0,0,0);
    doc.text(label, x + legendSize + 2, y + 3);
  };

  const theoryMod = weeklyModalityLabel;
  const immersionMod = data.modalityInitial === 'ONLINE' ? 'Remoto' : 'Presencial';

  drawLegendItem(colLegend1, currentY, COLORS.IMMERSION, `Atividade Teórica - Imersão (${immersionMod})`);
  drawLegendItem(colLegend2, currentY, COLORS.THEORY, `Atividade Teórica - Semanal (${theoryMod})`);
  currentY += 6;
  
  drawLegendItem(colLegend1, currentY, COLORS.PRACTICE, 'Atividade prática');
  drawLegendItem(colLegend2, currentY, COLORS.HOLIDAY, 'Feriados');
  currentY += 6;
  
  drawLegendItem(colLegend1, currentY, COLORS.THEORY_RECESS, 'Recesso atividade teórica');
  
  currentY += 8;

  // --- Calendar Grid ---
  const months = result.monthsSpanned;
  let colIndex = 0;
  const MONTH_BOX_HEIGHT = 45; 
  
  months.forEach((monthDate) => {
    if (currentY + MONTH_BOX_HEIGHT > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      currentY = MARGIN;
      colIndex = 0;
    }

    const xPos = MARGIN + (colIndex * (MONTH_WIDTH + COL_GAP));
    
    // Month Header
    doc.setFillColor(55, 58, 253); 
    doc.rect(xPos, currentY, MONTH_WIDTH, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(format(monthDate, 'MMMM yyyy', { locale: ptBR }).toUpperCase(), xPos + (MONTH_WIDTH / 2), currentY + 4, { align: 'center' });

    // Week Header
    let gridY = currentY + 6;
    const dayWidth = MONTH_WIDTH / 7;
    const dayHeight = 5;
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    
    ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach((d, i) => {
      doc.setFillColor(240, 240, 240);
      doc.rect(xPos + (i * dayWidth), gridY, dayWidth, dayHeight, 'F');
      doc.text(d, xPos + (i * dayWidth) + (dayWidth / 2), gridY + 3.5, { align: 'center' });
    });
    
    gridY += dayHeight;

    // Days
    const startMonth = startOfMonth(monthDate);
    const daysInMonth = getDaysInMonth(monthDate);
    const startDayOfWeek = getDay(startMonth); // 0 = Sun
    
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const dayOfWeek = (startDayOfWeek + day - 1) % 7;
      const weekIndex = Math.floor((startDayOfWeek + day - 1) / 7);

      const cellX = xPos + (dayOfWeek * dayWidth);
      const cellY = gridY + (weekIndex * dayHeight);

      const dayStatus = result.calendar.find(c => isSameDay(c.date, currentDayDate));
      
      let fillColor = '#FFFFFF';
      let textColor = '#000000';

      if (dayStatus) {
        switch (dayStatus.dayType) {
          case DayType.THEORY: 
            fillColor = COLORS.THEORY; 
            textColor = '#FFFFFF'; 
            break;
          case DayType.IMMERSION: 
            fillColor = COLORS.IMMERSION; 
            textColor = '#FFFFFF'; 
            break;
          case DayType.PRACTICE: 
            fillColor = COLORS.PRACTICE; 
            textColor = '#000000'; 
            break;
          case DayType.THEORY_RECESS: 
            fillColor = COLORS.THEORY_RECESS; 
            textColor = '#000000'; 
            break;
          case DayType.HOLIDAY: 
            fillColor = COLORS.HOLIDAY; 
            textColor = '#FFFFFF'; 
            break;
          case DayType.RECESS: 
            fillColor = COLORS.RECESS; 
            textColor = '#FFFFFF'; 
            break;
          case DayType.WEEKEND: 
            fillColor = '#FFFFFF'; 
            textColor = '#CCCCCC'; 
            break;
        }
      } else {
        fillColor = '#FFFFFF';
        textColor = '#CCCCCC';
      }

      doc.setFillColor(fillColor);
      doc.rect(cellX, cellY, dayWidth, dayHeight, 'F');
      doc.setTextColor(textColor);
      doc.text(day.toString(), cellX + (dayWidth / 2), cellY + 3.5, { align: 'center' });
    }

    colIndex++;
    if (colIndex > 2) {
      colIndex = 0;
      currentY += MONTH_BOX_HEIGHT + 2; 
    }
  });

  // --- Summary ---
  if (currentY + 40 > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    currentY = MARGIN;
  } else {
    currentY = Math.max(currentY, currentY + 10);
    if(colIndex !== 0) currentY += MONTH_BOX_HEIGHT + 2;
  }
  
  doc.setFillColor(50, 50, 50);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 8, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Fechamento / Resumo', MARGIN + 2, currentY + 5);
  currentY += 8;
  
  const tableRowH = 7;
  const col1 = MARGIN;
  const col2 = MARGIN + 40;
  const col3 = MARGIN + 80;
  const col4 = MARGIN + 120;
  
  doc.setFillColor(230, 230, 230);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, tableRowH, 'F');
  doc.setTextColor(0,0,0);
  doc.setFontSize(9);
  doc.text('Item', col1 + 2, currentY + 5);
  doc.text('Dias', col2 + 2, currentY + 5);
  doc.text('Horas', col3 + 2, currentY + 5);
  doc.text('%', col4 + 2, currentY + 5);
  currentY += tableRowH;

  const totalDays = result.totalDaysTheory + result.totalDaysPractice;
  const theoryPct = totalDays > 0 ? Math.round((result.totalDaysTheory / totalDays) * 100) : 0;
  const practicePct = totalDays > 0 ? Math.round((result.totalDaysPractice / totalDays) * 100) : 0;

  const drawSummaryRow = (label: string, days: number, hours: number, pct: string, isTotal = false) => {
    if (isTotal) {
      doc.setFillColor(240, 240, 240);
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, tableRowH, 'F');
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    
    doc.text(label, col1 + 2, currentY + 5);
    doc.text(days.toString(), col2 + 2, currentY + 5);
    doc.text(hours.toString(), col3 + 2, currentY + 5);
    doc.text(pct, col4 + 2, currentY + 5);
    
    doc.setDrawColor(220, 220, 220);
    doc.line(MARGIN, currentY + tableRowH, MARGIN + CONTENT_WIDTH, currentY + tableRowH);
    currentY += tableRowH;
  };

  drawSummaryRow('Teóricas', result.totalDaysTheory, result.totalDaysTheory * 6, `${theoryPct}%`);
  drawSummaryRow('Práticas', result.totalDaysPractice, result.totalDaysPractice * 6, `${practicePct}%`);
  drawSummaryRow('Total', totalDays, totalDays * 6, '100%', true);
  
  currentY += 8;

  // --- Disclaimer ---
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const disclaimerText = "O calendário segue as orientações do MTE e do curso aprovado.";
  const splitDisclaimer = doc.splitTextToSize(disclaimerText, CONTENT_WIDTH);
  doc.text(splitDisclaimer, MARGIN, currentY);
  currentY += (splitDisclaimer.length * 4) + 8;

  // --- Holiday Report ---
  if (currentY + 20 > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    currentY = MARGIN;
  }
  
  doc.setFillColor(50, 50, 50);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Datas Especiais', MARGIN + 2, currentY + 5);
  currentY += 8;

  doc.setFillColor(230, 230, 230);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 6, 'F');
  doc.setTextColor(0,0,0);
  doc.setFontSize(8);
  doc.text('Data', MARGIN + 2, currentY + 4);
  doc.text('Descrição', MARGIN + 30, currentY + 4);
  doc.text('Tipo', MARGIN + 140, currentY + 4);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  result.holidayReport.forEach((item, idx) => {
    if (currentY > PAGE_HEIGHT - MARGIN - 5) {
      doc.addPage();
      currentY = MARGIN;
    }
    
    if (idx % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(MARGIN, currentY, CONTENT_WIDTH, 6, 'F');
    }
    
    doc.text(format(item.date, 'dd/MM/yyyy'), MARGIN + 2, currentY + 4);
    doc.text(item.name.substring(0, 60), MARGIN + 30, currentY + 4);
    
    let typeLabel = item.type;
    if (item.type === 'NATIONAL') typeLabel = 'Nacional';
    if (item.type === 'MUNICIPAL') typeLabel = 'Municipal';
    if (item.type === 'ESTADUAL') typeLabel = 'Estadual';
    if (item.type === 'RECESS') typeLabel = 'Recesso';
    
    doc.text(typeLabel, MARGIN + 140, currentY + 4);
    currentY += 6;
  });

  // --- Legend Details ---
  doc.addPage();
  currentY = MARGIN;

  doc.setFillColor(55, 58, 253);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 10, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Descrição Detalhada das Legendas', MARGIN + 4, currentY + 6.5);
  currentY += 15;

  const drawDescriptionBlock = (color: string, title: string, description: string) => {
     doc.setDrawColor(200, 200, 200);
     doc.setFillColor(255, 255, 255);
     doc.rect(MARGIN, currentY, CONTENT_WIDTH, 20, 'F'); 
     
     doc.setFillColor(color);
     doc.rect(MARGIN, currentY, 6, 25, 'F'); 
     
     doc.setTextColor(0,0,0);
     doc.setFont('helvetica', 'bold');
     doc.setFontSize(10);
     doc.text(title, MARGIN + 10, currentY + 6);
     
     doc.setFont('helvetica', 'normal');
     doc.setFontSize(9);
     doc.setTextColor(60, 60, 60);
     const splitDesc = doc.splitTextToSize(description, CONTENT_WIDTH - 20);
     doc.text(splitDesc, MARGIN + 10, currentY + 12);
     
     const blockHeight = Math.max(25, (splitDesc.length * 5) + 15);
     doc.setDrawColor(230, 230, 230);
     doc.rect(MARGIN, currentY, CONTENT_WIDTH, blockHeight); 
     doc.setFillColor(color);
     doc.rect(MARGIN, currentY, 2, blockHeight, 'F');
     
     currentY += blockHeight + 5;
  };

  drawDescriptionBlock(COLORS.IMMERSION, 'Atividade Teórica - Imersão (Inicial/Final)', LEGEND_DESCRIPTIONS.IMMERSION);
  drawDescriptionBlock(COLORS.THEORY, 'Atividade Teórica - Semanal (Curso)', LEGEND_DESCRIPTIONS.THEORY);
  drawDescriptionBlock(COLORS.PRACTICE, 'Atividade Prática (Empresa)', LEGEND_DESCRIPTIONS.PRACTICE);
  drawDescriptionBlock(COLORS.THEORY_RECESS, 'Recesso Teórico (Disp. Prática)', LEGEND_DESCRIPTIONS.THEORY_RECESS);
  drawDescriptionBlock(COLORS.HOLIDAY, 'Feriados', LEGEND_DESCRIPTIONS.HOLIDAY);

  const filenameDate = format(new Date(data.startDate + 'T00:00:00'), 'dd-MM-yyyy');
  const sanitizedCourse = data.courseName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  doc.save(`Calendario_Aprendizagem_-_${filenameDate}_-_${sanitizedCourse}.pdf`);
};