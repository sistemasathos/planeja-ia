import type { Database, Json } from "@/integrations/supabase/types";

export type Etapa = Database["public"]["Tables"]["tarefa_etapas"]["Row"];
export type CampoRow = Database["public"]["Tables"]["tarefa_campos"]["Row"];
export type TarefaRow = Database["public"]["Tables"]["tarefas"]["Row"];
export type AnexoRow = Database["public"]["Tables"]["tarefa_anexos"]["Row"];
export type EventoRow = Database["public"]["Tables"]["tarefa_eventos"]["Row"];

export type CampoTipo = "texto" | "numero" | "data" | "link" | "lista";
export type Situacao = "ok" | "atencao" | "travada";

export type Campo = Omit<CampoRow, "opcoes" | "tipo"> & {
  tipo: CampoTipo;
  opcoes: string[];
};

export type Tarefa = Omit<TarefaRow, "campos" | "situacao"> & {
  situacao: Situacao;
  campos: Record<string, string>;
  secretaria_ids: string[];
  anexos_count: number;
};

export type MembroEquipe = { id: string; nome: string; cargo: string | null };

export type ProcessoResumo = { numero: string; objeto: string };

export const CAMPO_TIPOS: { value: CampoTipo; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "data", label: "Data" },
  { value: "link", label: "Link" },
  { value: "lista", label: "Lista de opções" },
];

export const SITUACOES: { value: Situacao; label: string }[] = [
  { value: "ok", label: "Em dia" },
  { value: "atencao", label: "Atenção" },
  { value: "travada", label: "Travada" },
];

export const MODALIDADES_SUGERIDAS = [
  "Pregão Eletrônico",
  "Concorrência",
  "Dispensa Eletrônica",
  "Inexigibilidade",
  "Adesão a ARP",
  "Credenciamento",
  "Chamamento Público",
];

export const TIPOS_SUGERIDOS = [
  "Compras",
  "Serviços Comuns",
  "Obras",
  "Serviços de Engenharia Comuns",
];

export const LIMITE_POR_COLUNA = 50;
export const MAX_ANEXO_BYTES = 25 * 1024 * 1024;
export const TAREFAS_BUCKET = "tarefas-files";
export const PASSO_POSICAO = 1000;

export const COR_PADRAO = "#64748b";
/** Cores de etapa sem verde/âmbar/vermelho, reservados às situações. */
export const CORES_SUGERIDAS = [
  "#6366f1",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#64748b",
];

/* ------------------------------ Normalizadores ------------------------------ */

/** Rótulo curto da etiqueta (DFD, ETP). Cai no nome quando não há sigla. */
export function siglaIdentificador(c: Pick<Campo, "nome" | "sigla">): string {
  const sigla = (c.sigla ?? "").trim();
  if (sigla) return sigla.toLocaleUpperCase("pt-BR");
  return c.nome.replace(/^n[uú]mero\s+d[eoa]s?\s+/i, "").trim() || c.nome;
}

export function identificadoresDaEtapa(campos: Campo[], etapaId: string): Campo[] {
  return campos
    .filter((c) => c.etapa_id === etapaId && c.identificador && !c.arquivado)
    .sort((a, b) => a.posicao - b.posicao);
}

/** Identificadores da etapa ainda sem valor. Etapa sem esses campos devolve lista vazia. */
export function identificadoresPendentes(
  campos: Campo[],
  etapaId: string,
  valores: Record<string, string>,
): Campo[] {
  return identificadoresDaEtapa(campos, etapaId).filter((c) => !(valores[c.id] ?? "").trim());
}

/** Junta os números informados no avanço ao mapa já salvo da tarefa. Vazio remove a chave. */
export function mesclarIdentificadores(
  base: Record<string, string>,
  form: Record<string, string>,
): Record<string, string> {
  const out = { ...base };
  for (const [k, v] of Object.entries(form)) {
    const texto = v.trim().slice(0, 80);
    if (texto) out[k] = texto;
    else delete out[k];
  }
  return out;
}

