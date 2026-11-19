import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { safeFileName } from "@/lib/utils/normalize";
import {
  MAX_ANEXO_BYTES,
  PASSO_POSICAO,
  TAREFAS_BUCKET,
  normalizarCamposValores,
  normalizarCampo,
  normalizarSituacao,
  sanitizarBusca,
  type Campo,
  type CampoTipo,
  type Etapa,
  DOCUMENTOS_FIXOS,
  FASES_JULGAMENTO,
  type EventoRow,
  type AnexoRow,
  type MembroEquipe,
  type RegraTramitacao,
  type Tarefa,
} from "./lib";

type TarefaUpdate = Database["public"]["Tables"]["tarefas"]["Update"];

export const TAREFAS_KEYS = {
  etapas: ["tarefas", "etapas"] as const,
  campos: ["tarefas", "campos"] as const,
  lista: ["tarefas", "lista"] as const,
  equipe: ["equipe-usuarios"] as const,
  anexos: (id: string) => ["tarefas", "anexos", id] as const,
  eventos: (id: string) => ["tarefas", "eventos", id] as const,
  documentos: ["tarefas", "documentos"] as const,
  fases: (id: string) => ["tarefas", "fases", id] as const,
  fasesQuadro: ["tarefas", "fases", "quadro"] as const,
  contratos: (id: string) => ["tarefas", "contratos", id] as const,
};

export class ConflitoTarefaError extends Error {
  constructor() {
    super("A demanda foi alterada por outra pessoa. Os dados foram recarregados.");
    this.name = "ConflitoTarefaError";
  }
}

/* --------------------------------- Consultas -------------------------------- */

