import { memo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  FileText,
  GripVertical,
  Hourglass,
  Paperclip,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  diasDesde,
  formatarDia,
  formatarValorCampo,
  siglaIdentificador,
  urlSegura,
  type Campo,
  type ProcessoResumo,
  type Tarefa,
} from "../lib";
import { SITUACAO_VISUAL, TkBadge, TkIconButton, TkTooltip, situacaoLabel } from "./ui";

export type CardContexto = {
  siglas: Map<string, string>;
  /** secretaria_id → "SIGLA — nome" */
  secretariasNomes: Map<string, string>;
  equipe: Map<string, string>;
  processos: Map<string, ProcessoResumo>;
  /** Campos por etapa (apenas não arquivados), já ordenados. */
  camposPorEtapa: Map<string, Campo[]>;
  documentosPorTarefa: Map<string, { id: string; chave: string | null; titulo: string; numero: string | null }[]>;
  /** Nome da fase em andamento, só para demandas que estão no julgamento. */
  faseJulgamento: Map<string, string>;
};

function rotuloSecretarias(t: Tarefa, siglas: Map<string, string>): string {
  if (t.todas_secretarias) return "Todas as secretarias";
  const lista = [...new Set(t.secretaria_ids.map((id) => siglas.get(id) ?? "?"))];
  if (lista.length === 0) return "Sem secretaria definida";
  if (lista.length <= 3) return lista.join(", ");
  return `${lista.slice(0, 2).join(", ")} e mais ${lista.length - 2}`;
}

function nomesSecretarias(t: Tarefa, ctx: CardContexto): string {
  if (t.todas_secretarias) return "Todas as secretarias";
  if (t.secretaria_ids.length === 0) return "Sem secretaria definida";
  return [...new Set(
    t.secretaria_ids.map((id) => ctx.secretariasNomes.get(id) ?? ctx.siglas.get(id) ?? "?"),
  )].join("; ");
}

