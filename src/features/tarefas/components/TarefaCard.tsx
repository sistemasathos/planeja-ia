import { memo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GripVertical,
  Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SITUACOES,
  diasDesde,
  formatarData,
  formatarValorCampo,
  urlSegura,
  type Campo,
  type Tarefa,
} from "../lib";

export type CardContexto = {
  siglas: Map<string, string>;
  equipe: Map<string, string>;
  processos: Map<string, string>;
  /** Campos por etapa (apenas não arquivados), já ordenados. */
  camposPorEtapa: Map<string, Campo[]>;
};

function rotuloSecretarias(t: Tarefa, siglas: Map<string, string>): string {
  if (t.todas_secretarias) return "Todas";
  const lista = t.secretaria_ids.map((id) => siglas.get(id) ?? "?");
  if (lista.length === 0) return "Sem secretaria";
  if (lista.length === 1) return lista[0];
  if (lista.length <= 3) return lista.join(", ");
  return `Diversas (${lista.length})`;
}

function primeiroNome(nome: string | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

type ViewProps = {
  tarefa: Tarefa;
  ctx: CardContexto;
  onAbrir?: (id: string) => void;
  handle?: React.ReactNode;
  overlay?: boolean;
};

export function TarefaCardView({ tarefa, ctx, onAbrir, handle, overlay }: ViewProps) {
  const [aberto, setAberto] = useState(false);
  const situacao = SITUACOES.find((s) => s.value === tarefa.situacao) ?? SITUACOES[0];
  const campos = ctx.camposPorEtapa.get(tarefa.etapa_id) ?? [];
  const fase = campos.find((c) => c.usa_como_fase);
  const faseValor = fase ? tarefa.campos[fase.id] : undefined;
  const preenchidos = campos.filter(
    (c) => !c.usa_como_fase && tarefa.campos[c.id]?.trim(),
  );
  const numeroProcesso = tarefa.processo_id
    ? ctx.processos.get(tarefa.processo_id)
    : undefined;
  const link = urlSegura(tarefa.link_url);
  const responsavel = tarefa.responsavel_id
    ? primeiroNome(ctx.equipe.get(tarefa.responsavel_id))
    : "";
  const diasNaEtapa = diasDesde(tarefa.etapa_desde);

  return (
    <div
      className={cn(
        "group rounded-lg border border-border/70 bg-card p-2.5 text-sm shadow-sm transition-shadow",
        overlay && "rotate-1 shadow-lg ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-1.5">
        {handle}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn("size-2 shrink-0 rounded-full", situacao.dot)}
              title={situacao.label}
              aria-label={`Situação: ${situacao.label}`}
            />
            <span>{formatarData(tarefa.created_at)}</span>
            <span aria-hidden>·</span>
            <span title="Tempo nesta etapa">{diasNaEtapa}d na etapa</span>
          </div>
          <button
            type="button"
            onClick={() => onAbrir?.(tarefa.id)}
            className="block w-full text-left font-medium leading-snug outline-none hover:underline focus-visible:underline"
          >
            <span className={cn(!aberto && "line-clamp-2")}>{tarefa.titulo}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="max-w-full truncate px-1.5 py-0 text-[10.5px] font-normal">
              {rotuloSecretarias(tarefa, ctx.siglas)}
            </Badge>
            {faseValor && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10.5px]">
                {faseValor}
              </Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? "Recolher card" : "Expandir card"}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 hover:text-foreground"
              title="Abrir link (M2A)"
            >
              <ExternalLink className="size-3.5" /> M2A
            </a>
          )}
          {numeroProcesso !== undefined && tarefa.processo_id && (
            <Link
              to="/processos/$id"
              params={{ id: tarefa.processo_id }}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 hover:text-foreground"
              title="Abrir processo vinculado"
            >
              <FileText className="size-3.5" /> {numeroProcesso || "Processo"}
            </Link>
          )}
          {tarefa.anexos_count > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Anexos">
              <Paperclip className="size-3.5" /> {tarefa.anexos_count}
            </span>
          )}
        </div>
        {responsavel && (
          <span className="max-w-[40%] truncate rounded-full bg-muted px-2 py-0.5 text-foreground/80" title="Responsável">
            {responsavel}
          </span>
        )}
      </div>

      {aberto && (
        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-[12px]">
          {tarefa.modalidade && (
            <Linha rotulo="Modalidade" valor={tarefa.modalidade} />
          )}
          {tarefa.tipo && <Linha rotulo="Tipo" valor={tarefa.tipo} />}
          {preenchidos.map((c) => (
            <Linha
              key={c.id}
              rotulo={c.nome}
              valor={formatarValorCampo(c, tarefa.campos[c.id])}
            />
          ))}
          {tarefa.observacao && (
            <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">
              {tarefa.observacao}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{rotulo}:</span>
      <span className="min-w-0 break-words">{valor}</span>
    </div>
  );
}

type SortableProps = {
  tarefa: Tarefa;
  ctx: CardContexto;
  onAbrir: (id: string) => void;
  podeEditar: boolean;
};

function SortableTarefaCardBase({ tarefa, ctx, onAbrir, podeEditar }: SortableProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: tarefa.id,
      disabled: !podeEditar,
      data: { type: "tarefa", etapaId: tarefa.etapa_id },
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <TarefaCardView
        tarefa={tarefa}
        ctx={ctx}
        onAbrir={onAbrir}
        handle={
          podeEditar ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Mover tarefa: ${tarefa.titulo}`}
              className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          ) : null
        }
      />
    </div>
  );
}

export const SortableTarefaCard = memo(SortableTarefaCardBase);
