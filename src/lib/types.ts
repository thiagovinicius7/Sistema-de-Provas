export type TipoProva = 'CE' | 'ME';
export type Dificuldade = 'F' | 'M' | 'D' | '';

export const LISTA_STATUS = [
  'Evento não iniciado',
  'Em elaboração',
  'Entrega realizada',
  'Liberação feita',
  'Recursos respondidos',
  'Esperando pagamento',
  'Evento finalizado',
] as const;

export type StatusEvento = (typeof LISTA_STATUS)[number];

export const STATUS_FINAL: StatusEvento = 'Evento finalizado';

export interface Evento {
  id: string;
  titulo: string;
  cargo: string;
  /** yyyy-mm-dd */
  data: string;
  tipo: TipoProva;
  status: StatusEvento;
  /** Meta total: nº de questões (ME) ou de itens (CE). */
  meta: number;
  /** Valor pago por questão/item. */
  valorUnit: number;
  /** Percentuais de Fácil, Médio e Difícil. */
  metaF: number;
  metaM: number;
  metaD: number;
  link: string;
  conteudo: string;
  obs: string;
  planejamento: string;
  /** Lista de tópicos do edital editada à mão (vazia = extrair do conteúdo). */
  topicos: string[];
  /** Fontes cadastradas neste evento (cada evento tem a sua lista). */
  fontes: string[];
  /** Pagamento efetivo. null = ainda não registrado. */
  valorRecebido: number | null;
  /** yyyy-mm-dd */
  dataPagamento: string;
  criadoEm?: unknown;
  atualizadoEm?: unknown;
}

export interface Item {
  /** Só ME: A, B, C, D, E. */
  letra?: string;
  texto: string;
  /** ME: certa/errada. CE: C/E. Texto livre preservado do sistema antigo. */
  gab: string;
  /** Só CE. */
  dif?: Dificuldade;
  edital: string;
  justificativa: string;
  /** Referência bibliográfica da justificativa (campo próprio desde o BancoP). */
  fonte?: string;
}

export interface Questao {
  id: string;
  eventoId: string;
  numero: number;
  enunciado: string;
  tipo: TipoProva;
  /** Só ME: dificuldade e gabarito da questão. */
  dif: Dificuldade;
  gab: string;
  itens: Item[];
  criadoEm?: unknown;
  atualizadoEm?: unknown;
}

export type EventoDados = Omit<Evento, 'id' | 'criadoEm' | 'atualizadoEm'>;
export type QuestaoDados = Omit<Questao, 'id' | 'criadoEm' | 'atualizadoEm'>;

/** Entrada que não é pagamento de prova (ex.: horas de trabalho presencial). */
export interface Recebimento {
  id: string;
  /** yyyy-mm-dd */
  data: string;
  descricao: string;
  horas: number | null;
  /** Valor que caiu na conta. */
  valor: number;
}
