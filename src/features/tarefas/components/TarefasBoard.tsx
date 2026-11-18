import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  LIMITE_POR_COLUNA,
  posicaoEntre,
  precisaRebalancear,
  type Etapa,
  type Tarefa,
} from "../lib";
import { EtapaColumn } from "./EtapaColumn";
import { TarefaCardView, type CardContexto } from "./TarefaCard";

/** Altura do quadro: ocupa o espaço vertical abaixo do cabeçalho e dos filtros. */
export const QUADRO_ALTURA = "h-[max(460px,calc(100dvh-21rem))]";

export type MoverInput = {
  id: string;
  etapa_id: string;
  posicao: number;
  rebalancear?: string[];
};

type Props = {
  etapas: Etapa[];
  tarefas: Tarefa[];
  /** Total de tarefas por etapa antes dos filtros (para o contador). */
  totais: Map<string, number>;
  ctx: CardContexto;
  podeEditar: boolean;
  /** Tarefa aberta no painel lateral (destacada no quadro). */
  selecionadaId?: string;
  onMover: (input: MoverInput) => void;
  onAbrir: (id: string) => void;
  onCriar: (etapaId: string, titulo: string) => Promise<void> | void;
  onEditarEtapa: (etapa: Etapa) => void;
  onCamposEtapa: (etapa: Etapa) => void;
  onMoverEtapa: (etapa: Etapa, direcao: -1 | 1) => void;
  onArquivarEtapa: (etapa: Etapa) => void;
  onExcluirEtapa: (etapa: Etapa) => void;
};

export function TarefasBoard({
  etapas,
  tarefas,
  totais,
  ctx,
  podeEditar,
  selecionadaId,
  onMover,
  onAbrir,
  onCriar,
  onEditarEtapa,
  onCamposEtapa,
  onMoverEtapa,
  onArquivarEtapa,
  onExcluirEtapa,
}: Props) {
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [limites, setLimites] = useState<Record<string, number>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const e of etapas) mapa.set(e.id, []);
    for (const t of tarefas) mapa.get(t.etapa_id)?.push(t);
    for (const lista of mapa.values()) lista.sort((a, b) => a.posicao - b.posicao);
    return mapa;
  }, [etapas, tarefas]);

  const ativa = ativaId ? tarefas.find((t) => t.id === ativaId) : undefined;

  function limiteDe(etapaId: string) {
    return limites[etapaId] ?? LIMITE_POR_COLUNA;
  }

  function handleDragStart(e: DragStartEvent) {
    setAtivaId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setAtivaId(null);
    const { active, over } = e;
    if (!over || !podeEditar) return;
    const id = String(active.id);
    const movida = tarefas.find((t) => t.id === id);
    if (!movida) return;

    const overId = String(over.id);
    let destino: string;
    let insertAt: number;
    let lista: Tarefa[];

    if (overId.startsWith("col:")) {
      destino = overId.slice(4);
      lista = (porEtapa.get(destino) ?? []).filter((t) => t.id !== id);
      insertAt = Math.min(limiteDe(destino), lista.length);
    } else {
      const alvo = tarefas.find((t) => t.id === overId);
      if (!alvo) return;
      destino = alvo.etapa_id;
      const cheia = porEtapa.get(destino) ?? [];
      const overIdx = cheia.findIndex((t) => t.id === overId);
      lista = cheia.filter((t) => t.id !== id);
      insertAt = Math.min(Math.max(overIdx, 0), lista.length);
    }

    if (!porEtapa.has(destino)) return;

    // Sem mudança: mesma etapa e mesma posição relativa.
    if (destino === movida.etapa_id) {
      const atual = (porEtapa.get(destino) ?? []).findIndex((t) => t.id === id);
      if (atual === insertAt) return;
    }

    const anterior = lista[insertAt - 1]?.posicao;
    const proximo = lista[insertAt]?.posicao;
    const posicao = posicaoEntre(anterior, proximo);
    const input: MoverInput = { id, etapa_id: destino, posicao };
    if (precisaRebalancear(anterior, proximo)) {
      const ordem = [...lista];
      ordem.splice(insertAt, 0, movida);
      input.rebalancear = ordem.map((t) => t.id);
    }
    onMover(input);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setAtivaId(null)}
    >
      <div
        className={cn(QUADRO_ALTURA, "tk-scroll relative flex min-w-0 items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/40")}
        role="region"
        aria-label="Quadro de tarefas"
        tabIndex={0}
      >
        {etapas.map((etapa, i) => (
          <EtapaColumn
            key={etapa.id}
            etapa={etapa}
            tarefas={porEtapa.get(etapa.id) ?? []}
            totalSemFiltro={totais.get(etapa.id) ?? 0}
            ctx={ctx}
            podeEditar={podeEditar}
            selecionadaId={selecionadaId}
            limite={limiteDe(etapa.id)}
            primeira={i === 0}
            ultima={i === etapas.length - 1}
            onAbrir={onAbrir}
            onVerMais={(eid) =>
              setLimites((l) => ({
                ...l,
                [eid]: (l[eid] ?? LIMITE_POR_COLUNA) + LIMITE_POR_COLUNA,
              }))
            }
            onCriar={onCriar}
            onEditarEtapa={onEditarEtapa}
            onCamposEtapa={onCamposEtapa}
            onMoverEtapa={onMoverEtapa}
            onArquivarEtapa={onArquivarEtapa}
            onExcluirEtapa={onExcluirEtapa}
          />
        ))}
      </div>
      <DragOverlay>
        {ativa ? <TarefaCardView tarefa={ativa} ctx={ctx} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
