import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SecretariaOption = { id: string; label: string };

type Props = {
  options: SecretariaOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Limita quantos chips são exibidos antes de resumir ("+N"). */
  maxChips?: number;
  id?: string;
  /** Classes extras para o gatilho, o popover e os itens (tema da tela). */
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
};

export function SecretariasMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecionar secretarias",
  disabled,
  maxChips = 3,
  id,
  triggerClassName,
  contentClassName,
  itemClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o.label])),
    [options],
  );

  function toggle(optionId: string) {
    onChange(
      selected.has(optionId)
        ? value.filter((v) => v !== optionId)
        : [...value, optionId],
    );
  }

  const visible = value.slice(0, maxChips);
  const extra = value.length - visible.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal",
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {value.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {visible.map((sid) => (
              <Badge key={sid} variant="secondary" className="gap-1">
                <span className="max-w-[10rem] truncate">
                  {byId.get(sid) ?? "?"}
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Remover"
                  className="cursor-pointer opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(sid);
                  }}
                >
                  <X className="size-3" />
                </span>
              </Badge>
            ))}
            {extra > 0 && <Badge variant="outline">+{extra}</Badge>}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-(--radix-popover-trigger-width) p-0", contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar secretaria…" />
          <CommandList>
            <CommandEmpty>Nenhuma secretaria encontrada.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  className={itemClassName}
                  onSelect={() => toggle(o.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      selected.has(o.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