function primeiroNome(nome: string | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

const SIGLA_DOC: Record<string, string> = {
  dfd: "DFD",
  pesquisa: "Pesquisa",
  etp: "ETP",
  certame: "Certame",
};

function textoDias(n: number): string {
  if (n === 0) return "Hoje";
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}

type ViewProps = {
  tarefa: Tarefa;
  ctx: CardContexto;
  onAbrir?: (id: string) => void;
  handle?: React.ReactNode;
  overlay?: boolean;
  selecionada?: boolean;
  arrastando?: boolean;
};

export function TarefaCardView({
  tarefa,
  ctx,
  onAbrir,
  handle,
  overlay,
  selecionada,
  arrastando,
}: ViewProps) {
  const [aberto, setAberto] = useState(false);
  const situacao = SITUACAO_VISUAL[tarefa.situacao];
  const SituacaoIcon = situacao.icon;
  const campos = ctx.camposPorEtapa.get(tarefa.etapa_id) ?? [];
  const fase = campos.find((c) => c.usa_como_fase);
  const faseValor = fase ? tarefa.campos[fase.id] : undefined;
  const preenchidos = campos.filter(
    (c) => !c.identificador && !c.usa_como_fase && tarefa.campos[c.id]?.trim(),
  );
  const dosDocumentos = (ctx.documentosPorTarefa.get(tarefa.id) ?? []).flatMap((d) => {
    const valor = d.numero?.trim();
    if (!valor) return [];
    return [{
      id: d.id,
      sigla: (d.chave && SIGLA_DOC[d.chave]) || d.titulo,
      nome: d.titulo,
      valor,
    }];
  });
  const siglasDoc = new Set(dosDocumentos.map((d) => d.sigla.toLowerCase()));
  const identificadores = [
    ...dosDocumentos,
    ...[...ctx.camposPorEtapa.values()].flatMap((lista) =>
      lista.flatMap((c) => {
        if (!c.identificador) return [];
        const sigla = siglaIdentificador(c);
        if (siglasDoc.has(sigla.toLowerCase())) return [];
        const valor = (tarefa.campos[c.id] ?? "").trim();
        return valor ? [{ id: c.id, sigla, nome: c.nome, valor }] : [];
      }),
    ),
  ];
  const processo = tarefa.processo_id ? ctx.processos.get(tarefa.processo_id) : undefined;
  const link = urlSegura(tarefa.link_url);
  const responsavelNome = tarefa.responsavel_id
    ? (ctx.equipe.get(tarefa.responsavel_id) ?? "")
    : "";
  const diasNaEtapa = diasDesde(tarefa.etapa_desde);
  const secretariasCurto = rotuloSecretarias(tarefa, ctx.siglas);
  const secretariasCompleto = nomesSecretarias(tarefa, ctx);
  const detalheId = `card-detalhes-${tarefa.id}`;

  return (
    <article
      aria-label={tarefa.titulo}
      className={cn(
        "group/card relative flex min-w-0 flex-col gap-2 rounded-(--tk-radius-card) border border-(--tk-border) bg-(--tk-card) p-2.5 text-(--tk-text) shadow-(--tk-shadow-card) transition-[border-color,background-color,box-shadow]",
        "hover:border-(--tk-border-strong) hover:bg-(--tk-card-hover)",
        selecionada && "border-(--tk-accent)/70 ring-1 ring-(--tk-accent)/40",
        overlay && "cursor-grabbing border-(--tk-accent)/60 shadow-(--tk-shadow-card-hover)",
        arrastando && "border-dashed opacity-45",
      )}
    >
      {/* Cabeçalho: situação, data, tempo na etapa, arrastar e expandir */}
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-(--tk-text-2)">
        <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", situacao.texto)}>
          <SituacaoIcon className="size-3.5" aria-hidden />
          {situacaoLabel(tarefa.situacao)}
        </span>
        {tarefa.data_inclusao && (
          <TkTooltip label={`Incluída em ${formatarDia(tarefa.data_inclusao)}`}>
            <span className="min-w-0 truncate tabular-nums">
              {formatarDia(tarefa.data_inclusao).replace(/\/(\d{2})(\d{2})$/, "/$2")}
            </span>
          </TkTooltip>
        )}
        <TkTooltip
          label={
            diasNaEtapa === 0 ? "Entrou nesta etapa hoje" : `Há ${textoDias(diasNaEtapa)} nesta etapa`
          }
        >
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <Hourglass className="size-3.5 text-(--tk-text-3)" aria-hidden />
            {diasNaEtapa}d
          </span>
        </TkTooltip>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {handle}
          <TkIconButton
            label={aberto ? "Recolher detalhes" : "Expandir detalhes"}
            size="iconSm"
            className="size-7"
            aria-expanded={aberto}
            aria-controls={detalheId}
            onClick={() => setAberto((v) => !v)}
          >
            <ChevronDown className={cn("transition-transform", aberto && "rotate-180")} />
          </TkIconButton>
        </div>
      </div>

      {/* Centro: título e abrangência */}
      <div className="min-w-0 space-y-1.5">
        <button
          type="button"
          onClick={() => onAbrir?.(tarefa.id)}
          className="block w-full cursor-pointer rounded-md text-left text-[15px] font-semibold leading-snug text-(--tk-text) outline-none hover:text-(--tk-accent) focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
        >
          <span className={cn("break-words", !aberto && "line-clamp-3")}>{tarefa.titulo}</span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TkTooltip label={secretariasCompleto}>
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[13px] text-(--tk-text-2)">
              <Building2 className="size-3.5 shrink-0 text-(--tk-text-3)" aria-hidden />
              <span className="truncate">{secretariasCurto}</span>
            </span>
          </TkTooltip>
          {faseValor && (
            <TkBadge tom="info" title={fase ? `${fase.nome}: ${faseValor}` : faseValor}>
              {faseValor}
            </TkBadge>
          )}
          {ctx.faseJulgamento.get(tarefa.id) && (
            <TkBadge tom="warn" title={`Fase do julgamento: ${ctx.faseJulgamento.get(tarefa.id)}`}>
              {ctx.faseJulgamento.get(tarefa.id)}
            </TkBadge>
          )}
        </div>
      </div>

      {/* Rodapé: atalhos e responsável */}
      <div className="flex min-w-0 items-center gap-1.5 border-t border-(--tk-border) pt-2.5">
        {link && (
          <TkTooltip label="Abrir link no M2A (nova aba)">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-(--tk-border) px-2 text-[12px] font-medium text-(--tk-text-2) hover:border-(--tk-border-strong) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              M2A
            </a>
          </TkTooltip>
        )}
        {tarefa.processo_id && (
          <TkTooltip
            label={processo ? `Processo ${processo.numero || "sem número"} — ${processo.objeto}` : "Abrir processo vinculado"}
          >
            <Link
              to="/processos/$id"
              params={{ id: tarefa.processo_id }}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 min-w-0 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-md border border-(--tk-border) px-2 text-[12px] font-medium text-(--tk-text-2) hover:border-(--tk-border-strong) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
            >
              <FileText className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate tabular-nums">{processo?.numero || "Processo"}</span>
            </Link>
          </TkTooltip>
        )}
        {tarefa.anexos_count > 0 && (
          <TkTooltip label={`${tarefa.anexos_count} anexo(s)`}>
            <span className="inline-flex h-7 shrink-0 items-center gap-1 px-1 text-[12px] text-(--tk-text-2)">
              <Paperclip className="size-3.5" aria-hidden />
              {tarefa.anexos_count}
            </span>
          </TkTooltip>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-1.5 pl-1">
          {responsavelNome ? (
            <TkTooltip label={`Responsável: ${responsavelNome}`}>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-(--tk-text-2)">
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-(--tk-accent-soft) text-[11px] font-medium text-(--tk-accent)"
                  aria-hidden
                >
                  {iniciais(responsavelNome)}
                </span>
                <span className="truncate">{primeiroNome(responsavelNome)}</span>
              </span>
            </TkTooltip>
          ) : (
            <TkTooltip label="Sem responsável definido">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-(--tk-border-strong) text-(--tk-text-3)">
                <UserRound className="size-3.5" aria-hidden />
                <span className="sr-only">Sem responsável</span>
              </span>
            </TkTooltip>
          )}
        </div>
      </div>

      {/* Detalhes expandidos */}
      {aberto && (
        <div id={detalheId} className="min-w-0 space-y-3 border-t border-(--tk-border) pt-3">
          <dl className="grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
            <Linha
              rotulo="Inclusão"
              valor={tarefa.data_inclusao ? formatarDia(tarefa.data_inclusao) : null}
            />
            <Linha rotulo="Modalidade" valor={tarefa.modalidade} />
            <Linha rotulo="Tipo" valor={tarefa.tipo} />
            <Linha rotulo="Responsável" valor={responsavelNome || null} vazio="Não definido" />
            <Linha rotulo="Secretaria" valor={secretariasCompleto} />
            {identificadores.map(({ id, nome, valor }) => (
              <Linha key={id} rotulo={nome} valor={valor} />
            ))}
            <Linha
              rotulo="Processo"
              valor={
                processo
                  ? `${processo.numero || "Sem número"} — ${processo.objeto}`
                  : tarefa.processo_id
                    ? "Processo vinculado"
                    : null
              }
              vazio="Não vinculado"
            />
            {preenchidos.map((c) => (
              <Linha key={c.id} rotulo={c.nome} valor={formatarValorCampo(c, tarefa.campos[c.id])} />
            ))}
          </dl>
          {tarefa.observacao && (
            <div className="space-y-1">
              <p className="text-[12px] font-medium text-(--tk-text-3)">Observações</p>
              <p className="line-clamp-6 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-(--tk-text-2)">
                {tarefa.observacao}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Linha({
  rotulo,
  valor,
  vazio = "Não informado",
}: {
  rotulo: string;
  valor: string | null | undefined;
  vazio?: string;
}) {
  const v = (valor ?? "").trim();
  return (
    <>
      <dt className="truncate text-(--tk-text-3)">{rotulo}</dt>
      <dd className={cn("min-w-0 break-words", v ? "text-(--tk-text)" : "text-(--tk-text-3)")}>
        {v || vazio}
      </dd>
    </>
  );
}

type SortableProps = {
  tarefa: Tarefa;
  ctx: CardContexto;
  onAbrir: (id: string) => void;
  podeEditar: boolean;
  selecionada: boolean;
};

function SortableTarefaCardBase({ tarefa, ctx, onAbrir, podeEditar, selecionada }: SortableProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: tarefa.id,
      disabled: !podeEditar,
      data: { type: "tarefa", etapaId: tarefa.etapa_id },
    });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <TarefaCardView
        tarefa={tarefa}
        ctx={ctx}
        onAbrir={onAbrir}
        selecionada={selecionada}
        arrastando={isDragging}
        handle={
          podeEditar ? (
            <TkTooltip label="Arrastar para mover">
              <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                aria-label={`Mover tarefa: ${tarefa.titulo}`}
                className="grid size-7 cursor-grab touch-none place-items-center rounded-lg text-(--tk-text-3) hover:bg-(--tk-neutral-bg) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45 active:cursor-grabbing"
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
            </TkTooltip>
          ) : null
        }
      />
    </div>
  );
}

export const SortableTarefaCard = memo(SortableTarefaCardBase);
