import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { COR_PADRAO, CORES_SUGERIDAS, corValida, type Etapa } from "../lib";

type Props = {
  aberto: boolean;
  etapa: Etapa | null;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (v: { id?: string; nome: string; cor: string; finaliza: boolean }) => void;
};

export function EtapaDialog({ aberto, etapa, salvando, onFechar, onSalvar }: Props) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [finaliza, setFinaliza] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(etapa?.nome ?? "");
    setCor(corValida(etapa?.cor ?? COR_PADRAO));
    setFinaliza(etapa?.finaliza ?? false);
  }, [aberto, etapa]);

  const nomeValido = nome.trim().length >= 1 && nome.trim().length <= 60;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{etapa ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          <DialogDescription>
            Nome e cor aparecem no quadro e no relatório de andamento.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nomeValido) return;
            onSalvar({ id: etapa?.id, nome: nome.trim(), cor, finaliza });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="etapa-nome">Nome</Label>
            <Input
              id="etapa-nome"
              value={nome}
              maxLength={60}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap items-center gap-2">
              {CORES_SUGERIDAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  aria-label={`Cor ${c}`}
                  aria-pressed={cor.toLowerCase() === c}
                  className={cn(
                    "size-7 rounded-full border-2 border-transparent",
                    cor.toLowerCase() === c && "border-foreground",
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                aria-label="Cor personalizada"
                className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
            <div>
              <Label htmlFor="etapa-finaliza">Etapa final</Label>
              <p className="text-xs text-muted-foreground">
                Tarefas aqui são tratadas como concluídas no relatório.
              </p>
            </div>
            <Switch id="etapa-finaliza" checked={finaliza} onCheckedChange={setFinaliza} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!nomeValido || salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
