import { EntidadeCursoConfig, EntityType } from './types';

export const HOURS_PER_DAY = 6;

// Tabela Entidade x Curso: fonte única de verdade para autopreenchimento dos
// campos contratuais (CBO, Protocolo, Razão Social, CNPJ, Endereço, etc).
// Array editável — adicionar novas linhas aqui para novas combinações Entidade+Curso.
export const ENTIDADE_CURSO_CONFIG: EntidadeCursoConfig[] = [
  {
    entidade: EntityType.LEAPY_FREGUESIA,
    curso: 'Técnico em Administração',
    cbo: '3513-05 Técnico em administração',
    protocolo: '308820.6735588/2025',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'ONLINE',
    immersionModalityFinal: 'ONLINE',
    immersionDays: 7,
    immersionDaysEnd: 0,
    entityName: 'LEAPY OPG FRG - EDUCAÇÃO E TREINAMENTO LTDA',
    entityCnpj: '15.027.454/0001-23',
    courseAddress: 'Av. Itaberaba, 1296 - Freguesia do Ó, São Paulo - SP (Transporte da Barra Funda até Freguesia do Ó)',
    uf: 'SP',
    city: 'São Paulo',
  },
  {
    entidade: EntityType.LEAPY_FREGUESIA,
    curso: 'Técnico em RH',
    cbo: '4110-10 Assistente Administrativo; 3513-15 Agente de recrutamento e seleção',
    protocolo: '308820.6960780/2026',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'ONLINE',
    immersionModalityFinal: 'ONLINE',
    immersionDays: 7,
    immersionDaysEnd: 0,
    entityName: 'LEAPY OPG FRG - EDUCAÇÃO E TREINAMENTO LTDA',
    entityCnpj: '15.027.454/0001-23',
    courseAddress: 'Av. Itaberaba, 1296 - Freguesia do Ó, São Paulo - SP (Transporte da Barra Funda até Freguesia do Ó)',
    uf: 'SP',
    city: 'São Paulo',
  },
  {
    entidade: EntityType.LEAPY_LIBERDADE,
    curso: 'Técnico em RH',
    cbo: '4110-10 Assistente Administrativo; 3513-15 Agente de recrutamento e seleção',
    protocolo: '308820.7249341/2026',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'ONLINE',
    immersionModalityFinal: 'ONLINE',
    immersionDays: 7,
    immersionDaysEnd: 0,
    entityName: 'LEAPY OPG FRG - EDUCAÇÃO E TREINAMENTO LTDA',
    entityCnpj: '15.027.454/0001-23',
    courseAddress: 'Av. Liberdade, 532 - Liberdade, São Paulo - SP',
    uf: 'SP',
    city: 'São Paulo',
  },
  {
    entidade: EntityType.INSTITUTO_LEAPY_FREGUESIA,
    curso: 'Jovem Aprendiz Assistente Administrativo',
    cbo: 'Administrativo - 411005, 411010, 411030, 414105, 422105',
    protocolo: '308820.7157545/2026',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'ONLINE',
    immersionModalityFinal: 'ONLINE',
    immersionDays: 7,
    immersionDaysEnd: 0,
    entityName: 'INSTITUTO LEAPY',
    entityCnpj: '64.064.873/0001-40',
    courseAddress: 'Av. Itaberaba, 1296 - Freguesia do Ó, São Paulo - SP (Transporte da Barra Funda até Freguesia do Ó)',
    uf: 'SP',
    city: 'São Paulo',
  },
  {
    entidade: EntityType.INSTITUTO_LEAPY_LIBERDADE,
    curso: 'Jovem Aprendiz Assistente Administrativo',
    cbo: 'Administrativo - 411005, 411010, 411030, 414105, 422105',
    protocolo: '308820.7157681/2026',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'ONLINE',
    immersionModalityFinal: 'ONLINE',
    immersionDays: 7,
    immersionDaysEnd: 0,
    entityName: 'INSTITUTO LEAPY',
    entityCnpj: '64.064.873/0001-40',
    courseAddress: 'Av. Liberdade, 532 - Liberdade, São Paulo - SP',
    uf: 'SP',
    city: 'São Paulo',
  },
  {
    entidade: EntityType.INSTITUTO_LEAPY_LIBERDADE,
    curso: 'Assistente de Gestão de Dados - Economia 4.0',
    cbo: '212305 - Administrador de Banco de Dados; 212405 - Analista de Desenvolvimento de Sistemas',
    protocolo: '308820.7158342/2026',
    totalTheoryHours: 400,
    totalPracticeHours: 1428,
    immersionModalityInitial: 'PRESENTIAL',
    immersionModalityFinal: 'PRESENTIAL',
    immersionDays: 10,
    immersionDaysEnd: 10,
    entityName: 'INSTITUTO LEAPY',
    entityCnpj: '64.064.873/0001-40',
    courseAddress: 'Av. Liberdade, 532 - Liberdade, São Paulo - SP',
    uf: 'SP',
    city: 'São Paulo',
  },
];

