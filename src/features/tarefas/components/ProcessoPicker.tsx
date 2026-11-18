import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ExternalLink, Loader2, Search, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useBuscaProcessos, useProcessosPorIds } from "../hooks";
import { TkTooltip, tkButton, tkInput, tkMenu, tkMenuItem, tkSelect } from "./ui";

type Props = {
  id?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

export function ProcessoPicker({ id, value, onChange, disabled }: Props) {
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
  const numero = selecionado?.numero_processo || "Sem número";
  const dica = selecionado
    ? `${numero} — ${selecionado.objeto}`
    : value
      ? "Processo vinculado"
      : "Vincular processo importado";
  // Área reservada à direita para os atalhos (abrir / remover).
  const reserva = value ? (disabled ? "pr-12" : "pr-[5.25rem]") : "pr-10";

  return (
    <div className="relative min-w-0">
      <Popover open={aberto} onOpenChange={setAberto}>
        <TkTooltip label={dica}>
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              disabled={disabled}
              aria-label={value ? `Processo vinculado: ${dica}. Alterar` : "Vincular processo importado"}
              className={cn(tkSelect, "flex items-center text-left", reserva)}
            >
              <Search className="size-4 shrink-0 text-(--tk-text-3)" aria-hidden />
              {selecionado ? (
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 font-semibold tabular-nums text-(--tk-text)">{numero}</span>
                  <span className="truncate text-(--tk-text-2)">{selecionado.objeto}</span>
                </span>
              ) : (
                <span className={cn("min-w-0 flex-1 truncate", value ? "text-(--tk-text)" : "text-(--tk-text-3)")}>
                  {value ? "Processo vinculado" : "Vincular processo importado"}
                </span>
              )}
              {!value && <ChevronDown className="size-4 shrink-0 text-(--tk-text-3)" aria-hidden />}
            </button>
          </PopoverTrigger>
        </TkTooltip>
        <PopoverContent
          align="start"
          className={cn(tkMenu, "w-(--radix-popover-trigger-width) min-w-72 p-0")}
        >
          <Command shouldFilter={false} className="bg-transparent">
            <div className="border-b border-(--tk-border) p-2">
              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar por número ou objeto do processo..."
                aria-label="Buscar processo"
                className={cn(tkInput, "h-10")}
              />
            </div>
            <CommandList className="tk-scroll max-h-72 p-1.5">
              <CommandEmpty className="flex items-center justify-center gap-2 py-6 text-[13px] text-(--tk-text-2)">
                {isFetching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Buscando processos...
                  </>
                ) : (
                  "Nenhum processo encontrado."
                )}
              </CommandEmpty>
              <CommandGroup className="p-0">
                {resultados.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    className={cn(tkMenuItem, "items-start")}
                    onSelect={() => {
                      onChange(p.id);
                      setAberto(false);
                    }}
                  >
                    <Check
                      className={cn("mt-0.5", value === p.id ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold tabular-nums">
                        {p.numero_processo || "Sem número"}
                      </span>
                      <span className="block truncate text-[12.5px] text-(--tk-text-2)">{p.objeto}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          <TkTooltip label="Abrir processo">
            <Link
              to="/processos/$id"
              params={{ id: value }}
              aria-label="Abrir processo"
              className={tkButton({ variant: "tertiary", size: "iconSm" })}
            >
              <ExternalLink />
            </Link>
          </TkTooltip>
          {!disabled && (
            <TkTooltip label="Remover vínculo">
              <button
                type="button"
                aria-label="Remover vínculo com o processo"
                onClick={() => onChange(null)}
                className={tkButton({ variant: "tertiary", size: "iconSm" })}
              >
                <X />
              </button>
            </TkTooltip>
          )}
        </div>
      )}
    </div>
  );
}