export function normalizarCampo(row: CampoRow): Campo {
  const opcoes = Array.isArray(row.opcoes)
    ? (row.opcoes as Json[]).filter((o): o is string => typeof o === "string")
    : [];
  const tipo = (["texto", "numero", "data", "link", "lista"] as const).includes(
    row.tipo as CampoTipo,
  )
    ? (row.tipo as CampoTipo)
    : "texto";
  return { ...row, tipo, opcoes };
}

export function normalizarCamposValores(raw: Json): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

export function normalizarSituacao(v: string): Situacao {
  return v === "atencao" || v === "travada" ? v : "ok";
}

/* --------------------------------- Posições -------------------------------- */

/** Posição fracionária entre dois vizinhos (qualquer um pode ser ausente). */
export function posicaoEntre(
  anterior: number | undefined,
  proximo: number | undefined,
): number {
  if (anterior === undefined && proximo === undefined) return PASSO_POSICAO;
  if (anterior === undefined) return (proximo as number) - PASSO_POSICAO;
  if (proximo === undefined) return anterior + PASSO_POSICAO;
  return (anterior + proximo) / 2;
}

/** True quando o intervalo ficou pequeno demais e a coluna precisa ser renumerada. */
export function precisaRebalancear(
  anterior: number | undefined,
  proximo: number | undefined,
): boolean {
  return (
    anterior !== undefined &&
    proximo !== undefined &&
    Math.abs(proximo - anterior) < 1e-6
  );
}

/* ---------------------------------- Links ---------------------------------- */

