import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Archive, ChevronDown, Layers, Plus, RefreshCw, RotateCcw } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { useSecretariasOpcoes } from "@/features/perfil/hooks";
import {
  useAtualizarEtapa,
  useCampos,
  useCriarTarefa,
  useEquipe,
  useEtapas,
  useExcluirEtapa,
  useMoverTarefa,
  useProcessosPorIds,
  useSalvarEtapa,
  useTarefas,
} from "@/features/tarefas/hooks";
import {
  FILTROS_VAZIOS,
  MODALIDADES_SUGERIDAS,
  PASSO_POSICAO,
  SITUACOES,
  TIPOS_SUGERIDOS,
  filtrarTarefas,
  posicaoEntre,
  type Campo,
  type CriterioFiltro,
  type Etapa,
  type FiltrosTarefas,
  type MembroEquipe,
  type ProcessoResumo,
  type Tarefa,
} from "@/features/tarefas/lib";
import { CamposDialog } from "@/features/tarefas/components/CamposDialog";
import { COLUNA_LARGURA } from "@/features/tarefas/components/EtapaColumn";
import { EtapaDialog } from "@/features/tarefas/components/EtapaDialog";
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
  tkMenuLabel,
  tkMenuSeparator,
  tkSelect,
  useConfirmDialog,
} from "@/features/tarefas/components/ui";

type TarefasSearch = Partial<FiltrosTarefas> & { tarefa?: string };

// Referências estáveis enquanto as consultas carregam (evita recomputar memos).
const VAZIO_ETAPAS: Etapa[] = [];
const VAZIO_CAMPOS: Campo[] = [];
const VAZIO_TAREFAS: Tarefa[] = [];
const VAZIO_EQUIPE: MembroEquipe[] = [];
const VAZIO_SECRETARIAS: { id: string; label: string; sigla: string }[] = [];

