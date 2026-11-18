import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useBuscaProcessos, useProcessosPorIds } from "../hooks";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

export function ProcessoPicker({ value, onChange, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo), 250);
    return () => clearTimeout(t);
  }, [termo]);

  const { data: resultados = [], isFetching } = useBuscaProcessos(debounced, aberto);
  const { data: atual } = useProcessosPorIds(value ? [value] : []);
  const selecionado = atual?.find((p) => p.id === value);

  const rotulo = selecionado
    ? `${selecionado.numero_processo ?? "Sem número"} — ${selecionado.objeto}`
    : value
      ? "Processo vinculado"
      : "Vincular processo importado";

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="min-w-0 flex-1 justify-start font-normal"
          >
            <Search className="size-4 shrink-0 opacity-60" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>{rotulo}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <div className="border-b border-border/60 p-2">
              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar por nº do processo ou objeto…"
                aria-label="Buscar processo"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <CommandList>
              <CommandEmpty>{isFetching ? "Buscando…" : "Nenhum processo encontrado."}</CommandEmpty>
              <CommandGroup>
                {resultados.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onChange(p.id);
                      setAberto(false);
                    }}
                  >
                    <Check className={cn("mr-2 size-4", value === p.id ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {p.numero_processo ?? "Sem número"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{p.objeto}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <>
          <Button asChild type="button" size="icon" variant="ghost" className="size-9" title="Abrir processo">
            <Link to="/processos/$id" params={{ id: value }} aria-label="Abrir processo">
              <ExternalLink className="size-4" />
            </Link>
          </Button>
          {!disabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9"
              aria-label="Remover vínculo"
              onClick={() => onChange(null)}
            >
              <X className="size-4" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