export function useEtapas() {
  return useQuery({
    queryKey: TAREFAS_KEYS.etapas,
    queryFn: async (): Promise<Etapa[]> => {
      const { data, error } = await supabase
        .from("tarefa_etapas")
        .select("*")
        .order("posicao", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCampos() {
  return useQuery({
    queryKey: TAREFAS_KEYS.campos,
    queryFn: async (): Promise<Campo[]> => {
      const { data, error } = await supabase
        .from("tarefa_campos")
        .select("*")
        .order("posicao", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(normalizarCampo);
    },
  });
}

export function useTarefas() {
  return useQuery({
    queryKey: TAREFAS_KEYS.lista,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("*, tarefa_secretarias(secretaria_id), tarefa_anexos(count)")
        .is("deleted_at", null)
        .order("posicao", { ascending: true })
        .range(0, 999);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { tarefa_secretarias, tarefa_anexos, campos, situacao, ...resto } =
          row;
        return {
          ...resto,
          situacao: normalizarSituacao(situacao),
          campos: normalizarCamposValores(campos),
          secretaria_ids: (tarefa_secretarias ?? []).map((s) => s.secretaria_id),
          anexos_count: tarefa_anexos?.[0]?.count ?? 0,
        };
      });
    },
  });
}

export function useEquipe() {
  return useQuery({
    queryKey: TAREFAS_KEYS.equipe,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MembroEquipe[]> => {
      const { data, error } = await supabase.rpc("equipe_usuarios");
      if (error) throw error;
      return (data ?? []) as MembroEquipe[];
    },
  });
}

export type ProcessoResumo = {
  id: string;
  numero_processo: string | null;
  objeto: string;
};

export function useProcessosPorIds(ids: string[]) {
  const chave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["tarefas", "processos-ids", chave],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ProcessoResumo[]> => {
      const { data, error } = await supabase
        .from("processos")
        .select("id, numero_processo, objeto")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBuscaProcessos(termo: string, habilitado: boolean) {
  const t = sanitizarBusca(termo);
  return useQuery({
    queryKey: ["tarefas", "processos-busca", t],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<ProcessoResumo[]> => {
      let q = supabase
        .from("processos")
        .select("id, numero_processo, objeto")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (t) {
        q = q.or(`numero_processo.ilike.%${t}%,objeto.ilike.%${t}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAnexos(tarefaId: string | null) {
  return useQuery({
    queryKey: TAREFAS_KEYS.anexos(tarefaId ?? ""),
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<AnexoRow[]> => {
      const { data, error } = await supabase
        .from("tarefa_anexos")
        .select("*")
        .eq("tarefa_id", tarefaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEventos(tarefaId: string | null) {
  return useQuery({
    queryKey: TAREFAS_KEYS.eventos(tarefaId ?? ""),
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<EventoRow[]> => {
      const { data, error } = await supabase
        .from("tarefa_eventos")
        .select("*")
        .eq("tarefa_id", tarefaId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* --------------------------------- Mutações --------------------------------- */

function invalidarTarefas(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: TAREFAS_KEYS.lista });
}

export function useCriarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      titulo: string;
      etapa_id: string;
      posicao: number;
      data_inclusao?: string;
      campos?: Record<string, string>;
    }): Promise<Tarefa> => {
      const { data, error } = await supabase
        .from("tarefas")
        .insert({
          titulo: input.titulo.trim(),
          etapa_id: input.etapa_id,
          posicao: input.posicao,
          ...(input.data_inclusao ? { data_inclusao: input.data_inclusao } : {}),
          ...(input.campos ? { campos: input.campos as Json } : {}),
        })
        .select("*")
        .single();
      if (error) throw error;
      return {
        ...data,
        situacao: normalizarSituacao(data.situacao),
        campos: normalizarCamposValores(data.campos),
        secretaria_ids: [],
        anexos_count: 0,
      };
    },
    onSuccess: () => void invalidarTarefas(qc),
  });
}

export type PatchTarefa = {
  titulo?: string;
  etapa_id?: string;
  tipo?: string | null;
  modalidade?: string | null;
  todas_secretarias?: boolean;
  processo_id?: string | null;
  link_url?: string | null;
  responsavel_id?: string | null;
  situacao?: string;
  observacao?: string | null;
  campos?: Record<string, string>;
  data_inclusao?: string;
};

export function useAtualizarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      baseUpdatedAt: string;
      patch: PatchTarefa;
      secretariaIds?: string[];
    }) => {
      const patch: TarefaUpdate = { ...input.patch, campos: undefined };
      if (input.patch.campos) patch.campos = input.patch.campos as Json;
      const { data, error } = await supabase
        .from("tarefas")
        .update(patch)
        .eq("id", input.id)
        .eq("updated_at", input.baseUpdatedAt)
        .select("id, updated_at");
      if (error) throw error;
      if (!data || data.length === 0) throw new ConflitoTarefaError();

      if (input.secretariaIds) {
        await sincronizarSecretarias(input.id, input.secretariaIds);
      }
      return data[0];
    },
    onSettled: () => {
      void invalidarTarefas(qc);
    },
  });
}

async function sincronizarSecretarias(tarefaId: string, ids: string[]) {
  const { data: atuais, error: curErr } = await supabase
    .from("tarefa_secretarias")
    .select("secretaria_id")
    .eq("tarefa_id", tarefaId);
  if (curErr) throw curErr;
  const manter = new Set(ids);
  const remover = (atuais ?? [])
    .map((a) => a.secretaria_id)
    .filter((s) => !manter.has(s));
  if (remover.length) {
    const { error } = await supabase
      .from("tarefa_secretarias")
      .delete()
      .eq("tarefa_id", tarefaId)
      .in("secretaria_id", remover);
    if (error) throw error;
  }
  if (ids.length) {
    const { error } = await supabase.from("tarefa_secretarias").upsert(
      ids.map((secretaria_id) => ({ tarefa_id: tarefaId, secretaria_id })),
      { onConflict: "tarefa_id,secretaria_id" },
    );
    if (error) throw error;
  }
}

export type MoverTarefaInput = {
  id: string;
  etapa_id: string;
  posicao: number;
  /** Renumera a coluna de destino quando o intervalo ficou minúsculo. */
  rebalancear?: string[];
  /** Mapa completo de campos, quando o avanço grava identificadores junto com a etapa. */
  campos?: Record<string, string>;
};

export function useMoverTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MoverTarefaInput) => {
      const campos = input.campos ? (input.campos as Json) : undefined;
      if (input.rebalancear?.length) {
        await Promise.all(
          input.rebalancear.map((id, i) =>
            supabase
              .from("tarefas")
              .update({
                posicao: (i + 1) * PASSO_POSICAO,
                ...(id === input.id
                  ? { etapa_id: input.etapa_id, ...(campos ? { campos } : {}) }
                  : {}),
              })
              .eq("id", id)
              .then(({ error }) => {
                if (error) throw error;
              }),
          ),
        );
        return;
      }
      const { error } = await supabase
        .from("tarefas")
        .update({
          etapa_id: input.etapa_id,
          posicao: input.posicao,
          ...(campos ? { campos } : {}),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: TAREFAS_KEYS.lista });
      const anterior = qc.getQueryData<Tarefa[]>(TAREFAS_KEYS.lista);
      qc.setQueryData<Tarefa[]>(TAREFAS_KEYS.lista, (atual) =>
        (atual ?? []).map((t) =>
          t.id === input.id
            ? {
                ...t,
                etapa_id: input.etapa_id,
                posicao: input.posicao,
                ...(input.campos ? { campos: input.campos } : {}),
                etapa_desde:
                  t.etapa_id === input.etapa_id
                    ? t.etapa_desde
                    : new Date().toISOString(),
              }
            : t,
        ),
      );
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(TAREFAS_KEYS.lista, ctx.anterior);
    },
    onSettled: () => void invalidarTarefas(qc),
  });
}

export function useExcluirTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void invalidarTarefas(qc),
  });
}

/* ---------------------------------- Etapas ---------------------------------- */

export function useSalvarEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      nome: string;
      cor: string;
      finaliza: boolean;
      posicaoNova?: number;
    }) => {
      const base = {
        nome: input.nome.trim(),
        cor: input.cor,
        finaliza: input.finaliza,
      };
      if (input.id) {
        const { error } = await supabase
          .from("tarefa_etapas")
          .update(base)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("tarefa_etapas")
        .insert({ ...base, posicao: input.posicaoNova ?? PASSO_POSICAO });
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.etapas }),
  });
}

export function useAtualizarEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<Etapa, "posicao" | "arquivada">>;
    }) => {
      const { error } = await supabase
        .from("tarefa_etapas")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.etapas }),
  });
}

export function useExcluirEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefa_etapas")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.etapas });
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.campos });
    },
  });
}

/* ---------------------------------- Campos ---------------------------------- */

export function useSalvarCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      etapa_id: string;
      nome: string;
      tipo: CampoTipo;
      opcoes: string[];
      usa_como_fase: boolean;
      identificador: boolean;
      sigla: string;
      obrigatorio: boolean;
      posicao?: number;
    }) => {
      const identificador =
        input.identificador && (input.tipo === "texto" || input.tipo === "numero");
      const base = {
        nome: input.nome.trim(),
        tipo: input.tipo,
        opcoes: (input.tipo === "lista" ? input.opcoes : []) as Json,
        usa_como_fase: input.tipo === "lista" && input.usa_como_fase && !identificador,
        identificador,
        sigla: identificador
          ? input.sigla.trim().toLocaleUpperCase("pt-BR").slice(0, 16) || null
          : null,
        obrigatorio: identificador && input.obrigatorio,
      };
      if (input.id) {
        const { error } = await supabase
          .from("tarefa_campos")
          .update(base)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("tarefa_campos").insert({
        ...base,
        etapa_id: input.etapa_id,
        posicao: input.posicao ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.campos }),
  });
}

export function useArquivarCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; arquivado: boolean }) => {
      const { error } = await supabase
        .from("tarefa_campos")
        .update({ arquivado: input.arquivado })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.campos }),
  });
}

/* ---------------------------------- Anexos ---------------------------------- */

export function useEnviarAnexo(tarefaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_ANEXO_BYTES) {
        throw new Error(
          `"${file.name}" excede o limite de ${MAX_ANEXO_BYTES / 1024 / 1024} MB.`,
        );
      }
      const path = `${tarefaId}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(TAREFAS_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error } = await supabase.from("tarefa_anexos").insert({
        tarefa_id: tarefaId,
        storage_path: path,
        original_name: file.name.slice(0, 255),
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(TAREFAS_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.anexos(tarefaId) });
      void invalidarTarefas(qc);
    },
  });
}

export function useRemoverAnexo(tarefaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (anexo: AnexoRow) => {
      const { error } = await supabase
        .from("tarefa_anexos")
        .delete()
        .eq("id", anexo.id);
      if (error) throw error;
      await supabase.storage.from(TAREFAS_BUCKET).remove([anexo.storage_path]);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.anexos(tarefaId) });
      void invalidarTarefas(qc);
    },
  });
}

export type DocumentoRow = Database["public"]["Tables"]["tarefa_documentos"]["Row"];
export type FaseRow = Database["public"]["Tables"]["tarefa_fases"]["Row"];

export function useDocumentos() {
  return useQuery({
    queryKey: TAREFAS_KEYS.documentos,
    queryFn: async (): Promise<DocumentoRow[]> => {
      const { data, error } = await supabase
        .from("tarefa_documentos")
        .select("*")
        .order("posicao");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function salvarDocumento(input: {
  tarefaId: string;
  id?: string;
  chave?: string | null;
  titulo: string;
  numero?: string | null;
  data?: string | null;
  horario?: string | null;
  observacao?: string | null;
  link_url?: string | null;
  posicao?: number;
}) {
  const linha = {
    titulo: input.titulo.trim(),
    numero: input.numero?.trim() || null,
    data: input.data || null,
    horario: input.horario || null,
    observacao: input.observacao?.trim() || null,
    link_url: input.link_url?.trim() || null,
    chave: input.chave ?? null,
    posicao: input.posicao ?? 0,
  };
  if (input.id) {
    const { error } = await supabase.from("tarefa_documentos").update(linha).eq("id", input.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("tarefa_documentos")
    .insert({ ...linha, tarefa_id: input.tarefaId });
  if (error) throw error;
}

/** Grava número e data pedidos no avanço. Não apaga um documento já preenchido com valor vazio. */
export async function registrarDocumentoTramitacao(
  tarefaId: string,
  regra: RegraTramitacao,
  valor: { numero: string; data: string; horario: string },
  docs: { id: string; tarefa_id: string; chave: string | null }[],
) {
  const chave = regra === "publicacao" ? "certame" : regra === "pesquisa" || regra === "etp" ? regra : null;
  if (!chave) return;
  if (!valor.numero.trim() && !valor.data && !valor.horario) return;
  const def = DOCUMENTOS_FIXOS.find((d) => d.chave === chave);
  const atual = docs.find((d) => d.tarefa_id === tarefaId && d.chave === chave);
  await salvarDocumento({
    id: atual?.id,
    tarefaId,
    chave,
    titulo: def?.titulo ?? chave,
    numero: valor.numero,
    data: valor.data,
    horario: chave === "certame" ? valor.horario : null,
    posicao: DOCUMENTOS_FIXOS.findIndex((d) => d.chave === chave),
  });
}

export function useSalvarDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: salvarDocumento,
    onSuccess: () => void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.documentos }),
  });
}

export function useExcluirDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefa_documentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.documentos }),
  });
}