/** Retorna a URL normalizada somente se for http/https; senão null. */
export function urlSegura(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ----------------------------------- Cores ---------------------------------- */

export function corValida(cor: string | null | undefined): string {
  return cor && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : COR_PADRAO;
}

/** Cor de texto (preto/branco) legível sobre o fundo informado. */
export function corTextoSobre(fundo: string): "#ffffff" | "#111827" {
  const c = corValida(fundo).slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#111827" : "#ffffff";
}

export function rgbDe(hex: string): [number, number, number] {
  const c = corValida(hex).slice(1);
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

/* --------------------------------- Formatação ------------------------------- */

export function diasDesde(iso: string, agora = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

export type DocumentoChave = "dfd" | "pesquisa" | "etp" | "certame";
export type RegraTramitacao = "pesquisa" | "etp" | "publicacao" | "julgamento" | "contratacao";

export const DOCUMENTOS_FIXOS: { chave: DocumentoChave; titulo: string; horario: boolean }[] = [
  { chave: "dfd", titulo: "DFD", horario: false },
  { chave: "pesquisa", titulo: "Pesquisa", horario: false },
  { chave: "etp", titulo: "ETP", horario: false },
  { chave: "certame", titulo: "Certame", horario: true },
];

export const FASES_JULGAMENTO: { chave: string; nome: string }[] = [
  { chave: "analise", nome: "Análise de propostas" },
  { chave: "exequibilidade", nome: "Exequibilidade" },
  { chave: "habilitacao", nome: "Habilitação" },
  { chave: "recursal", nome: "Fase recursal" },
  { chave: "adjudicacao", nome: "Adjudicação / Homologação" },
  { chave: "convocacao", nome: "Convocação" },
];

export type FaseSituacao = "pendente" | "em_andamento" | "concluida";

export const FASE_SITUACOES: { value: FaseSituacao; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
];

/** Etapa de destino → dados pedidos no avanço. Etapa fora do fluxo não pede nada aqui. */
export function regraTramitacao(nomeEtapa: string): RegraTramitacao | null {
  const n = nomeEtapa
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("pesquisa") || n.includes("cotac")) return "pesquisa";
  if (n.startsWith("etp") || n.includes("estudo tecnico")) return "etp";
  if (n.includes("public")) return "publicacao";
  if (n.includes("julg")) return "julgamento";
  if (n.includes("contrat")) return "contratacao";
  return null;
}

export type DocumentoResumo = {
  chave: string | null;
  titulo: string;
  numero: string | null;
  data: string | null;
  horario: string | null;
};

/** Ainda falta número ou data obrigatórios. Publicação, julgamento e contratação não bloqueiam. */
export function tramitacaoPendente(
  regra: RegraTramitacao,
  docs: DocumentoResumo[],
): boolean {
  const doc = docs.find((d) => d.chave === (regra === "publicacao" ? "certame" : regra));
  if (regra === "pesquisa" || regra === "etp") {
    return !doc?.numero?.trim() || !doc?.data;
  }
  if (regra === "publicacao") {
    return !doc?.numero?.trim() || !doc?.data || !doc?.horario;
  }
  return true;
}

/** Data `yyyy-mm-dd` em dd/mm/aaaa, sem deslocar o fuso. */
export function formatarDia(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return formatarData(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

/** Valores `yyyy-mm-dd` (campos tipo data) → dd/mm/aaaa sem deslocar fuso. */
export function formatarValorCampo(campo: Campo, valor: string | undefined): string {
  if (!valor) return "";
  if (campo.tipo === "data" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split("-");
    return `${d}/${m}/${y}`;
  }
  return valor;
}

/* ----------------------------------- Busca ---------------------------------- */

/** Remove caracteres que quebram filtros do PostgREST (`,`, `(`, `)`, `%` …). */
export function sanitizarBusca(valor: string): string {
  return valor
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/* ---------------------------------- Filtros --------------------------------- */

export type FiltrosTarefas = {
  q: string;
  modalidade: string[];
  tipo: string[];
  secretaria: string[];
  responsavel: string[];
  situacao: string[];
};

export const FILTROS_VAZIOS: FiltrosTarefas = {
  q: "",
  modalidade: [],
  tipo: [],
  secretaria: [],
  responsavel: [],
  situacao: [],
};

export function filtrosAtivos(f: FiltrosTarefas): number {
  return (
    (f.q.trim() ? 1 : 0) +
    f.modalidade.length +
    f.tipo.length +
    f.secretaria.length +
    f.responsavel.length +
    f.situacao.length
  );
}

/** Critério de filtro aplicado, já com rótulo legível (chips e relatório). */
export type CriterioFiltro = {
  chave: keyof FiltrosTarefas;
  rotulo: string;
  valor: string;
  /** Valor a remover quando o chip é de uma lista. */
  item?: string;
};

/**
 * @param processoTexto processo_id → texto pesquisável (nº e objeto do processo)
 */
export function filtrarTarefas(
  tarefas: Tarefa[],
  f: FiltrosTarefas,
  processoTexto: Map<string, string>,
  gruposSecretaria?: Map<string, string[]>,
): Tarefa[] {
  const q = semAcento(f.q.trim());
  return tarefas.filter((t) => {
    if (f.modalidade.length && !f.modalidade.includes(t.modalidade ?? "")) return false;
    if (f.tipo.length && !f.tipo.includes(t.tipo ?? "")) return false;
    if (f.situacao.length && !f.situacao.includes(t.situacao)) return false;
    if (f.responsavel.length) {
      const sem = f.responsavel.includes("__nenhum__") && !t.responsavel_id;
      const marcado = Boolean(t.responsavel_id && f.responsavel.includes(t.responsavel_id));
      if (!sem && !marcado) return false;
    }
    if (f.secretaria.length) {
      const ids = f.secretaria.flatMap((id) => gruposSecretaria?.get(id) ?? [id]);
      if (!t.todas_secretarias && !t.secretaria_ids.some((id) => ids.includes(id))) {
        return false;
      }
    }
    if (q) {
      const alvo = semAcento(
        [
          t.titulo,
          t.observacao ?? "",
          t.modalidade ?? "",
          t.tipo ?? "",
          t.processo_id ? (processoTexto.get(t.processo_id) ?? "") : "",
          ...Object.values(t.campos),
        ].join(" "),
      );
      if (!alvo.includes(q)) return false;
    }
    return true;
  });
}
