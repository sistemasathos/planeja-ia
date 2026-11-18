import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  Inbox,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LIMITE_POR_COLUNA, corValida, type Etapa, type Tarefa } from "../lib";
import { SortableTarefaCard, type CardContexto } from "./TarefaCard";
import {
  TkButton,
  TkCount,
  TkIconButton,
  TkTooltip,
  tkInput,
  tkMenu,
  tkMenuItem,
  tkMenuItemDanger,
  tkMenuSeparator,
} from "./ui";

/** Largura adaptável das colunas (também usada no esqueleto de carregamento). */
export const COLUNA_LARGURA = "w-[clamp(296px,22vw,320px)]";

type Props = {
  etapa: Etapa;
  tarefas: Tarefa[];
  totalSemFiltro: number;
  ctx: CardContexto;
  podeEditar: boolean;
  limite: number;
  primeira: boolean;
  ultima: boolean;
  selecionadaId?: string;
  onAbrir: (id: string) => void;
  onVerMais: (etapaId: string) => void;
  onCriar: (etapaId: string, titulo: string) => Promise<void> | void;
  onEditarEtapa: (etapa: Etapa) => void;
  onCamposEtapa: (etapa: Etapa) => void;
  onMoverEtapa: (etapa: Etapa, direcao: -1 | 1) => void;
  onArquivarEtapa: (etapa: Etapa) => void;
  onExcluirEtapa: (etapa: Etapa) => void;
};

export function EtapaColumn({
  etapa,
  tarefas,
  totalSemFiltro,
  ctx,
  podeEditar,
  limite,
  primeira,
  ultima,
  selecionadaId,
  onAbrir,
  onVerMais,
  onCriar,
  onEditarEtapa,
  onCamposEtapa,
  onMoverEtapa,
  onArquivarEtapa,
  onExcluirEtapa,
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
      await onCriar(etapa.id, t);
      setTitulo("");
      setAdicionando(false);
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
        "flex h-full max-h-full shrink-0 flex-col rounded-(--tk-radius-column) border border-(--tk-border) bg-(--tk-column) transition-colors",
        isOver && "border-(--tk-accent)/50",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 pl-4 pr-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
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
              ? `${tarefas.length} de ${totalSemFiltro} tarefas com os filtros atuais`
              : `${tarefas.length} tarefas`
          }
        >
          {filtrada ? `${tarefas.length}/${totalSemFiltro}` : tarefas.length}
        </TkCount>
        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TkIconButton label={`Opções da etapa ${etapa.nome}`} size="iconSm">
                <MoreHorizontal />
              </TkIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn(tkMenu, "w-56")}>
              <DropdownMenuItem className={tkMenuItem} onSelect={() => onEditarEtapa(etapa)}>
                <Pencil /> Editar nome e cor
              </DropdownMenuItem>
              <DropdownMenuItem className={tkMenuItem} onSelect={() => onCamposEtapa(etapa)}>
                <ListChecks /> Campos da etapa
              </DropdownMenuItem>
              <DropdownMenuSeparator className={tkMenuSeparator} />
              <DropdownMenuItem
                className={tkMenuItem}
                disabled={primeira}
                onSelect={() => onMoverEtapa(etapa, -1)}
              >
                <ArrowLeft /> Mover para a esquerda
              </DropdownMenuItem>
              <DropdownMenuItem
                className={tkMenuItem}
                disabled={ultima}
                onSelect={() => onMoverEtapa(etapa, 1)}
              >
                <ArrowRight /> Mover para a direita
              </DropdownMenuItem>
              <DropdownMenuSeparator className={tkMenuSeparator} />
              <DropdownMenuItem className={tkMenuItem} onSelect={() => onArquivarEtapa(etapa)}>
                <Archive /> Arquivar etapa
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(tkMenuItem, tkMenuItemDanger)}
                onSelect={() => onExcluirEtapa(etapa)}
              >
                <Trash2 /> Excluir etapa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "tk-scroll flex min-h-28 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5",
          isOver && "bg-(--tk-accent-soft)/60",
        )}
      >
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
        {tarefas.length === 0 && !adicionando && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-(--tk-radius-card) border border-dashed border-(--tk-border-strong) px-4 py-8 text-center">
            {totalSemFiltro === 0 ? (
              <Inbox className="size-5 text-(--tk-text-3)" aria-hidden />
            ) : (
              <SearchX className="size-5 text-(--tk-text-3)" aria-hidden />
            )}
            <p className="text-[13px] text-(--tk-text-2)">
              {totalSemFiltro === 0
                ? "Não há tarefas nesta etapa."
                : "Nenhuma tarefa desta etapa corresponde aos filtros."}
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

      {podeEditar && (
        <footer className="shrink-0 border-t border-(--tk-border) p-2.5">
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
                placeholder="Título da tarefa"
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelar();
                }}
                aria-label={`Título da nova tarefa em ${etapa.nome}`}
                className={tkInput}
              />
              <div className="flex gap-2">
                <TkButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!titulo.trim() || salvando}
                >
                  Adicionar
                </TkButton>
                <TkButton variant="tertiary" size="sm" onClick={cancelar}>
                  Cancelar
                </TkButton>
              </div>
            </form>
          ) : (
            <TkButton
              variant="tertiary"
              className="w-full justify-start px-3"
              onClick={() => setAdicionando(true)}
            >
              <Plus /> Adicionar tarefa
            </TkButton>
          )}
        </footer>
      )}
    </section>
  );
}
