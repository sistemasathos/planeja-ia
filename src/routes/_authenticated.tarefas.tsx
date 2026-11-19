import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, RefreshCw } from "lucide-react";
import "@/features/tarefas/tarefas.css";
import { routeHead } from "@/lib/utils/route-head";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { useSecretariasOpcoes } from "@/features/perfil/hooks";
import {
  useCampos,
  useCriarTarefa,
  useDocumentos,
  useEquipe,
  useEtapas,
  useFasesQuadro,
  useMoverTarefa,
  type MoverTarefaInput,
  useProcessosPorIds,
  registrarDocumentoTramitacao,
  TAREFAS_KEYS,
  useTarefas,
  vincularContratosDoProcesso,
} from "@/features/tarefas/hooks";
import {
  FASES_JULGAMENTO,
  FILTROS_VAZIOS,
  MODALIDADES_SUGERIDAS,
  PASSO_POSICAO,
  SITUACOES,
  TIPOS_SUGERIDOS,
  filtrarTarefas,
  identificadoresDaEtapa,
  identificadoresPendentes,
  mesclarIdentificadores,
  regraTramitacao,
  tramitacaoPendente,
  type Campo,
  type CriterioFiltro,
  type RegraTramitacao,
  type Etapa,
  type FiltrosTarefas,
  type MembroEquipe,
  type ProcessoResumo,
  type Tarefa,
} from "@/features/tarefas/lib";
import { AvancoEtapaDialog } from "@/features/tarefas/components/AvancoEtapaDialog";
import {
  TramitacaoDialog,
  type ConfirmacaoTramitacao,
} from "@/features/tarefas/components/TramitacaoDialog";
import { COLUNA_LARGURA } from "@/features/tarefas/components/EtapaColumn";
import { FiltrosBar } from "@/features/tarefas/components/FiltrosBar";
import { RelatorioMenu } from "@/features/tarefas/components/RelatorioMenu";
import { TarefaSheet } from "@/features/tarefas/components/TarefaSheet";
import { QUADRO_ALTURA, TarefasBoard } from "@/features/tarefas/components/TarefasBoard";
import type { CardContexto } from "@/features/tarefas/components/TarefaCard";
import {
  TkButton,
  TkEmpty,
  TkField,
  TkPanelHeader,
  tkDialog,
  tkDialogDescription,
  tkDialogTitle,
  tkInput,
  tkMenu,
  tkMenuItem,
  tkSelect,
} from "@/features/tarefas/components/ui";

type TarefasSearch = {
  q?: string;
  modalidade?: string[];
  tipo?: string[];
  secretaria?: string[];
  responsavel?: string[];
  situacao?: string[];
  tarefa?: string;
  vista?: "lista";
};

function listaBusca(valor: unknown): string[] {
  const itens = Array.isArray(valor) ? valor : typeof valor === "string" ? [valor] : [];
  return [...new Set(itens.map((v) => String(v).trim()).filter(Boolean).map((v) => v.slice(0, 120)))].slice(0, 30);
}

// Referências estáveis enquanto as consultas carregam (evita recomputar memos).
const VAZIO_ETAPAS: Etapa[] = [];
const VAZIO_CAMPOS: Campo[] = [];
const VAZIO_TAREFAS: Tarefa[] = [];
const VAZIO_EQUIPE: MembroEquipe[] = [];
const VAZIO_SECRETARIAS: { id: string; ids: string[]; label: string; sigla: string }[] = [];
const VAZIO_DOCUMENTOS: never[] = [];

const CHAVES_LISTA = ["modalidade", "tipo", "secretaria", "responsavel", "situacao"] as const;

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): TarefasSearch => {
    const out: TarefasSearch = {};
    if (typeof search.q === "string" && search.q.trim()) out.q = search.q.trim().slice(0, 120);
    for (const k of CHAVES_LISTA) {
      const lista = listaBusca(search[k]);
      if (lista.length) out[k] = lista;
    }
    if (typeof search.tarefa === "string" && search.tarefa) out.tarefa = search.tarefa;
    if (search.vista === "lista") out.vista = "lista";
    return out;
  },
  head: () =>
    routeHead({
      path: "/tarefas",
      title: "Tarefas",
      description:
        "Quadro Kanban da equipe para acompanhar pautas, pesquisas, ETPs, publicações, julgamentos e contratos.",
      noindex: true,
    }),
});

