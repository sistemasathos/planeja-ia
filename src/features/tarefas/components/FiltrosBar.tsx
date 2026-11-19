import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  ChevronsUpDown,
  Gavel,
  Search,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FILTROS_VAZIOS,
  SITUACOES,
  type CriterioFiltro,
  type FiltrosTarefas,
  type MembroEquipe,
  type Situacao,
} from "../lib";
import { SituacaoOpcao, TkButton, TkTooltip, tkInput } from "./ui";

type Opcao = { value: string; label: string };

type Props = {
  filtros: FiltrosTarefas;
  onChange: (f: FiltrosTarefas) => void;
  criterios: CriterioFiltro[];
  resultado: { exibidas: number; total: number };
  modalidades: string[];
  tipos: string[];
  secretarias: { id: string; label: string }[];
  equipe: MembroEquipe[];
  lista: boolean;
  onLista: (lista: boolean) => void;
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function FiltroMulti({
  rotulo,
  icon: Icon,
  valor,
  onChange,
  opcoes,
  renderOpcao,
}: {
  rotulo: string;
  icon: LucideIcon;
  valor: string[];
  onChange: (v: string[]) => void;
  opcoes: Opcao[];
  renderOpcao?: (o: Opcao) => React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ativo = valor.length > 0;
  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return opcoes;
    return opcoes.filter((o) => semAcento(o.label).includes(q));
  }, [busca, opcoes]);
  const texto =
    valor.length === 0
      ? rotulo
      : valor.length === 1
        ? (opcoes.find((o) => o.value === valor[0])?.label ?? rotulo)
        : `${rotulo} (${valor.length})`;

  function alternar(id: string) {
    onChange(valor.includes(id) ? valor.filter((v) => v !== id) : [...valor, id]);
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o);
        if (!o) setBusca("");
      }}
    >
      <TkTooltip label={ativo ? `${rotulo}: ${texto}` : `Filtrar por ${rotulo.toLowerCase()}`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Filtrar por ${rotulo.toLowerCase()}`}
            className={cn(
              "inline-flex h-11 min-w-0 cursor-pointer items-center gap-2 rounded-(--tk-radius-control) border border-(--tk-border-strong) bg-(--tk-input) px-3 text-left text-[14px] text-(--tk-text)",
              "@min-[68rem]:w-auto @min-[68rem]:max-w-[220px] @min-[68rem]:flex-[1_1_auto]",
              ativo && "border-(--tk-accent)/60 bg-(--tk-accent-soft)",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", ativo ? "text-(--tk-accent)" : "text-(--tk-text-3)")}
              aria-hidden
            />
            <span className={cn("min-w-0 flex-1 truncate", ativo ? "font-medium" : "text-(--tk-text-2)")}>
              {texto}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-(--tk-text-3)" aria-hidden />
          </button>
        </PopoverTrigger>
      </TkTooltip>
      <PopoverContent
        align="start"
        className="w-[min(100vw-2rem,280px)] border-(--tk-border-strong) bg-(--tk-panel) p-2 text-(--tk-text)"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-(--tk-text-3)" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${rotulo.toLowerCase()}`}
            aria-label={`Buscar ${rotulo.toLowerCase()}`}
            className={cn(tkInput, "h-9 pl-8")}
          />
        </div>
        <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable="true">
          {visiveis.length === 0 ? (
            <li className="px-2 py-3 text-center text-[13px] text-(--tk-text-2)">Nenhum resultado</li>
          ) : (
            visiveis.map((o) => {
              const marcado = valor.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    onClick={() => alternar(o.value)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-(--tk-neutral-bg)"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        marcado
                          ? "border-(--tk-accent) bg-(--tk-accent) text-(--tk-accent-fg)"
                          : "border-(--tk-border-strong)",
                      )}
                    >
                      {marcado && <Check className="size-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 truncate">{renderOpcao ? renderOpcao(o) : o.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {ativo && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-[13px] text-(--tk-text-2) hover:bg-(--tk-neutral-bg)"
          >
            Limpar {rotulo.toLowerCase()}
          </button>
        )}
      </PopoverContent>
    </Popover>
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
  lista,
  onLista,
}: Props) {
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

  function setLista(chave: "modalidade" | "tipo" | "secretaria" | "responsavel" | "situacao") {
    return (valor: string[]) => onChange({ ...filtros, [chave]: valor });
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-2">
      <div
        className="flex min-w-0 flex-col gap-2 @min-[68rem]:flex-row @min-[68rem]:items-center"
        role="search"
        aria-label="Filtros do acompanhamento"
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
            placeholder="Buscar título, número ou objeto do processo..."
            className={cn(
              tkInput,
              "pl-10 [&::-webkit-search-cancel-button]:appearance-none",
              q ? "pr-10" : "pr-3",
            )}
            maxLength={80}
            aria-label="Buscar título, número ou objeto do processo"
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
          <FiltroMulti
            rotulo="Modalidade"
            icon={Gavel}
            valor={filtros.modalidade}
            onChange={setLista("modalidade")}
            opcoes={modalidades.map((m) => ({ value: m, label: m }))}
          />
          <FiltroMulti
            rotulo="Tipo"
            icon={Tag}
            valor={filtros.tipo}
            onChange={setLista("tipo")}
            opcoes={tipos.map((m) => ({ value: m, label: m }))}
          />
          <FiltroMulti
            rotulo="Secretaria"
            icon={Building2}
            valor={filtros.secretaria}
            onChange={setLista("secretaria")}
            opcoes={secretarias.map((s) => ({ value: s.id, label: s.label }))}
          />
          <FiltroMulti
            rotulo="Responsável"
            icon={UserRound}
            valor={filtros.responsavel}
            onChange={setLista("responsavel")}
            opcoes={[
              { value: "__nenhum__", label: "Sem responsável" },
              ...equipe.map((m) => ({ value: m.id, label: m.nome })),
            ]}
          />
          <FiltroMulti
            rotulo="Situação"
            icon={Activity}
            valor={filtros.situacao}
            onChange={setLista("situacao")}
            opcoes={SITUACOES.map((s) => ({ value: s.value, label: s.label }))}
            renderOpcao={(o) => <SituacaoOpcao situacao={o.value as Situacao} />}
          />
        </div>
        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-(--tk-radius-control) border border-(--tk-border-strong) bg-(--tk-card) px-3 text-[14px] text-(--tk-text)">
          <span>Lista</span>
          <Switch checked={lista} onCheckedChange={onLista} aria-label="Visualização em lista" />
        </label>
      </div>

      {criterios.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-[13px] text-(--tk-text-2)">
            Exibindo {resultado.exibidas} de {resultado.total}
          </span>
          <span className="h-4 w-px bg-(--tk-border-strong)" aria-hidden />
          {criterios.map((c) => (
            <span
              key={`${c.chave}-${c.item ?? c.valor}`}
              className="inline-flex h-8 min-w-0 max-w-[280px] items-center gap-1 rounded-full border border-(--tk-border-strong) bg-(--tk-card) pl-3 pr-1 text-[13px]"
            >
              <span className="shrink-0 text-(--tk-text-2)">{c.rotulo}:</span>
              <span className="truncate font-medium text-(--tk-text)" title={c.valor}>
                {c.valor}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (c.chave === "q") {
                    setQ("");
                    onChange({ ...filtros, q: "" });
                    return;
                  }
                  const atual = filtros[c.chave];
                  if (!Array.isArray(atual) || !c.item) return;
                  onChange({ ...filtros, [c.chave]: atual.filter((v) => v !== c.item) });
                }}
                aria-label={`Remover filtro ${c.rotulo} ${c.valor}`}
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