export function useFases(tarefaId: string | undefined) {
  return useQuery({
    queryKey: TAREFAS_KEYS.fases(tarefaId ?? ""),
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<FaseRow[]> => {
      const { data, error } = await supabase
        .from("tarefa_fases")
        .select("*")
        .eq("tarefa_id", tarefaId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarFase(tarefaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chave: string;
      situacao: string;
      data?: string | null;
      observacao?: string | null;
      posicao: number;
    }) => {
      const { error } = await supabase.from("tarefa_fases").upsert(
        {
          tarefa_id: tarefaId,
          chave: input.chave,
          situacao: input.situacao,
          data: input.data || null,
          observacao: input.observacao?.trim() || null,
          posicao: input.posicao,
        },
        { onConflict: "tarefa_id,chave" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.fases(tarefaId) });
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.fasesQuadro });
    },
  });
}

/** Fase atual do julgamento: uma linha em andamento. As demais linhas permanecem. */
export function useDefinirFase(tarefaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chave: string) => {
      const posicao = Math.max(0, FASES_JULGAMENTO.findIndex((f) => f.chave === chave));
      const { data: atuais, error: ler } = await supabase
        .from("tarefa_fases")
        .select("chave")
        .eq("tarefa_id", tarefaId)
        .eq("situacao", "em_andamento")
        .neq("chave", chave);
      if (ler) throw ler;
      for (const row of atuais ?? []) {
        const { error } = await supabase
          .from("tarefa_fases")
          .update({ situacao: "pendente" })
          .eq("tarefa_id", tarefaId)
          .eq("chave", row.chave);
        if (error) throw error;
      }
      const { error } = await supabase.from("tarefa_fases").upsert(
        { tarefa_id: tarefaId, chave, situacao: "em_andamento", posicao },
        { onConflict: "tarefa_id,chave" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.fases(tarefaId) });
      void qc.invalidateQueries({ queryKey: TAREFAS_KEYS.fasesQuadro });
    },
  });
}