function docDaRegra(
  docs: { tarefa_id: string; chave: string | null; numero: string | null; data: string | null; horario: string | null }[],
  tarefaId: string,
  regra: RegraTramitacao,
) {
  const chave = regra === "publicacao" ? "certame" : regra === "pesquisa" || regra === "etp" ? regra : null;
  if (!chave) return null;
  return docs.find((d) => d.tarefa_id === tarefaId && d.chave === chave) ?? null;
}

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = roles.some((r) => r === "admin" || r === "gestor" || r === "operador");

  const etapasQ = useEtapas();
  const camposQ = useCampos();
  const tarefasQ = useTarefas();
  const equipeQ = useEquipe();
  const secretariasQ = useSecretariasOpcoes();
  const documentosQ = useDocumentos();

  const etapas = etapasQ.data ?? VAZIO_ETAPAS;
  const campos = camposQ.data ?? VAZIO_CAMPOS;
  const tarefas = tarefasQ.data ?? VAZIO_TAREFAS;
  const equipe = equipeQ.data ?? VAZIO_EQUIPE;
  const secretarias = secretariasQ.data ?? VAZIO_SECRETARIAS;
  const documentos = documentosQ.data ?? VAZIO_DOCUMENTOS;

  const criarTarefa = useCriarTarefa();
  const moverTarefa = useMoverTarefa();

  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false);
  const [perguntaProcesso, setPerguntaProcesso] = useState<string | null>(null);
  const [tram, setTram] = useState<{
    regra: RegraTramitacao;
    etapaNome: string;
    numero: string;
    data: string;
    horario: string;
  } | null>(null);
  const [avanco, setAvanco] = useState<{
    etapa: Etapa;
    campos: Campo[];
    valores: Record<string, string>;
    resolve: (valores: Record<string, string> | null) => void;
  } | null>(null);

  const etapasAtivas = useMemo(() => etapas.filter((e) => !e.arquivada), [etapas]);

  const filtros: FiltrosTarefas = useMemo(
    () => ({
      q: search.q ?? "",
      modalidade: search.modalidade ?? [],
      tipo: search.tipo ?? [],
      secretaria: search.secretaria ?? [],
      responsavel: search.responsavel ?? [],
      situacao: search.situacao ?? [],
    }),
    [search],
  );

  const setFiltros = useCallback(
    (f: FiltrosTarefas) => {
      void navigate({
        search: (prev) => {
          const next: TarefasSearch = { tarefa: prev.tarefa, vista: prev.vista };
          if (f.q.trim()) next.q = f.q.trim();
          for (const k of CHAVES_LISTA) if (f[k].length) next[k] = f[k];
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const setLista = useCallback(
    (lista: boolean) => {
      void navigate({
        search: (prev) => ({ ...prev, vista: lista ? "lista" : undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  const abrirTarefa = useCallback(
    (id: string | undefined) => {
      void navigate({
        search: (prev) => ({ ...prev, tarefa: id }),
        replace: true,
      });
    },
    [navigate],
  );

  /* -------------------------------- Derivados -------------------------------- */

  const siglas = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of secretarias) {
      for (const id of s.ids.length ? s.ids : [s.id]) m.set(id, s.label);
    }
    return m;
  }, [secretarias]);
  const secretariasNomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of secretarias) {
      for (const id of s.ids.length ? s.ids : [s.id]) m.set(id, s.label);
    }
    return m;
  }, [secretarias]);
  const gruposSecretaria = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of secretarias) m.set(s.id, s.ids.length ? s.ids : [s.id]);
    return m;
  }, [secretarias]);
  const equipeMap = useMemo(() => new Map(equipe.map((m) => [m.id, m.nome])), [equipe]);

  const processoIds = useMemo(
    () => [...new Set(tarefas.map((t) => t.processo_id).filter((x): x is string => Boolean(x)))],
    [tarefas],
  );
  const processosQ = useProcessosPorIds(processoIds);
  const processosMap = useMemo(
    () =>
      new Map<string, ProcessoResumo>(
        (processosQ.data ?? []).map((p) => [
          p.id,
          { numero: p.numero_processo ?? "", objeto: p.objeto ?? "" },
        ]),
      ),
    [processosQ.data],
  );
  const processoTexto = useMemo(
    () => new Map([...processosMap].map(([id, p]) => [id, `${p.numero} ${p.objeto}`])),
    [processosMap],
  );

  const camposPorEtapa = useMemo(() => {
    const m = new Map<string, Campo[]>();
    for (const e of [...etapas].sort((a, b) => a.posicao - b.posicao)) m.set(e.id, []);
    for (const c of campos) {
      if (c.arquivado) continue;
      const l = m.get(c.etapa_id);
      if (l) l.push(c);
      else m.set(c.etapa_id, [c]);
    }
    for (const l of m.values()) l.sort((a, b) => a.posicao - b.posicao);
    return m;
  }, [campos, etapas]);

  const documentosPorTarefa = useMemo(() => {
    const m = new Map<string, { id: string; chave: string | null; titulo: string; numero: string | null }[]>();
    for (const d of documentos) {
      const lista = m.get(d.tarefa_id) ?? [];
      lista.push({ id: d.id, chave: d.chave, titulo: d.titulo, numero: d.numero });
      m.set(d.tarefa_id, lista);
    }
    return m;
  }, [documentos]);

  const fasesQuadro = useFasesQuadro();
  const faseJulgamento = useMemo(() => {
    const julg = new Set(
      etapas.filter((e) => regraTramitacao(e.nome) === "julgamento").map((e) => e.id),
    );
    const nomes = new Map(FASES_JULGAMENTO.map((f) => [f.chave, f.nome]));
    const mapa = new Map<string, string>();
    for (const t of tarefas) {
      if (!julg.has(t.etapa_id)) continue;
      const chave = fasesQuadro.data?.find((f) => f.tarefa_id === t.id)?.chave;
      const nome = chave ? nomes.get(chave) : undefined;
      if (nome) mapa.set(t.id, nome);
    }
    return mapa;
  }, [etapas, fasesQuadro.data, tarefas]);

  const ctx: CardContexto = useMemo(
    () => ({
      siglas,
      secretariasNomes,
      equipe: equipeMap,
      processos: processosMap,
      camposPorEtapa,
      documentosPorTarefa,
      faseJulgamento,
    }),
    [siglas, secretariasNomes, equipeMap, processosMap, camposPorEtapa, documentosPorTarefa, faseJulgamento],
  );

  const filtradas = useMemo(
    () => filtrarTarefas(tarefas, filtros, processoTexto, gruposSecretaria),
    [tarefas, filtros, processoTexto, gruposSecretaria],
  );

  const totais = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tarefas) m.set(t.etapa_id, (m.get(t.etapa_id) ?? 0) + 1);
    return m;
  }, [tarefas]);

  const modalidades = useMemo(
    () =>
      [...new Set([...MODALIDADES_SUGERIDAS, ...tarefas.map((t) => t.modalidade ?? "")])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tarefas],
  );
  const tipos = useMemo(
    () =>
      [...new Set([...TIPOS_SUGERIDOS, ...tarefas.map((t) => t.tipo ?? "")])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tarefas],
  );

  const criterios = useMemo<CriterioFiltro[]>(() => {
    const out: CriterioFiltro[] = [];
    if (filtros.q) out.push({ chave: "q", rotulo: "Busca", valor: filtros.q });
    for (const valor of filtros.modalidade)
      out.push({ chave: "modalidade", rotulo: "Modalidade", valor, item: valor });
    for (const valor of filtros.tipo) out.push({ chave: "tipo", rotulo: "Tipo", valor, item: valor });
    for (const id of filtros.secretaria)
      out.push({
        chave: "secretaria",
        rotulo: "Secretaria",
        valor: siglas.get(id) ?? "Secretaria selecionada",
        item: id,
      });
    for (const id of filtros.responsavel)
      out.push({
        chave: "responsavel",
        rotulo: "Responsável",
        valor: id === "__nenhum__" ? "Sem responsável" : (equipeMap.get(id) ?? "Pessoa selecionada"),
        item: id,
      });
    for (const valor of filtros.situacao)
      out.push({
        chave: "situacao",
        rotulo: "Situação",
        valor: SITUACOES.find((s) => s.value === valor)?.label ?? valor,
        item: valor,
      });
    return out;
  }, [filtros, siglas, equipeMap]);

  const tarefaAberta = search.tarefa ? tarefas.find((t) => t.id === search.tarefa) ?? null : null;

  /* --------------------------------- Ações ----------------------------------- */

  const posicaoFinal = useCallback(
    (etapaId: string) => {
      const posicoes = tarefas.filter((t) => t.etapa_id === etapaId).map((t) => t.posicao);
      return posicoes.length ? Math.max(...posicoes) + PASSO_POSICAO : PASSO_POSICAO;
    },
    [tarefas],
  );

  const avancoResolve = useRef<((valores: Record<string, string> | null) => void) | null>(null);
  const pedirAvanco = useCallback(
    (etapa: Etapa, defs: Campo[], atuais: Record<string, string>) => {
      if (avancoResolve.current) return Promise.resolve(null);
      return new Promise<Record<string, string> | null>((resolve) => {
        avancoResolve.current = resolve;
        setAvanco({ etapa, campos: defs, valores: atuais, resolve });
      });
    },
    [],
  );
  function encerrarAvanco(valores: Record<string, string> | null) {
    const resolve = avancoResolve.current;
    avancoResolve.current = null;
    setAvanco(null);
    resolve?.(valores);
  }

  const tramResolve = useRef<((valor: ConfirmacaoTramitacao | null) => void) | null>(null);
  const pedirTramitacao = useCallback(
    (pedido: {
      regra: RegraTramitacao;
      etapaNome: string;
      numero: string;
      data: string;
      horario: string;
    }) => {
      if (tramResolve.current) return Promise.resolve(null);
      return new Promise<ConfirmacaoTramitacao | null>((resolve) => {
        tramResolve.current = resolve;
        setTram(pedido);
      });
    },
    [],
  );
  function encerrarTram(valor: ConfirmacaoTramitacao | null) {
    const resolve = tramResolve.current;
    tramResolve.current = null;
    setTram(null);
    resolve?.(valor);
  }

  const criarRegistro = useCallback(
    async (etapaId: string, titulo: string, dataInclusao?: string): Promise<Tarefa | null> => {
      const etapa = etapas.find((e) => e.id === etapaId);
      const regra = etapa ? regraTramitacao(etapa.nome) : null;
      let confirmacao: ConfirmacaoTramitacao | null = null;
      if (etapa && regra && tramitacaoPendente(regra, [])) {
        confirmacao = await pedirTramitacao({
          regra,
          etapaNome: etapa.nome,
          numero: "",
          data: "",
          horario: "",
        });
        if (!confirmacao) return null;
      }
      let camposNovos: Record<string, string> | undefined;
      if (!regra && etapa && identificadoresPendentes(campos, etapaId, {}).length > 0) {
        const valores = await pedirAvanco(etapa, identificadoresDaEtapa(campos, etapaId), {});
        if (!valores) return null;
        camposNovos = valores;
      }
      try {
        const nova = await criarTarefa.mutateAsync({
          titulo,
          etapa_id: etapaId,
          posicao: posicaoFinal(etapaId),
          data_inclusao: dataInclusao,
          campos: camposNovos,
        });
        if (confirmacao && regra) {
          await registrarDocumentoTramitacao(nova.id, regra, confirmacao, []);
          await qc.invalidateQueries({ queryKey: TAREFAS_KEYS.documentos });
          if (confirmacao.importar) {
            void navigate({ to: "/importar-contratos", search: { tarefa: nova.id } });
          }
        }
        return nova;
      } catch (e) {
        notify.error("Não foi possível criar a tarefa", {
          description: e instanceof Error ? e.message : undefined,
        });
        throw e;
      }
    },
    [campos, criarTarefa, etapas, navigate, pedirAvanco, pedirTramitacao, posicaoFinal, qc],
  );

  const vincularSeContratacao = useCallback(
    (tarefaId: string, processoId: string | null, nomeEtapa: string) => {
      if (regraTramitacao(nomeEtapa) !== "contratacao" || !processoId) return;
      void vincularContratosDoProcesso(tarefaId, processoId)
        .then(() => qc.invalidateQueries({ queryKey: TAREFAS_KEYS.contratos(tarefaId) }))
        .catch((e) =>
          notify.error("A etapa foi atualizada, mas os contratos do processo não foram vinculados", {
            description: e instanceof Error ? e.message : undefined,
          }),
        );
    },
    [qc],
  );

  const mover = useCallback(
    (input: MoverTarefaInput) => {
      const falha = (e: unknown) =>
        notify.error("Não foi possível mover a tarefa", {
          description: e instanceof Error ? e.message : undefined,
        });
      const tarefa = tarefas.find((t) => t.id === input.id);
      const etapa = etapas.find((e) => e.id === input.etapa_id);
      if (tarefa && etapa && input.etapa_id !== tarefa.etapa_id) {
        const regra = regraTramitacao(etapa.nome);
        const docsTarefa = documentos.filter((d) => d.tarefa_id === tarefa.id);
        if (regra && tramitacaoPendente(regra, docsTarefa)) {
          const atual = docDaRegra(docsTarefa, tarefa.id, regra);
          void pedirTramitacao({
            regra,
            etapaNome: etapa.nome,
            numero: atual?.numero ?? "",
            data: atual?.data ?? "",
            horario: atual?.horario ?? "",
          }).then(async (valor) => {
            if (!valor) return;
            try {
              await registrarDocumentoTramitacao(tarefa.id, regra, valor, documentos);
              await qc.invalidateQueries({ queryKey: TAREFAS_KEYS.documentos });
            } catch (e) {
              notify.error("Não foi possível registrar o documento", {
                description: e instanceof Error ? e.message : undefined,
              });
              return;
            }
            moverTarefa.mutate(input, {
              onError: falha,
              onSuccess: () => {
                vincularSeContratacao(tarefa.id, tarefa.processo_id, etapa.nome);
                if (valor.importar) {
                  void navigate({ to: "/importar-contratos", search: { tarefa: tarefa.id } });
                }
              },
            });
          });
          return;
        }
        if (
          !regra &&
          identificadoresPendentes(campos, input.etapa_id, tarefa.campos).length > 0
        ) {
          void pedirAvanco(
            etapa,
            identificadoresDaEtapa(campos, input.etapa_id),
            tarefa.campos,
          ).then((valores) => {
            if (!valores) return;
            moverTarefa.mutate({ ...input, campos: valores }, { onError: falha });
          });
          return;
        }
      }
      moverTarefa.mutate(input, {
        onError: falha,
        onSuccess: () => {
          if (tarefa && etapa && input.etapa_id !== tarefa.etapa_id) {
            vincularSeContratacao(tarefa.id, tarefa.processo_id, etapa.nome);
          }
        },
      });
    },
    [campos, documentos, etapas, moverTarefa, navigate, pedirAvanco, pedirTramitacao, qc, tarefas, vincularSeContratacao],
  );

  /* ---------------------------------- Render --------------------------------- */

  const carregando = etapasQ.isLoading || tarefasQ.isLoading;
  const erro = etapasQ.error || tarefasQ.error;

  return (
    <AppShell fill>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <header className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl space-y-1.5">
              <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-(--tk-text)">
                Tarefas
              </h1>
              <p className="text-[14px] leading-relaxed text-(--tk-text-2)">
                Quadro de acompanhamento das atividades da equipe, com organização por etapas e
                monitoramento do andamento dos processos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <RelatorioMenu
                desabilitado={carregando || Boolean(erro)}
                contexto={{
                  etapas,
                  tarefas: filtradas,
                  campos,
                  siglas,
                  equipe: equipeMap,
                  processos: processosMap,
                  criterios,
                }}
              />
              {podeEditar && (
                <TkButton
                  variant="primary"
                  className="px-5"
                  onClick={() => setNovaTarefaAberta(true)}
                  disabled={etapasAtivas.length === 0}
                >
                  <Plus /> Nova tarefa
                </TkButton>
              )}
            </div>
          </header>

          <div className="shrink-0">
          <FiltrosBar
            filtros={filtros}
            onChange={setFiltros}
            criterios={criterios}
            resultado={{ exibidas: filtradas.length, total: tarefas.length }}
            modalidades={modalidades}
            tipos={tipos}
            secretarias={secretarias}
            equipe={equipe}
            lista={search.vista === "lista"}
            onLista={setLista}
          />
          </div>

          {carregando ? (
            <div
              className={cn(QUADRO_ALTURA, "flex min-h-0 flex-1 gap-3 overflow-hidden")}
              role="status"
              aria-label="Carregando tarefas"
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    COLUNA_LARGURA,
                    "flex shrink-0 flex-col gap-2.5 rounded-(--tk-radius-column) border border-(--tk-border) bg-(--tk-column) p-2.5",
                  )}
                >
                  <Skeleton className="mx-1.5 my-3 h-5 w-2/3 bg-(--tk-neutral-bg)" />
                  {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                    <Skeleton key={j} className="h-32 rounded-(--tk-radius-card) bg-(--tk-card)" />
                  ))}
                </div>
              ))}
            </div>
          ) : erro ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
            <TkEmpty
              icon={Layers}
              title="Não foi possível carregar as tarefas"
              description={erro instanceof Error ? erro.message : "Tente novamente em instantes."}
              action={
                <TkButton
                  variant="secondary"
                  onClick={() => {
                    void etapasQ.refetch();
                    void tarefasQ.refetch();
                  }}
                >
                  <RefreshCw /> Tentar novamente
                </TkButton>
              }
            />
            </div>
          ) : etapasAtivas.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
            <TkEmpty
              icon={Layers}
              title="Nenhuma etapa configurada"
              description="As etapas do quadro são criadas em Configurações."
            />
            </div>
          ) : (
            <TarefasBoard
              etapas={etapasAtivas}
              tarefas={filtradas}
              totais={totais}
              ctx={ctx}
              podeEditar={podeEditar}
              selecionadaId={search.tarefa}
              lista={search.vista === "lista"}
              onMover={mover}
              onAbrir={abrirTarefa}
            />
          )}
        </div>

        <TarefaSheet
          tarefa={tarefaAberta}
          etapas={etapas}
          campos={campos}
          equipe={equipe}
          secretarias={secretarias}
          modalidades={modalidades}
          tipos={tipos}
          podeEditar={podeEditar}
          onFechar={() => abrirTarefa(undefined)}
        />

        <NovaTarefaDialog
          aberto={novaTarefaAberta}
          etapas={etapasAtivas}
          onFechar={() => setNovaTarefaAberta(false)}
          onCriar={async (titulo, dataInclusao, etapaId) => {
            if (!etapaId) {
              notify.error("Cadastre uma etapa antes de criar a demanda");
              return;
            }
            try {
              const nova = await criarRegistro(etapaId, titulo, dataInclusao);
              if (!nova) return;
              setNovaTarefaAberta(false);
              setPerguntaProcesso(nova.id);
            } catch {
              // O aviso já foi exibido.
            }
          }}
          salvando={criarTarefa.isPending || Boolean(avanco) || Boolean(tram)}
        />
        <Dialog
          open={Boolean(perguntaProcesso)}
          onOpenChange={(o) => {
            if (o || !perguntaProcesso) return;
            const id = perguntaProcesso;
            setPerguntaProcesso(null);
            abrirTarefa(id);
          }}
        >
          <DialogContent hideClose className={cn(tkDialog, "sm:max-w-md")}>
            <TkPanelHeader
              onClose={() => {
                const id = perguntaProcesso;
                setPerguntaProcesso(null);
                if (id) abrirTarefa(id);
              }}
              title={
                <DialogTitle className={tkDialogTitle}>Processo administrativo</DialogTitle>
              }
              description={
                <DialogDescription className={tkDialogDescription}>
                  Deseja criar ou vincular um processo administrativo a esta demanda?
                </DialogDescription>
              }
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <TkButton
                variant="secondary"
                onClick={() => {
                  const id = perguntaProcesso;
                  setPerguntaProcesso(null);
                  if (id) abrirTarefa(id);
                }}
              >
                Fazer isso depois
              </TkButton>
              <TkButton
                variant="primary"
                onClick={() => {
                  const id = perguntaProcesso;
                  setPerguntaProcesso(null);
                  if (id) void navigate({ to: "/processos", search: { tarefa: id } });
                }}
              >
                Criar/vincular processo
              </TkButton>
            </div>
          </DialogContent>
        </Dialog>
        <TramitacaoDialog
          aberto={Boolean(tram)}
          regra={tram?.regra ?? null}
          etapaNome={tram?.etapaNome ?? ""}
          numero={tram?.numero ?? ""}
          data={tram?.data ?? ""}
          horario={tram?.horario ?? ""}
          confirmando={criarTarefa.isPending || moverTarefa.isPending}
          onCancelar={() => encerrarTram(null)}
          onConfirmar={(valor) => encerrarTram(valor)}
        />
        <AvancoEtapaDialog
          aberto={Boolean(avanco)}
          etapaNome={avanco?.etapa.nome ?? ""}
          campos={avanco?.campos ?? []}
          valores={avanco?.valores ?? {}}
          confirmando={criarTarefa.isPending || moverTarefa.isPending}
          onCancelar={() => encerrarAvanco(null)}
          onConfirmar={(form) => {
            if (!avanco) return;
            encerrarAvanco(mesclarIdentificadores(avanco.valores, form));
          }}
        />
    </AppShell>
  );
}

