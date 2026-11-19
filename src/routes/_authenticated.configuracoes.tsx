import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  GripVertical,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CamposDialog } from "@/features/tarefas/components/CamposDialog";
import { EtapaDialog } from "@/features/tarefas/components/EtapaDialog";
import { TkButton, TkEmpty, useConfirmDialog } from "@/features/tarefas/components/ui";
import {
  useAtualizarEtapa,
  useCampos,
  useEtapas,
  useExcluirEtapa,
  useSalvarEtapa,
  useTarefas,
} from "@/features/tarefas/hooks";
import { PASSO_POSICAO, corValida, posicaoEntre, type Etapa } from "@/features/tarefas/lib";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { routeHead } from "@/lib/utils/route-head";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () =>
    routeHead({
      title: "Configurações",
      description: "Etapas do quadro de acompanhamento.",
      path: "/configuracoes",
      noindex: true,
    }),
  component: Page,
});

function Page() {
  const { roles } = useAuth();
  const podeEditar = roles.some((r) => r === "admin" || r === "gestor" || r === "operador");
  const etapasQ = useEtapas();
  const camposQ = useCampos();
  const tarefasQ = useTarefas();
  const salvarEtapa = useSalvarEtapa();
  const atualizarEtapa = useAtualizarEtapa();
  const excluirEtapa = useExcluirEtapa();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [dialogo, setDialogo] = useState<{ aberto: boolean; etapa: Etapa | null }>({
    aberto: false,
    etapa: null,
  });
  const [camposEtapa, setCamposEtapa] = useState<Etapa | null>(null);

  const etapas = useMemo(() => etapasQ.data ?? [], [etapasQ.data]);
  const ativas = useMemo(() => etapas.filter((e) => !e.arquivada), [etapas]);
  const arquivadas = useMemo(() => etapas.filter((e) => e.arquivada), [etapas]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tarefasQ.data ?? []) m.set(t.etapa_id, (m.get(t.etapa_id) ?? 0) + 1);
    return m;
  }, [tarefasQ.data]);

  async function salvar(v: { id?: string; nome: string; cor: string; finaliza: boolean }) {
    const nome = v.nome.trim();
    const repetido = etapas.some(
      (e) => e.id !== v.id && e.nome.trim().toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"),
    );
    if (repetido) {
      notify.error("Já existe uma etapa com esse nome");
      return;
    }
    try {
      if (v.id) {
        await salvarEtapa.mutateAsync({ id: v.id, nome, cor: v.cor, finaliza: v.finaliza });
      } else {
        const ultima = ativas.at(-1)?.posicao ?? 0;
        await salvarEtapa.mutateAsync({
          nome,
          cor: v.cor,
          finaliza: v.finaliza,
          posicaoNova: ultima + PASSO_POSICAO,
        });
      }
      notify.success(v.id ? "Etapa atualizada" : "Etapa criada");
      setDialogo({ aberto: false, etapa: null });
    } catch (e) {
      notify.error("Não foi possível salvar a etapa", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function aoSoltar(e: DragEndEvent) {
    if (atualizarEtapa.isPending) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ativas.findIndex((etapa) => etapa.id === active.id);
    const to = ativas.findIndex((etapa) => etapa.id === over.id);
    if (from < 0 || to < 0) return;
    const ordem = [...ativas];
    const [item] = ordem.splice(from, 1);
    if (!item) return;
    ordem.splice(to, 0, item);
    const i = ordem.findIndex((etapa) => etapa.id === item.id);
    try {
      await atualizarEtapa.mutateAsync({
        id: item.id,
        patch: { posicao: posicaoEntre(ordem[i - 1]?.posicao, ordem[i + 1]?.posicao) },
      });
    } catch (err) {
      notify.error("Não foi possível reordenar", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function arquivar(etapa: Etapa) {
    if ((contagem.get(etapa.id) ?? 0) > 0) {
      notify.error("Mova os itens desta etapa antes de arquivá-la");
      return;
    }
    const ok = await confirm({
      title: `Arquivar “${etapa.nome}”?`,
      description: "A etapa sai do quadro e pode ser restaurada depois.",
      confirmLabel: "Arquivar",
    });
    if (!ok) return;
    try {
      await atualizarEtapa.mutateAsync({ id: etapa.id, patch: { arquivada: true } });
      notify.success("Etapa arquivada");
    } catch (e) {
      notify.error("Não foi possível arquivar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function restaurar(etapa: Etapa) {
    const ultima = ativas.at(-1)?.posicao ?? 0;
    try {
      await atualizarEtapa.mutateAsync({
        id: etapa.id,
        patch: { arquivada: false, posicao: ultima + PASSO_POSICAO },
      });
      notify.success("Etapa restaurada");
    } catch (e) {
      notify.error("Não foi possível restaurar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function excluir(etapa: Etapa) {
    if ((contagem.get(etapa.id) ?? 0) > 0) {
      notify.error("Mova os itens desta etapa antes de excluí-la");
      return;
    }
    const ok = await confirm({
      title: `Excluir “${etapa.nome}”?`,
      description: "A etapa e os campos dela são removidos. Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await excluirEtapa.mutateAsync(etapa.id);
      notify.success("Etapa excluída");
    } catch (e) {
      notify.error("Não foi possível excluir", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-[30px] font-semibold tracking-tight text-(--tk-text)">Configurações</h1>
            <p className="text-[14px] text-(--tk-text-2)">
              Etapas do quadro: nome, cor, ordem, campos e arquivamento.
            </p>
          </div>
          {podeEditar && (
            <TkButton variant="primary" onClick={() => setDialogo({ aberto: true, etapa: null })}>
              <Plus /> Nova etapa
            </TkButton>
          )}
        </header>

        {etapasQ.isLoading ? (
          <p className="text-[14px] text-(--tk-text-2)">Carregando etapas...</p>
        ) : ativas.length === 0 ? (
          <TkEmpty
            icon={Layers}
            title="Nenhuma etapa ativa"
            description={
              podeEditar
                ? "Crie a primeira etapa para organizar o quadro."
                : "Nenhuma etapa está ativa no quadro."
            }
          />
        ) : (
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={(e) => void aoSoltar(e)}>
            <SortableContext items={ativas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-2">
                {ativas.map((etapa) => (
                  <EtapaLinha
                    key={etapa.id}
                    etapa={etapa}
                    quantidade={contagem.get(etapa.id) ?? 0}
                    podeEditar={podeEditar}
                    onCampos={() => setCamposEtapa(etapa)}
                    onEditar={() => setDialogo({ aberto: true, etapa })}
                    onArquivar={() => void arquivar(etapa)}
                    onExcluir={() => void excluir(etapa)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {arquivadas.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-(--tk-text-3)">
              Arquivadas
            </h2>
            <ul className="flex flex-col gap-2">
              {arquivadas.map((etapa) => (
                <li
                  key={etapa.id}
                  className="flex items-center gap-3 rounded-(--tk-radius-card) border border-dashed border-(--tk-border) px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-(--tk-text-2)">{etapa.nome}</span>
                  {podeEditar && (
                    <TkButton variant="secondary" size="sm" onClick={() => void restaurar(etapa)}>
                      <RotateCcw /> Restaurar
                    </TkButton>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <EtapaDialog
        aberto={dialogo.aberto}
        etapa={dialogo.etapa}
        salvando={salvarEtapa.isPending || atualizarEtapa.isPending}
        onFechar={() => setDialogo({ aberto: false, etapa: null })}
        onSalvar={(v) => void salvar(v)}
      />
      <CamposDialog etapa={camposEtapa} campos={camposQ.data ?? []} onFechar={() => setCamposEtapa(null)} />
      {confirmDialog}
    </AppShell>
  );
}

function EtapaLinha({
  etapa,
  quantidade,
  podeEditar,
  onCampos,
  onEditar,
  onArquivar,
  onExcluir,
}: {
  etapa: Etapa;
  quantidade: number;
  podeEditar: boolean;
  onCampos: () => void;
  onEditar: () => void;
  onArquivar: () => void;
  onExcluir: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: etapa.id, disabled: !podeEditar });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-(--tk-radius-card) border border-(--tk-border) bg-(--tk-card) px-3 py-2.5",
        isDragging && "opacity-70",
      )}
    >
      {podeEditar && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-(--tk-text-3) hover:bg-(--tk-neutral-bg) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45 active:cursor-grabbing"
          aria-label={`Reordenar ${etapa.nome}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      <span className="size-3 shrink-0 rounded-full" style={{ background: corValida(etapa.cor) }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-(--tk-text)">{etapa.nome}</span>
      <span className="text-[12px] text-(--tk-text-3)">{quantidade}</span>
      {podeEditar && (
        <span className="flex flex-wrap items-center gap-1">
          <TkButton variant="tertiary" size="sm" onClick={onCampos}>
            <ListChecks /> Campos
          </TkButton>
          <TkButton variant="tertiary" size="sm" onClick={onEditar}>
            <Pencil /> Editar
          </TkButton>
          <TkButton variant="tertiary" size="sm" onClick={onArquivar}>
            <Archive /> Arquivar
          </TkButton>
          <TkButton variant="danger" size="sm" onClick={onExcluir}>
            <Trash2 /> Excluir
          </TkButton>
        </span>
      )}
    </li>
  );
}