const CHAVES_FILTRO = [
  "q",
  "modalidade",
  "tipo",
  "secretaria",
  "responsavel",
  "situacao",
] as const;

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): TarefasSearch => {
    const out: TarefasSearch = {};
    for (const k of CHAVES_FILTRO) {
      const v = search[k];
      if (typeof v === "string" && v.trim()) out[k] = v.slice(0, 120);
    }
    if (typeof search.tarefa === "string" && search.tarefa) out.tarefa = search.tarefa;
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

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { roles } = useAuth();
  const podeEditar = roles.some((r) => r === "admin" || r === "gestor" || r === "operador");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const etapasQ = useEtapas();
  const camposQ = useCampos();
  const tarefasQ = useTarefas();
  const equipeQ = useEquipe();
  const secretariasQ = useSecretariasOpcoes();

  const etapas = etapasQ.data ?? VAZIO_ETAPAS;
  const campos = camposQ.data ?? VAZIO_CAMPOS;
  const tarefas = tarefasQ.data ?? VAZIO_TAREFAS;
  const equipe = equipeQ.data ?? VAZIO_EQUIPE;
  const secretarias = secretariasQ.data ?? VAZIO_SECRETARIAS;

  const criarTarefa = useCriarTarefa();
  const moverTarefa = useMoverTarefa();
  const salvarEtapa = useSalvarEtapa();
  const atualizarEtapa = useAtualizarEtapa();
  const excluirEtapa = useExcluirEtapa();

  const [etapaDialog, setEtapaDialog] = useState<{ aberto: boolean; etapa: Etapa | null }>({
    aberto: false,
    etapa: null,
  });
  const [camposEtapa, setCamposEtapa] = useState<Etapa | null>(null);
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false);

  const etapasAtivas = useMemo(() => etapas.filter((e) => !e.arquivada), [etapas]);
  const etapasArquivadas = useMemo(() => etapas.filter((e) => e.arquivada), [etapas]);

  const filtros: FiltrosTarefas = useMemo(
    () => ({ ...FILTROS_VAZIOS, ...Object.fromEntries(CHAVES_FILTRO.map((k) => [k, search[k] ?? ""])) }),
    [search],
  );

  const setFiltros = useCallback(
    (f: FiltrosTarefas) => {
      void navigate({
        search: (prev) => {
          const next: TarefasSearch = { tarefa: prev.tarefa };
          for (const k of CHAVES_FILTRO) if (f[k].trim()) next[k] = f[k];
          return next;
        },
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

  const siglas = useMemo(
    () => new Map(secretarias.map((s) => [s.id, s.sigla])),
    [secretarias],
  );
  const secretariasNomes = useMemo(
    () => new Map(secretarias.map((s) => [s.id, s.label])),
    [secretarias],
  );
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
    for (const c of campos) {
      if (c.arquivado) continue;
      const l = m.get(c.etapa_id) ?? [];
      l.push(c);
      m.set(c.etapa_id, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.posicao - b.posicao);
    return m;
  }, [campos]);

  const ctx: CardContexto = useMemo(
    () => ({
      siglas,
      secretariasNomes,
      equipe: equipeMap,
      processos: processosMap,
      camposPorEtapa,
    }),
    [siglas, secretariasNomes, equipeMap, processosMap, camposPorEtapa],
  );

  const filtradas = useMemo(
    () => filtrarTarefas(tarefas, filtros, processoTexto),
    [tarefas, filtros, processoTexto],
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
    if (filtros.modalidade)
      out.push({ chave: "modalidade", rotulo: "Modalidade", valor: filtros.modalidade });
    if (filtros.tipo) out.push({ chave: "tipo", rotulo: "Tipo", valor: filtros.tipo });
    if (filtros.secretaria)
      out.push({
        chave: "secretaria",
        rotulo: "Secretaria",
        valor: siglas.get(filtros.secretaria) ?? "Secretaria selecionada",
      });
    if (filtros.responsavel)
      out.push({
        chave: "responsavel",
        rotulo: "Responsável",
        valor:
          filtros.responsavel === "__nenhum__"
            ? "Sem responsável"
            : (equipeMap.get(filtros.responsavel) ?? "Pessoa selecionada"),
      });
    if (filtros.situacao)
      out.push({
        chave: "situacao",
        rotulo: "Situação",
        valor: SITUACOES.find((s) => s.value === filtros.situacao)?.label ?? filtros.situacao,
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

  const criar = useCallback(
    async (etapaId: string, titulo: string) => {
      try {
        await criarTarefa.mutateAsync({
          titulo,
          etapa_id: etapaId,
          posicao: posicaoFinal(etapaId),
        });
      } catch (e) {
        notify.error("Não foi possível criar a tarefa", {
          description: e instanceof Error ? e.message : undefined,
        });
        throw e;
      }
    },
    [criarTarefa, posicaoFinal],
  );

  const mover = useCallback(
    (input: Parameters<typeof moverTarefa.mutate>[0]) => {
      moverTarefa.mutate(input, {
        onError: (e) =>
          notify.error("Não foi possível mover a tarefa", {
            description: e instanceof Error ? e.message : undefined,
          }),
      });
    },
    [moverTarefa],
  );

  async function salvarEtapaDialog(v: {
    id?: string;
    nome: string;
    cor: string;
    finaliza: boolean;
  }) {
    try {
      await salvarEtapa.mutateAsync({
        ...v,
        posicaoNova: etapasAtivas.length
          ? Math.max(...etapas.map((e) => e.posicao)) + PASSO_POSICAO
          : PASSO_POSICAO,
      });
      setEtapaDialog({ aberto: false, etapa: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      notify.error(
        /duplicate|unique/i.test(msg)
          ? "Já existe uma etapa com esse nome"
          : "Não foi possível salvar a etapa",
        { description: /duplicate|unique/i.test(msg) ? undefined : msg },
      );
    }
  }

  async function moverEtapa(etapa: Etapa, direcao: -1 | 1) {
    const i = etapasAtivas.findIndex((e) => e.id === etapa.id);
    const alvo = i + direcao;
    if (i < 0 || alvo < 0 || alvo >= etapasAtivas.length) return;
    const ordem = etapasAtivas.filter((e) => e.id !== etapa.id);
    // Após remover a etapa, inserir na posição `alvo`.
    const posicao = posicaoEntre(ordem[alvo - 1]?.posicao, ordem[alvo]?.posicao);
    try {
      await atualizarEtapa.mutateAsync({ id: etapa.id, patch: { posicao } });
    } catch (e) {
      notify.error("Não foi possível mover a etapa", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function arquivarEtapa(etapa: Etapa) {
    if ((totais.get(etapa.id) ?? 0) > 0) {
      notify.error("A etapa ainda tem tarefas", {
        description: "Mova as tarefas para outra etapa antes de arquivar.",
      });
      return;
    }
    const ok = await confirm({
      title: "Arquivar etapa?",
      description: `A etapa "${etapa.nome}" sai do quadro e pode ser restaurada depois.`,
      confirmLabel: "Arquivar etapa",
    });
    if (!ok) return;
    try {
      await atualizarEtapa.mutateAsync({ id: etapa.id, patch: { arquivada: true } });
    } catch (e) {
      notify.error("Não foi possível arquivar a etapa", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function restaurarEtapa(etapa: Etapa) {
    try {
      await atualizarEtapa.mutateAsync({
        id: etapa.id,
        patch: {
          arquivada: false,
          posicao: etapas.length ? Math.max(...etapas.map((e) => e.posicao)) + PASSO_POSICAO : PASSO_POSICAO,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      notify.error(
        /duplicate|unique/i.test(msg)
          ? "Já existe uma etapa ativa com esse nome"
          : "Não foi possível restaurar a etapa",
      );
    }
  }

  async function excluirEtapaAcao(etapa: Etapa) {
    if ((totais.get(etapa.id) ?? 0) > 0) {
      notify.error("A etapa ainda tem tarefas", {
        description: "Só é possível excluir etapas vazias. Mova as tarefas ou arquive a etapa.",
      });
      return;
    }
    const ok = await confirm({
      title: "Excluir etapa definitivamente?",
      description: `A etapa "${etapa.nome}" e os campos configurados nela serão excluídos. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir etapa",
      destructive: true,
    });
    if (!ok) return;
    try {
      await excluirEtapa.mutateAsync(etapa.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      notify.error(
        /foreign key|violates/i.test(msg)
          ? "Etapa com histórico de tarefas — arquive em vez de excluir"
          : "Não foi possível excluir a etapa",
      );
    }
  }

  /* ---------------------------------- Render --------------------------------- */

  const carregando = etapasQ.isLoading || tarefasQ.isLoading;
  const erro = etapasQ.error || tarefasQ.error;

  return (
    <AppShell>
      <TooltipProvider delayDuration={350}>
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl space-y-1.5">
              <h1 className="text-[30px] font-[650] leading-tight tracking-tight text-(--tk-text)">
                Tarefas
              </h1>
              <p className="text-[14px] leading-relaxed text-(--tk-text-2)">
                Quadro de acompanhamento das atividades da equipe, com organização por etapas e
                monitoramento do andamento dos processos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              {etapasArquivadas.length > 0 && podeEditar && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TkButton variant="tertiary">
                      <Archive /> Arquivadas ({etapasArquivadas.length})
                      <ChevronDown className="text-(--tk-text-3)" />
                    </TkButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={cn(tkMenu, "w-64")}>
                    <DropdownMenuLabel className={tkMenuLabel}>Etapas arquivadas</DropdownMenuLabel>
                    <DropdownMenuSeparator className={tkMenuSeparator} />
                    {etapasArquivadas.map((e) => (
                      <DropdownMenuItem
                        key={e.id}
                        className={tkMenuItem}
                        onSelect={() => void restaurarEtapa(e)}
                      >
                        <RotateCcw /> <span className="truncate">Restaurar “{e.nome}”</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
                <>
                  <TkButton
                    variant="secondary"
                    onClick={() => setEtapaDialog({ aberto: true, etapa: null })}
                  >
                    <Layers /> Nova etapa
                  </TkButton>
                  <TkButton
                    variant="primary"
                    className="px-5"
                    onClick={() => setNovaTarefaAberta(true)}
                    disabled={etapasAtivas.length === 0}
                  >
                    <Plus /> Nova tarefa
                  </TkButton>
                </>
              )}
            </div>
          </header>

          <FiltrosBar
            filtros={filtros}
            onChange={setFiltros}
            criterios={criterios}
            resultado={{ exibidas: filtradas.length, total: tarefas.length }}
            modalidades={modalidades}
            tipos={tipos}
            secretarias={secretarias}
            equipe={equipe}
          />

          {carregando ? (
            <div
              className={cn(QUADRO_ALTURA, "flex gap-3 overflow-hidden")}
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
          ) : etapasAtivas.length === 0 ? (
            <TkEmpty
              icon={Layers}
              title="Nenhuma etapa configurada"
              description="Crie a primeira etapa para começar a organizar as tarefas da equipe."
              action={
                podeEditar ? (
                  <TkButton
                    variant="primary"
                    onClick={() => setEtapaDialog({ aberto: true, etapa: null })}
                  >
                    <Plus /> Nova etapa
                  </TkButton>
                ) : undefined
              }
            />
          ) : (
            <TarefasBoard
              etapas={etapasAtivas}
              tarefas={filtradas}
              totais={totais}
              ctx={ctx}
              podeEditar={podeEditar}
              selecionadaId={search.tarefa}
              onMover={mover}
              onAbrir={abrirTarefa}
              onCriar={criar}
              onEditarEtapa={(etapa) => setEtapaDialog({ aberto: true, etapa })}
              onCamposEtapa={setCamposEtapa}
              onMoverEtapa={(e, d) => void moverEtapa(e, d)}
              onArquivarEtapa={(e) => void arquivarEtapa(e)}
              onExcluirEtapa={(e) => void excluirEtapaAcao(e)}
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

        <EtapaDialog
          aberto={etapaDialog.aberto}
          etapa={etapaDialog.etapa}
          salvando={salvarEtapa.isPending}
          onFechar={() => setEtapaDialog({ aberto: false, etapa: null })}
          onSalvar={(v) => void salvarEtapaDialog(v)}
        />

        <CamposDialog etapa={camposEtapa} campos={campos} onFechar={() => setCamposEtapa(null)} />

        <NovaTarefaDialog
          aberto={novaTarefaAberta}
          etapas={etapasAtivas}
          onFechar={() => setNovaTarefaAberta(false)}
          onCriar={async (etapaId, titulo) => {
            try {
              const nova = await criarTarefa.mutateAsync({
                titulo,
                etapa_id: etapaId,
                posicao: posicaoFinal(etapaId),
              });
              setNovaTarefaAberta(false);
              abrirTarefa(nova.id);
            } catch (e) {
              notify.error("Não foi possível criar a tarefa", {
                description: e instanceof Error ? e.message : undefined,
              });
            }
          }}
          salvando={criarTarefa.isPending}
        />
        {confirmDialog}
      </TooltipProvider>
    </AppShell>
  );
}

function NovaTarefaDialog({
  aberto,
  etapas,
  salvando,
  onFechar,
  onCriar,
}: {
  aberto: boolean;
  etapas: Etapa[];
  salvando: boolean;
  onFechar: () => void;
  onCriar: (etapaId: string, titulo: string) => void | Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [etapaId, setEtapaId] = useState<string>("");
  const etapaEfetiva = etapaId && etapas.some((e) => e.id === etapaId) ? etapaId : (etapas[0]?.id ?? "");

  function fechar() {
    setTitulo("");
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent hideClose className={cn(tkDialog, "sm:max-w-md")}>
        <TkPanelHeader
          onClose={fechar}
          title={<DialogTitle className={tkDialogTitle}>Nova tarefa</DialogTitle>}
          description={
            <DialogDescription className={tkDialogDescription}>
              Após a criação, o painel de detalhes abre para completar as informações.
            </DialogDescription>
          }
        />
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!titulo.trim() || !etapaEfetiva) return;
            void onCriar(etapaEfetiva, titulo.trim());
          }}
        >
          <TkField label="Título" htmlFor="nt-titulo">
            <input
              id="nt-titulo"
              autoFocus
              maxLength={300}
              value={titulo}
              placeholder="Descreva a atividade"
              onChange={(e) => setTitulo(e.target.value)}
              className={tkInput}
            />
          </TkField>
          <TkField label="Etapa" htmlFor="nt-etapa">
            <Select value={etapaEfetiva} onValueChange={setEtapaId}>
              <SelectTrigger id="nt-etapa" className={tkSelect}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={tkMenu}>
                {etapas.map((e) => (
                  <SelectItem key={e.id} value={e.id} className={tkMenuItem}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TkField>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <TkButton variant="secondary" onClick={fechar}>
              Cancelar
            </TkButton>
            <TkButton type="submit" variant="primary" disabled={!titulo.trim() || salvando}>
              Criar tarefa
            </TkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