function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function etapaPadrao(etapas: Etapa[]): string {
  return (etapas.find((e) => /pauta/i.test(e.nome)) ?? etapas[0])?.id ?? "";
}

function NovaTarefaDialog({
  aberto,
  salvando,
  etapas,
  onFechar,
  onCriar,
}: {
  aberto: boolean;
  salvando: boolean;
  etapas: Etapa[];
  onFechar: () => void;
  onCriar: (titulo: string, dataInclusao: string, etapaId: string) => void | Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [dataInclusao, setDataInclusao] = useState(hojeLocal);
  const [etapaId, setEtapaId] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setEtapaId(etapaPadrao(etapas));
  }, [aberto, etapas]);

  function fechar() {
    setTitulo("");
    setDataInclusao(hojeLocal());
    setEtapaId(etapaPadrao(etapas));
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && fechar()}>
      <DialogContent hideClose className={cn(tkDialog, "sm:max-w-md")}>
        <TkPanelHeader
          onClose={fechar}
          title={<DialogTitle className={tkDialogTitle}>Nova tarefa</DialogTitle>}
          description={
            <DialogDescription className={tkDialogDescription}>
              A demanda entra na etapa escolhida. Processo e documentos podem ser vinculados depois.
            </DialogDescription>
          }
        />
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!titulo.trim() || !dataInclusao || !etapaId || salvando) return;
            void onCriar(titulo.trim(), dataInclusao, etapaId);
          }}
        >
          <TkField label="Título" htmlFor="nt-titulo">
            <input
              id="nt-titulo"
              autoFocus
              maxLength={300}
              value={titulo}
              placeholder="Descreva a demanda"
              onChange={(e) => setTitulo(e.target.value)}
              className={tkInput}
            />
          </TkField>
          <TkField label="Data de inclusão" htmlFor="nt-data">
            <input
              id="nt-data"
              type="date"
              required
              value={dataInclusao}
              onChange={(e) => setDataInclusao(e.target.value)}
              className={cn(tkInput, "[color-scheme:light] dark:[color-scheme:dark]")}
            />
          </TkField>
          <TkField label="Etapa" htmlFor="nt-etapa">
            <Select value={etapaId} onValueChange={setEtapaId} disabled={salvando || etapas.length === 0}>
              <SelectTrigger id="nt-etapa" className={tkSelect}>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent className={cn(tkMenu, "max-h-80")}>
                {etapas.map((e) => (
                  <SelectItem key={e.id} value={e.id} className={tkMenuItem}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TkField>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <TkButton variant="secondary" onClick={fechar} disabled={salvando}>
              Cancelar
            </TkButton>
            <TkButton
              type="submit"
              variant="primary"
              disabled={!titulo.trim() || !dataInclusao || !etapaId || salvando}
            >
              Salvar tarefa
            </TkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
