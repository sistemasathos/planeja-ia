import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Building2,
  Gavel,
  Search,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FILTROS_VAZIOS,
  SITUACOES,
  type CriterioFiltro,
  type FiltrosTarefas,
  type MembroEquipe,
  type Situacao,
} from "../lib";
import {
  SituacaoOpcao,
  TkButton,
  TkTooltip,
  tkInput,
  tkMenu,
  tkMenuItem,
  tkMenuSeparator,
  tkSelect,
} from "./ui";

const TODOS = "__todos__";

type Opcao = { value: string; label: string; curto?: string };

type Props = {
  filtros: FiltrosTarefas;
  onChange: (f: FiltrosTarefas) => void;
  /** Critérios ativos com rótulos legíveis (exibidos como chips). */
  criterios: CriterioFiltro[];
  /** Quantidade exibida após os filtros e total do quadro. */
  resultado: { exibidas: number; total: number };
  modalidades: string[];
  tipos: string[];
  secretarias: { id: string; sigla: string; label: string }[];
  equipe: MembroEquipe[];
};

function FiltroSelect({
  rotulo,
  todos,
  icon: Icon,
  valor,
  onChange,
  opcoes,
  renderOpcao,
}: {
  rotulo: string;
  /** Texto da opção que remove o filtro (ex.: "Todas as modalidades"). */
  todos: string;
  icon: LucideIcon;
  valor: string;
  onChange: (v: string) => void;
  opcoes: Opcao[];
  renderOpcao?: (o: Opcao) => React.ReactNode;
}) {
  const atual = valor ? opcoes.find((o) => o.value === valor) : undefined;
  const ativo = Boolean(valor);
  const texto = ativo ? (atual?.curto ?? atual?.label ?? valor) : rotulo;
  const dica = ativo ? `${rotulo}: ${atual?.label ?? valor}` : `Filtrar por ${rotulo.toLowerCase()}`;

  return (
    <Select value={valor || TODOS} onValueChange={(v) => onChange(v === TODOS ? "" : v)}>
      <TkTooltip label={dica}>
        <SelectTrigger
          aria-label={dica}
          className={cn(
            tkSelect,
            "@min-[68rem]:w-auto @min-[68rem]:max-w-[220px] @min-[68rem]:flex-[1_1_auto]",
            ativo &&
              "border-(--tk-accent)/60 bg-(--tk-accent-soft) dark:border-(--tk-accent)/60 dark:bg-(--tk-accent-soft)",
          )}
        >
          <Icon
            className={cn("size-4 shrink-0", ativo ? "text-(--tk-accent)" : "text-(--tk-text-3)")}
            aria-hidden
          />
          <SelectValue
            className={cn(
              "flex-1 text-left",
              ativo ? "font-medium text-(--tk-text)" : "text-(--tk-text-2)",
            )}
          >
            {texto}
          </SelectValue>
        </SelectTrigger>
      </TkTooltip>
      <SelectContent className={cn(tkMenu, "max-h-80 min-w-[240px]")}>
        <SelectItem value={TODOS} className={tkMenuItem}>
          {todos}
        </SelectItem>
        {opcoes.length > 0 && <SelectSeparator className={tkMenuSeparator} />}
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value} className={tkMenuItem}>
            {renderOpcao ? renderOpcao(o) : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FiltrosBar({
  filtros,
  onChange,
  criterios,
  resultado,
  modalidades,
  tipos,
  secretarias,
  equipe,
}: Props) {
  // Busca com debounce: o input é local e só vai para a URL após uma pausa.
  // O timer lê os filtros mais recentes para não restaurar critérios já limpos.
  const [q, setQ] = useState(filtros.q);
  const filtrosRef = useRef(filtros);
  useEffect(() => {
    filtrosRef.current = filtros;
  });
  useEffect(() => setQ(filtros.q), [filtros.q]);
  useEffect(() => {
    if (q === filtrosRef.current.q) return;
    const t = setTimeout(() => onChange({ ...filtrosRef.current, q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const set = (k: keyof FiltrosTarefas) => (v: string) => onChange({ ...filtros, [k]: v });

  return (
    // Largura medida pelo próprio container (sidebar aberta ou recolhida):
    // linha única a partir de 68rem; abaixo, busca em cima e filtros em grade.
    <div className="@container flex min-w-0 flex-col gap-3">
      <div
        className="flex min-w-0 flex-col gap-2 @min-[68rem]:flex-row @min-[68rem]:items-center"
        role="search"
        aria-label="Filtros de tarefas"
      >
        <div className="relative w-full min-w-0 @min-[34rem]:max-w-[360px] @min-[68rem]:w-[358px] @min-[68rem]:shrink-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-(--tk-text-3)"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.preventDefault();
                setQ("");
              }
            }}
            placeholder="Buscar tarefa, número ou objeto do processo..."
            className={cn(
              tkInput,
              "pl-10 [&::-webkit-search-cancel-button]:appearance-none",
              q ? "pr-10" : "pr-3",
            )}
            maxLength={80}
            aria-label="Buscar tarefa, número ou objeto do processo"
          />
          {q && (
            <TkTooltip label="Limpar busca">
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-(--tk-text-3) hover:bg-(--tk-neutral-bg) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
              >
                <X className="size-4" />
              </button>
            </TkTooltip>
          )}
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 @min-[34rem]:grid-cols-3 @min-[54rem]:grid-cols-5 @min-[68rem]:flex">
          <FiltroSelect
            rotulo="Modalidade"
            todos="Todas as modalidades"
            icon={Gavel}
            valor={filtros.modalidade}
            onChange={set("modalidade")}
            opcoes={modalidades.map((m) => ({ value: m, label: m }))}
          />
          <FiltroSelect
            rotulo="Tipo"
            todos="Todos os tipos"
            icon={Tag}
            valor={filtros.tipo}
            onChange={set("tipo")}
            opcoes={tipos.map((m) => ({ value: m, label: m }))}
          />
          <FiltroSelect
            rotulo="Secretaria"
            todos="Todas as secretarias"
            icon={Building2}
            valor={filtros.secretaria}
            onChange={set("secretaria")}
            opcoes={secretarias.map((s) => ({ value: s.id, label: s.label, curto: s.sigla }))}
          />
          <FiltroSelect
            rotulo="Responsável"
            todos="Todos os responsáveis"
            icon={UserRound}
            valor={filtros.responsavel}
            onChange={set("responsavel")}
            opcoes={[
              { value: "__nenhum__", label: "Sem responsável" },
              ...equipe.map((m) => ({ value: m.id, label: m.nome })),
            ]}
          />
          <FiltroSelect
            rotulo="Situação"
            todos="Todas as situações"
            icon={Activity}
            valor={filtros.situacao}
            onChange={set("situacao")}
            opcoes={SITUACOES.map((s) => ({ value: s.value, label: s.label }))}
            renderOpcao={(o) => <SituacaoOpcao situacao={o.value as Situacao} />}
          />
        </div>
      </div>

      {criterios.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-[13px] text-(--tk-text-2)">
            Exibindo {resultado.exibidas} de {resultado.total}{" "}
            {resultado.total === 1 ? "tarefa" : "tarefas"}
          </span>
          <span className="h-4 w-px bg-(--tk-border-strong)" aria-hidden />
          {criterios.map((c) => (
            <span
              key={c.chave}
              className="inline-flex h-8 min-w-0 max-w-[280px] items-center gap-1 rounded-full border border-(--tk-border-strong) bg-(--tk-card) pl-3 pr-1 text-[13px]"
            >
              <span className="shrink-0 text-(--tk-text-2)">{c.rotulo}:</span>
              <span className="truncate font-medium text-(--tk-text)" title={c.valor}>
                {c.valor}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (c.chave === "q") setQ("");
                  onChange({ ...filtros, [c.chave]: "" });
                }}
                aria-label={`Remover filtro ${c.rotulo}`}
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-(--tk-text-3) hover:bg-(--tk-neutral-bg) hover:text-(--tk-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <TkButton
            variant="tertiary"
            size="sm"
            onClick={() => {
              setQ("");
              onChange(FILTROS_VAZIOS);
            }}
          >
            Limpar filtros
          </TkButton>
        </div>
      )}
    </div>
  );
}