export const WEEK_DAYS = [
  { id: 1, label: 'Segunda-feira' },
  { id: 2, label: 'Terça-feira' },
  { id: 3, label: 'Quarta-feira' },
  { id: 4, label: 'Quinta-feira' },
  { id: 5, label: 'Sexta-feira' },
];

export const COLORS = {
  THEORY: '#373afd', // Blue
  IMMERSION: '#1e3a8a', // Stronger Blue (Blue 900)
  PRACTICE: '#FEF08A', // Light Yellow (Yellow 200)
  THEORY_RECESS: '#bfdbfe', // Very Light Blue (Blue 200)
  RECESS: '#9CA3AF', // Gray 400
  HOLIDAY: '#374151', // Dark Gray (Gray 700)
  WEEKEND: '#FFFFFF',
  TEXT_DARK: '#111827',
  TEXT_LIGHT: '#FFFFFF',
};

// PDF Configuration
export const PDF_CONFIG = {
  PAGE_WIDTH: 210, // A4 width in mm
  PAGE_HEIGHT: 297, // A4 height in mm
  MARGIN: 10,
  COL_GAP: 5,
};

export const LEGEND_DESCRIPTIONS = {
  IMMERSION: "Período de imersão inicial ou final na entidade formadora.",
  THEORY: "Dia destinado à atividade teórica (curso) na entidade formadora.",
  PRACTICE: "Dia destinado à atividade prática na empresa contratante. O aprendiz deve verificar o formato (presencial ou remoto) diretamente com a empresa.",
  THEORY_RECESS: "Recesso da atividade teórica (curso). O aprendiz deve comparecer à empresa para atividade prática, salvo se a empresa conceder folga (mera liberalidade). Emendas de feriado ou recesso escolar se enquadram aqui.",
  HOLIDAY: "Feriado Nacional, Estadual ou Municipal. Não há atividade teórica nem prática.",
};

export const BRAZIL_STATES = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
];

// Mock data for major cities/capitals
export const CITIES_BY_STATE: Record<string, string[]> = {
  'SP': ['São Paulo', 'Campinas', 'Guarulhos', 'Osasco', 'São Bernardo do Campo'],
  'RJ': ['Rio de Janeiro', 'Niterói', 'São Gonçalo', 'Duque de Caxias'],
  'MG': ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'],
  'ES': ['Vitória', 'Vila Velha', 'Serra'],
  'PR': ['Curitiba', 'Londrina', 'Maringá'],
  'SC': ['Florianópolis', 'Joinville', 'Blumenau'],
  'RS': ['Porto Alegre', 'Caxias do Sul', 'Canoas'],
  'BA': ['Salvador', 'Feira de Santana', 'Vitória da Conquista'],
  'PE': ['Recife', 'Jaboatão dos Guararapes', 'Olinda'],
  'CE': ['Fortaleza', 'Caucaia', 'Juazeiro do Norte'],
  'DF': ['Brasília'],
  'GO': ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'],
  'AM': ['Manaus'],
  'PA': ['Belém', 'Ananindeua'],
  'MA': ['São Luís'],
  'MT': ['Cuiabá', 'Várzea Grande'],
  'MS': ['Campo Grande', 'Dourados'],
  'PB': ['João Pessoa', 'Campina Grande'],
  'RN': ['Natal', 'Mossoró'],
  'AL': ['Maceió', 'Arapiraca'],
  'PI': ['Teresina'],
  'SE': ['Aracaju'],
  'TO': ['Palmas'],
  'RO': ['Porto Velho'],
  'AC': ['Rio Branco'],
  'RR': ['Boa Vista'],
  'AP': ['Macapá'],
};