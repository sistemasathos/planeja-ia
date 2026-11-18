import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CircleCheckBig, Inbox, Plus, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIMITE_POR_COLUNA, corTextoSobre, corValida, type Etapa, type Tarefa } from "../lib";
import { SortableTarefaCard, type CardContexto } from "./TarefaCard";
import { TkButton, TkCount, TkTooltip, tkInput } from "./ui";

/** Largura adaptável das colunas (também usada no esqueleto de carregamento). */
export const COLUNA_LARGURA = "w-[clamp(296px,22vw,320px)]";

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
  onCriar: (etapaId: string, titulo: string) => Promise<void | false> | void | false;
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
  onCriar,
}: Props) {
  const cor = corValida(etapa.cor);
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${etapa.id}`,
    data: { type: "coluna", etapaId: etapa.id },
  });
  const [adicionando, setAdicionando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const visiveis = tarefas.slice(0, limite);
  const restantes = tarefas.length - visiveis.length;
  const filtrada = tarefas.length !== totalSemFiltro;

  async function confirmar() {
    const t = titulo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      const criada = await onCriar(etapa.id, t);
      if (criada !== false) {
        setTitulo("");
        setAdicionando(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    setAdicionando(false);
    setTitulo("");
  }

  return (
    <section
      aria-label={`Etapa ${etapa.nome}`}
      className={cn(
        COLUNA_LARGURA,
        "flex h-full max-h-full shrink-0 flex-col overflow-hidden rounded-(--tk-radius-column) border border-(--tk-border) bg-(--tk-column) transition-colors",
        isOver && "border-(--tk-accent)/50",
      )}
    >
      <div className="h-1.5 w-full shrink-0" style={{ background: cor }} aria-hidden />
      <header
        className="flex h-12 shrink-0 items-center gap-2 px-3"
        style={{ background: `color-mix(in srgb, ${cor} 14%, var(--tk-column))` }}
      >
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
          style={{ background: `color-mix(in srgb, ${cor} 18%, var(--tk-card))` }}
        >
          {filtrada ? `${tarefas.length}/${totalSemFiltro}` : tarefas.length}
        </TkCount>
      </header>

      {podeEditar && (
        <div className="shrink-0 px-2.5 pt-2.5">
          {adicionando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              className="flex flex-col gap-2"
            >
              <input
                autoFocus
                value={titulo}
                maxLength={300}
                placeholder="Título da demanda"
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelar();
                }}
                aria-label={`Título da nova demanda em ${etapa.nome}`}
                className={tkInput}
              />
              <div className="flex gap-2">
                <TkButton type="submit" variant="primary" size="sm" disabled={!titulo.trim() || salvando}>
                  Adicionar
                </TkButton>
                <TkButton variant="tertiary" size="sm" onClick={cancelar}>
                  Cancelar
                </TkButton>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-(--tk-radius-card) text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
              style={{ background: cor, color: corTextoSobre(cor) }}
            >
              <Plus className="size-4" aria-hidden />
              Nova demanda
            </button>
          )}
        </div>
      )}

      <div
        ref={setNodeRef}
        className={cn(
          "tk-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5 pt-2.5",
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
                  className={cn(
                    "w-full cursor-pointer rounded-(--tk-radius-control) px-2 py-1.5 text-left text-[15px] font-semibold leading-snug text-(--tk-text) hover:bg-(--tk-card) hover:text-(--tk-accent)",
                    t.id === selecionadaId && "bg-(--tk-accent-soft) text-(--tk-accent)",
                  )}
                >
                  {t.titulo}
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
        {tarefas.length === 0 && !adicionando && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-(--tk-radius-card) border border-dashed border-(--tk-border-strong) px-4 py-8 text-center">
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
