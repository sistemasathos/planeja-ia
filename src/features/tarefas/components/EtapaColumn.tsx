import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ListChecks,
  MoreHorizontal,
  Palette,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LIMITE_POR_COLUNA, corValida, type Etapa, type Tarefa } from "../lib";
import { SortableTarefaCard, type CardContexto } from "./TarefaCard";

type Props = {
  etapa: Etapa;
  tarefas: Tarefa[];
  totalSemFiltro: number;
  ctx: CardContexto;
  podeEditar: boolean;
  limite: number;
  primeira: boolean;
  ultima: boolean;
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

  return (
    <section
      aria-label={`Etapa ${etapa.nome}`}
      className="flex w-[300px] shrink-0 flex-col rounded-xl border border-border/60 bg-muted/30"
      style={{ borderTop: `4px solid ${cor}` }}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{etapa.nome}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {tarefas.length}
          {tarefas.length !== totalSemFiltro && `/${totalSemFiltro}`}
        </span>
        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Opções da etapa ${etapa.nome}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEditarEtapa(etapa)}>
                <Palette className="size-4" /> Renomear / cor
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCamposEtapa(etapa)}>
                <ListChecks className="size-4" /> Campos da etapa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={primeira}
                onSelect={() => onMoverEtapa(etapa, -1)}
              >
                <ArrowLeft className="size-4" /> Mover para a esquerda
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={ultima}
                onSelect={() => onMoverEtapa(etapa, 1)}
              >
                <ArrowRight className="size-4" /> Mover para a direita
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onArquivarEtapa(etapa)}>
                <Archive className="size-4" /> Arquivar etapa
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onExcluirEtapa(etapa)}
              >
                <Trash2 className="size-4" /> Excluir etapa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2",
          "max-h-[calc(100vh-17rem)]",
          isOver && "rounded-lg bg-primary/5",
        )}
      >
        <SortableContext
          items={visiveis.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {visiveis.map((t) => (
            <SortableTarefaCard
              key={t.id}
              tarefa={t}
              ctx={ctx}
              onAbrir={onAbrir}
              podeEditar={podeEditar}
            />
          ))}
        </SortableContext>
        {tarefas.length === 0 && !adicionando && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {totalSemFiltro === 0 ? "Nenhuma tarefa nesta etapa." : "Nada com os filtros atuais."}
          </p>
        )}
        {restantes > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onVerMais(etapa.id)}
          >
            Ver mais ({Math.min(restantes, LIMITE_POR_COLUNA)} de {restantes})
          </Button>
        )}
      </div>

      {podeEditar && (
        <footer className="border-t border-border/60 p-2">
          {adicionando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              className="flex flex-col gap-1.5"
            >
              <Input
                autoFocus
                value={titulo}
                maxLength={300}
                placeholder="Título da tarefa"
                onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdicionando(false);
                    setTitulo("");
                  }
                }}
                aria-label="Título da nova tarefa"
              />
              <div className="flex gap-1.5">
                <Button type="submit" size="sm" disabled={!titulo.trim() || salvando}>
                  Adicionar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdicionando(false);
                    setTitulo("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setAdicionando(true)}
            >
              <Plus className="size-4" /> Adicionar tarefa
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}
