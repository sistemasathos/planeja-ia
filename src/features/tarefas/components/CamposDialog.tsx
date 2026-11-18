import { useEffect, useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { useArquivarCampo, useSalvarCampo } from "../hooks";
import { CAMPO_TIPOS, type Campo, type CampoTipo, type Etapa } from "../lib";

type Props = {
  etapa: Etapa | null;
  campos: Campo[];
  onFechar: () => void;
};

type Rascunho = {
  id?: string;
  nome: string;
  tipo: CampoTipo;
  opcoesTexto: string;
  usa_como_fase: boolean;
};

const NOVO: Rascunho = { nome: "", tipo: "texto", opcoesTexto: "", usa_como_fase: false };

function parseOpcoes(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const linha of texto.split("\n")) {
    const v = linha.trim().slice(0, 80);
    if (v && !vistos.has(v.toLowerCase())) {
      vistos.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, 50);
}

export function CamposDialog({ etapa, campos, onFechar }: Props) {
  const salvar = useSalvarCampo();
  const arquivar = useArquivarCampo();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  useEffect(() => {
    setRascunho(null);
  }, [etapa?.id]);

  const doEtapa = etapa ? campos.filter((c) => c.etapa_id === etapa.id && !c.arquivado) : [];

  async function confirmar() {
    if (!etapa || !rascunho) return;
    const nome = rascunho.nome.trim();
    if (!nome) return;
    const opcoes = parseOpcoes(rascunho.opcoesTexto);
    if (rascunho.tipo === "lista" && opcoes.length === 0) {
      notify.error("Informe ao menos uma opção para a lista");
      return;
    }
    try {
      await salvar.mutateAsync({
        id: rascunho.id,
        etapa_id: etapa.id,
        nome,
        tipo: rascunho.tipo,
        opcoes,
        usa_como_fase: rascunho.usa_como_fase,
        posicao: doEtapa.length,
      });
      setRascunho(null);
    } catch (e) {
      notify.error("Não foi possível salvar o campo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function remover(c: Campo) {
    const ok = await notify.confirmAsync(
      `Arquivar o campo "${c.nome}"? Os valores já preenchidos são mantidos.`,
      { confirmLabel: "Arquivar" },
    );
    if (!ok) return;
    try {
      await arquivar.mutateAsync({ id: c.id, arquivado: true });
    } catch (e) {
      notify.error("Não foi possível arquivar o campo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <Dialog open={Boolean(etapa)} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Campos da etapa {etapa?.nome}</DialogTitle>
          <DialogDescription>
            Campos próprios desta etapa (ex.: nº da cotação, data do certame, fase do
            julgamento).
          </DialogDescription>
        </DialogHeader>

        {rascunho ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="campo-nome">Nome do campo</Label>
              <Input
                id="campo-nome"
                autoFocus
                maxLength={60}
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={rascunho.tipo}
                onValueChange={(v) => setRascunho({ ...rascunho, tipo: v as CampoTipo })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPO_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rascunho.tipo === "lista" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="campo-opcoes">Opções (uma por linha)</Label>
                  <Textarea
                    id="campo-opcoes"
                    rows={5}
                    value={rascunho.opcoesTexto}
                    onChange={(e) =>
                      setRascunho({ ...rascunho, opcoesTexto: e.target.value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={rascunho.usa_como_fase}
                    onCheckedChange={(v) =>
                      setRascunho({ ...rascunho, usa_como_fase: v === true })
                    }
                  />
                  Usar como fase (destaque no card e agrupamento no relatório)
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRascunho(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={!rascunho.nome.trim() || salvar.isPending}>
                Salvar campo
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {doEtapa.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum campo nesta etapa.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {doEtapa.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                    <Badge variant="outline" className="font-normal">
                      {CAMPO_TIPOS.find((t) => t.value === c.tipo)?.label}
                    </Badge>
                    {c.usa_como_fase && <Badge variant="secondary">Fase</Badge>}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Editar campo ${c.nome}`}
                      onClick={() =>
                        setRascunho({
                          id: c.id,
                          nome: c.nome,
                          tipo: c.tipo,
                          opcoesTexto: c.opcoes.join("\n"),
                          usa_como_fase: c.usa_como_fase,
                        })
                      }
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Arquivar campo ${c.nome}`}
                      onClick={() => void remover(c)}
                    >
                      <Archive className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" size="sm" onClick={() => setRascunho(NOVO)}>
              <Plus className="size-4" /> Novo campo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