export function useFasesQuadro() {
  return useQuery({
    queryKey: TAREFAS_KEYS.fasesQuadro,
    queryFn: async (): Promise<{ tarefa_id: string; chave: string }[]> => {
      const { data, error } = await supabase
        .from("tarefa_fases")
        .select("tarefa_id, chave")
        .eq("situacao", "em_andamento");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Liga os contratos já gravados no processo, sem copiar o contrato. Idempotente. */
export async function vincularContratosDoProcesso(tarefaId: string, processoId: string | null) {
  if (!processoId) return;
  const { data, error } = await supabase.from("contratos").select("id").eq("processo_id", processoId);
  if (error) throw error;
  await vincularContratos(tarefaId, (data ?? []).map((c) => c.id));
}

export type ContratoVinculo = {
  id: string;
  numero_contrato: string;
  objeto: string;
};

export function useContratosTarefa(tarefaId: string | undefined) {
  return useQuery({
    queryKey: TAREFAS_KEYS.contratos(tarefaId ?? ""),
    enabled: Boolean(tarefaId),
    queryFn: async (): Promise<ContratoVinculo[]> => {
      const { data, error } = await supabase
        .from("tarefa_contratos")
        .select("contrato_id")
        .eq("tarefa_id", tarefaId!);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.contrato_id);
      if (!ids.length) return [];
      const { data: contratos, error: cErr } = await supabase
        .from("contratos")
        .select("id, numero_contrato, objeto")
        .in("id", ids);
      if (cErr) throw cErr;
      return (contratos ?? []).map((c) => ({
        id: c.id,
        numero_contrato: c.numero_contrato,
        objeto: c.objeto,
      }));
    },
  });
}

export async function vincularContratos(tarefaId: string, contratoIds: string[]) {
  if (!contratoIds.length) return;
  const { error } = await supabase.from("tarefa_contratos").upsert(
    contratoIds.map((contrato_id) => ({ tarefa_id: tarefaId, contrato_id })),
    { onConflict: "tarefa_id,contrato_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function abrirAnexo(anexo: AnexoRow) {
  const { data, error } = await supabase.storage
    .from(TAREFAS_BUCKET)
    .createSignedUrl(anexo.storage_path, 60);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Não foi possível gerar o link do arquivo.");
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
