import { useState } from "react";
import { ClipboardCopy, FileSpreadsheet, FileText, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notify";
import {
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  montarRelatorio,
  relatorioTexto,
  type ContextoRelatorio,
} from "../relatorio";

type Props = {
  contexto: ContextoRelatorio;
  desabilitado?: boolean;
};

export function RelatorioMenu({ contexto, desabilitado }: Props) {
  const [gerando, setGerando] = useState<"pdf" | "xlsx" | null>(null);

  async function executar(tipo: "pdf" | "xlsx" | "texto") {
    const grupos = montarRelatorio(contexto);
    if (grupos.every((g) => g.linhas.length === 0)) {
      notify.info("Nenhuma tarefa para o relatório com os filtros atuais");
      return;
    }
    try {
      if (tipo === "texto") {
        const texto = relatorioTexto(grupos, contexto.filtrosDescricao);
        await navigator.clipboard.writeText(texto);
        notify.success("Resumo copiado", {
          description: "Cole no WhatsApp ou e-mail.",
        });
        return;
      }
      setGerando(tipo);
      if (tipo === "pdf") await exportarRelatorioPdf(grupos, contexto.filtrosDescricao);
      else await exportarRelatorioExcel(grupos, contexto.filtrosDescricao);
    } catch (e) {
      notify.error("Não foi possível gerar o relatório", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGerando(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={desabilitado || gerando !== null}>
          {gerando ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Relatório
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Respeita os filtros atuais
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void executar("pdf")}>
          <FileText className="size-4" /> PDF por etapa
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void executar("xlsx")}>
          <FileSpreadsheet className="size-4" /> Excel por etapa
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void executar("texto")}>
          <ClipboardCopy className="size-4" /> Copiar texto (WhatsApp)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
