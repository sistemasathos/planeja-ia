import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Archive, Layers, Plus, RotateCcw } from "lucide-react";
import { routeHead } from "@/lib/utils/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TIPOS_SUGERIDOS,
  filtrarTarefas,
  posicaoEntre,
  type Campo,
  type Etapa,
  type FiltrosTarefas,
  type MembroEquipe,
  type Tarefa,
} from "@/features/tarefas/lib";
import { CamposDialog } from "@/features/tarefas/components/CamposDialog";
import { EtapaDialog } from "@/features/tarefas/components/EtapaDialog";
import { FiltrosBar } from "@/features/tarefas/components/FiltrosBar";
import { RelatorioMenu } from "@/features/tarefas/components/RelatorioMenu";
import { TarefaSheet } from "@/features/tarefas/components/TarefaSheet";
import { TarefasBoard } from "@/features/tarefas/components/TarefasBoard";
import type { CardContexto } from "@/features/tarefas/components/TarefaCard";

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
  const equipeMap = useMemo(() => new Map(equipe.map((m) => [m.id, m.nome])), [equipe]);

  const processoIds = useMemo(
    () => [...new Set(tarefas.map((t) => t.processo_id).filter((x): x is string => Boolean(x)))],
    [tarefas],
  );
  const processosQ = useProcessosPorIds(processoIds);
  const processosMap = useMemo(
    () => new Map((processosQ.data ?? []).map((p) => [p.id, p.numero_processo ?? ""])),
    [processosQ.data],
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
    () => ({ siglas, equipe: equipeMap, processos: processosMap, camposPorEtapa }),
    [siglas, equipeMap, processosMap, camposPorEtapa],
  );

  const filtradas = useMemo(
    () => filtrarTarefas(tarefas, filtros, processosMap),
    [tarefas, filtros, processosMap],
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

  const filtrosDescricao = useMemo(() => {
    const partes: string[] = [];
    if (filtros.q) partes.push(`busca "${filtros.q}"`);
    if (filtros.modalidade) partes.push(`modalidade ${filtros.modalidade}`);
    if (filtros.tipo) partes.push(`tipo ${filtros.tipo}`);
    if (filtros.secretaria) partes.push(`secretaria ${siglas.get(filtros.secretaria) ?? ""}`);
    if (filtros.responsavel) {
      partes.push(
        `responsável ${
          filtros.responsavel === "__nenhum__"
            ? "(nenhum)"
            : (equipeMap.get(filtros.responsavel) ?? "")
        }`,
      );
    }
    if (filtros.situacao) partes.push(`situação ${filtros.situacao}`);
    return partes.join("; ");
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
    const ok = await notify.confirmAsync(`Arquivar a etapa "${etapa.nome}"?`, {
      confirmLabel: "Arquivar",
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
    const ok = await notify.confirmAsync(
      `Excluir definitivamente a etapa "${etapa.nome}" e seus campos?`,
      { confirmLabel: "Excluir" },
    );
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

  const acoes = (
    <div className="flex flex-wrap items-center gap-2">
      <RelatorioMenu
        desabilitado={carregando || Boolean(erro)}
        contexto={{
          etapas,
          tarefas: filtradas,
          campos,
          siglas,
          equipe: equipeMap,
          processos: processosMap,
          filtrosDescricao,
        }}
      />
      {etapasArquivadas.length > 0 && podeEditar && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Archive className="size-4" /> Arquivadas ({etapasArquivadas.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {etapasArquivadas.map((e) => (
              <DropdownMenuItem key={e.id} onSelect={() => void restaurarEtapa(e)}>
                <RotateCcw className="size-4" /> Restaurar “{e.nome}”
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {podeEditar && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEtapaDialog({ aberto: true, etapa: null })}
          >
            <Layers className="size-4" /> Nova etapa
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setNovaTarefaAberta(true)}
            disabled={etapasAtivas.length === 0}
          >
            <Plus className="size-4" /> Nova tarefa
          </Button>
        </>
      )}
    </div>
  );

  return (
    <AppShell
      title="Tarefas"
      subtitle="Quadro da equipe: arraste os cards entre as etapas e acompanhe o andamento."
      actions={acoes}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <FiltrosBar
          filtros={filtros}
          onChange={setFiltros}
          modalidades={modalidades}
          tipos={tipos}
          secretarias={secretarias.map((s) => ({ id: s.id, label: s.sigla }))}
          equipe={equipe}
        />

        {carregando ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72 w-[300px] shrink-0" />
            ))}
          </div>
        ) : erro ? (
          <EmptyState
            icon={Layers}
            title="Não foi possível carregar as tarefas"
            description={erro instanceof Error ? erro.message : "Tente novamente em instantes."}
          />
        ) : etapasAtivas.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhuma etapa configurada"
            description="Crie a primeira etapa para começar a organizar as tarefas."
          />
        ) : (
          <TarefasBoard
            etapas={etapasAtivas}
            tarefas={filtradas}
            totais={totais}
            ctx={ctx}
            podeEditar={podeEditar}
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

      <CamposDialog
        etapa={camposEtapa}
        campos={campos}
        onFechar={() => setCamposEtapa(null)}
      />

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

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) {
          setTitulo("");
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Depois de criar, o painel de detalhes abre para completar as informações.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!titulo.trim() || !etapaEfetiva) return;
            void onCriar(etapaEfetiva, titulo.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nt-titulo">Título</Label>
            <Input
              id="nt-titulo"
              autoFocus
              maxLength={300}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <Select value={etapaEfetiva} onValueChange={setEtapaId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {etapas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!titulo.trim() || salvando}>
              Criar tarefa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
