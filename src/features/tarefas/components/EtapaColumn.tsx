import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CircleCheckBig, Inbox, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIMITE_POR_COLUNA, corValida, type Etapa, type Tarefa } from "../lib";
import { SortableTarefaCard, type CardContexto } from "./TarefaCard";
import { TkButton, TkCount, TkTooltip, situacaoLabel } from "./ui";

/** Largura adaptável das colunas (também usada no esqueleto de carregamento). */
export const COLUNA_LARGURA = "w-[clamp(250px,18vw,280px)]";

type Props = {
  etapa: Etapa;
  tarefas: Tarefa[];
  totalSemFiltro: number;
  ctx: CardContexto;
  podeEditar: boolean;
  lista?: boolean;
  limite: number;
  selecionadaId?: string;
  onAbrir: (id: string) => void;
  onVerMais: (etapaId: string) => void;
};

export function EtapaColumn({
  etapa,
  tarefas,
  totalSemFiltro,
  ctx,
  podeEditar,
  lista = false,
  limite,
  selecionadaId,
  onAbrir,
  onVerMais,
}: Props) {
  const cor = corValida(etapa.cor);
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${etapa.id}`,
    data: { type: "coluna", etapaId: etapa.id },
  });
  const visiveis = tarefas.slice(0, limite);
  const restantes = tarefas.length - visiveis.length;
  const filtrada = tarefas.length !== totalSemFiltro;

  return (
    <section
      aria-label={`Etapa ${etapa.nome}`}
      className={cn(
        COLUNA_LARGURA,
        "flex h-auto max-h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-(--tk-radius-column) border border-(--tk-border) bg-(--tk-column) transition-colors",
        isOver && "border-(--tk-accent)/50",
      )}
    >
      <div className="h-[5px] w-full shrink-0" style={{ background: cor }} aria-hidden />
      <header className="flex h-9 shrink-0 items-center gap-2 bg-(--tk-column) px-2.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-(--tk-text)" title={etapa.nome}>
          {etapa.nome}
        </h2>
        {etapa.finaliza && (
          <TkTooltip label="Etapa de conclusão">
            <CircleCheckBig className="size-4 shrink-0 text-(--tk-text-3)" aria-label="Etapa de conclusão" />
          </TkTooltip>
        )}
        <TkCount
          label={
            filtrada
              ? `${tarefas.length} de ${totalSemFiltro} com os filtros atuais`
              : `${tarefas.length}`
          }
        >
          {filtrada ? `${tarefas.length}/${totalSemFiltro}` : tarefas.length}
        </TkCount>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "tk-scroll flex flex-col gap-2 overflow-y-auto px-2.5 pb-2 pt-2",
          tarefas.length === 0 ? "min-h-[160px]" : "min-h-0 flex-auto",
          isOver && "bg-(--tk-accent-soft)/60",
        )}
      >
        {lista ? (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {visiveis.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(t.id)}
                  aria-label={`${t.titulo}. Situação: ${situacaoLabel(t.situacao)}`}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-(--tk-radius-control) px-2 py-1.5 text-left text-[15px] font-semibold leading-snug text-(--tk-text) hover:bg-(--tk-card) hover:text-(--tk-accent)",
                    t.id === selecionadaId && "bg-(--tk-accent-soft) text-(--tk-accent)",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      t.situacao === "travada"
                        ? "bg-(--tk-danger)"
                        : t.situacao === "atencao"
                          ? "bg-(--tk-warn)"
                          : "bg-(--tk-ok)",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">{t.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <SortableContext items={visiveis.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {visiveis.map((t) => (
              <SortableTarefaCard
                key={t.id}
                tarefa={t}
                ctx={ctx}
                onAbrir={onAbrir}
                podeEditar={podeEditar}
                selecionada={t.id === selecionadaId}
              />
            ))}
          </SortableContext>
        )}
        {tarefas.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-(--tk-radius-card) border border-dashed border-(--tk-border-strong) px-3 py-4 text-center">
            {totalSemFiltro === 0 ? (
              <Inbox className="size-5 text-(--tk-text-3)" aria-hidden />
            ) : (
              <SearchX className="size-5 text-(--tk-text-3)" aria-hidden />
            )}
            <p className="text-[13px] text-(--tk-text-2)">
              {totalSemFiltro === 0
                ? "Nenhuma demanda nesta etapa."
                : "Nenhuma demanda desta etapa corresponde aos filtros."}
            </p>
          </div>
        )}
        {restantes > 0 && (
          <TkButton
            variant="tertiary"
            size="sm"
            className="w-full"
            onClick={() => onVerMais(etapa.id)}
          >
            Ver mais {Math.min(restantes, LIMITE_POR_COLUNA)} de {restantes}
          </TkButton>
        )}
      </div>
    </section>
  );
}
