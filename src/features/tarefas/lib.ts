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
  "Dispensa",
  "Inexigibilidade",
  "Concorrência",
  "Adesão a ARP",
  "Registro de Preços",
];

export const TIPOS_SUGERIDOS = [
  "Compra",
  "Serviço",
  "Obra",
  "Registro de preços",
  "Contratação direta",
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
  modalidade: string;
  tipo: string;
  secretaria: string;
  responsavel: string;
  situacao: string;
};

export const FILTROS_VAZIOS: FiltrosTarefas = {
  q: "",
  modalidade: "",
  tipo: "",
  secretaria: "",
  responsavel: "",
  situacao: "",
};

export function filtrosAtivos(f: FiltrosTarefas): number {
  return Object.values(f).filter((v) => v.trim() !== "").length;
}

/** Critério de filtro aplicado, já com rótulo legível (chips e relatório). */
export type CriterioFiltro = { chave: keyof FiltrosTarefas; rotulo: string; valor: string };

/**
 * @param processoTexto processo_id → texto pesquisável (nº e objeto do processo)
 */
export function filtrarTarefas(
  tarefas: Tarefa[],
  f: FiltrosTarefas,
  processoTexto: Map<string, string>,
): Tarefa[] {
  const q = semAcento(f.q.trim());
  return tarefas.filter((t) => {
    if (f.modalidade && t.modalidade !== f.modalidade) return false;
    if (f.tipo && t.tipo !== f.tipo) return false;
    if (f.situacao && t.situacao !== f.situacao) return false;
    if (f.responsavel === "__nenhum__") {
      if (t.responsavel_id) return false;
    } else if (f.responsavel && t.responsavel_id !== f.responsavel) {
      return false;
    }
    if (f.secretaria) {
      if (!t.todas_secretarias && !t.secretaria_ids.includes(f.secretaria)) {
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
