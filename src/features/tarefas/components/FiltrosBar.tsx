import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FILTROS_VAZIOS,
  SITUACOES,
  filtrosAtivos,
  type FiltrosTarefas,
  type MembroEquipe,
} from "../lib";

const TODOS = "__todos__";

type Props = {
  filtros: FiltrosTarefas;
  onChange: (f: FiltrosTarefas) => void;
  modalidades: string[];
  tipos: string[];
  secretarias: { id: string; label: string }[];
  equipe: MembroEquipe[];
};

function FiltroSelect({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { value: string; label: string }[];
}) {
  return (
    <Select value={valor || TODOS} onValueChange={(v) => onChange(v === TODOS ? "" : v)}>
      <SelectTrigger className="h-9 w-[150px]" aria-label={rotulo}>
        <SelectValue placeholder={rotulo} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{rotulo}: todos</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FiltrosBar({ filtros, onChange, modalidades, tipos, secretarias, equipe }: Props) {
  // Busca com debounce: o input é local e só vai para a URL após uma pausa.
  const [q, setQ] = useState(filtros.q);
  useEffect(() => setQ(filtros.q), [filtros.q]);
  useEffect(() => {
    if (q === filtros.q) return;
    const t = setTimeout(() => onChange({ ...filtros, q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const ativos = filtrosAtivos(filtros);
  const set = (k: keyof FiltrosTarefas) => (v: string) => onChange({ ...filtros, [k]: v });

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filtros de tarefas">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar tarefa, nº processo…"
          className="h-9 pl-8"
          maxLength={80}
          aria-label="Buscar tarefas"
        />
      </div>
      <FiltroSelect
        rotulo="Modalidade"
        valor={filtros.modalidade}
        onChange={set("modalidade")}
        opcoes={modalidades.map((m) => ({ value: m, label: m }))}
      />
      <FiltroSelect
        rotulo="Tipo"
        valor={filtros.tipo}
        onChange={set("tipo")}
        opcoes={tipos.map((m) => ({ value: m, label: m }))}
      />
      <FiltroSelect
        rotulo="Secretaria"
        valor={filtros.secretaria}
        onChange={set("secretaria")}
        opcoes={secretarias.map((s) => ({ value: s.id, label: s.label }))}
      />
      <FiltroSelect
        rotulo="Responsável"
        valor={filtros.responsavel}
        onChange={set("responsavel")}
        opcoes={[
          { value: "__nenhum__", label: "Sem responsável" },
          ...equipe.map((m) => ({ value: m.id, label: m.nome })),
        ]}
      />
      <FiltroSelect
        rotulo="Situação"
        valor={filtros.situacao}
        onChange={set("situacao")}
        opcoes={SITUACOES.map((s) => ({ value: s.value, label: s.label }))}
      />
      {ativos > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(FILTROS_VAZIOS)}>
          <X className="size-4" /> Limpar ({ativos})
        </Button>
      )}
    </div>
  );
}
