import {
  SITUACOES,
  corTextoSobre,
  corValida,
  diasDesde,
  formatarData,
  formatarValorCampo,
  rgbDe,
  type Campo,
  type Etapa,
  type Tarefa,
} from "./lib";

export type ContextoRelatorio = {
  etapas: Etapa[];
  tarefas: Tarefa[];
  campos: Campo[];
  siglas: Map<string, string>;
  equipe: Map<string, string>;
  /** processo_id → nº do processo */
  processos: Map<string, string>;
  /** Descrição dos filtros ativos, impressa no cabeçalho. */
  filtrosDescricao: string;
};

export type LinhaRelatorio = {
  id: string;
  titulo: string;
  secretarias: string;
  modalidade: string;
  tipo: string;
  responsavel: string;
  situacao: string;
  processo: string;
  fase: string;
  dias: number;
  criada: string;
  extras: { nome: string; valor: string }[];
  observacao: string;
};

export type GrupoRelatorio = {
  etapa: Etapa;
  indice: number;
  cor: string;
  corTexto: string;
  linhas: LinhaRelatorio[];
  resumo: Record<"ok" | "atencao" | "travada", number>;
};

function rotuloSecretarias(t: Tarefa, siglas: Map<string, string>): string {
  if (t.todas_secretarias) return "Todas";
  const lista = t.secretaria_ids.map((id) => siglas.get(id) ?? "?");
  if (lista.length === 0) return "—";
  if (lista.length <= 4) return lista.join(", ");
  return `Diversas (${lista.length})`;
}

export function montarRelatorio(ctx: ContextoRelatorio): GrupoRelatorio[] {
  const camposPorEtapa = new Map<string, Campo[]>();
  for (const c of ctx.campos) {
    if (c.arquivado) continue;
    const l = camposPorEtapa.get(c.etapa_id) ?? [];
    l.push(c);
    camposPorEtapa.set(c.etapa_id, l);
  }

  return ctx.etapas
    .filter((e) => !e.arquivada)
    .map((etapa, i) => {
      const campos = camposPorEtapa.get(etapa.id) ?? [];
      const tarefas = ctx.tarefas
        .filter((t) => t.etapa_id === etapa.id)
        .sort((a, b) => a.posicao - b.posicao);
      const resumo = { ok: 0, atencao: 0, travada: 0 };
      const linhas = tarefas.map<LinhaRelatorio>((t) => {
        resumo[t.situacao] += 1;
        const fase = campos.find((c) => c.usa_como_fase);
        return {
          id: t.id,
          titulo: t.titulo,
          secretarias: rotuloSecretarias(t, ctx.siglas),
          modalidade: t.modalidade ?? "",
          tipo: t.tipo ?? "",
          responsavel: t.responsavel_id ? (ctx.equipe.get(t.responsavel_id) ?? "") : "",
          situacao: SITUACOES.find((s) => s.value === t.situacao)?.label ?? "",
          processo: t.processo_id ? (ctx.processos.get(t.processo_id) ?? "") : "",
          fase: fase ? (t.campos[fase.id] ?? "") : "",
          dias: diasDesde(t.etapa_desde),
          criada: formatarData(t.created_at),
          extras: campos
            .filter((c) => !c.usa_como_fase && t.campos[c.id]?.trim())
            .map((c) => ({ nome: c.nome, valor: formatarValorCampo(c, t.campos[c.id]) })),
          observacao: (t.observacao ?? "").trim(),
        };
      });
      const cor = corValida(etapa.cor);
      return {
        etapa,
        indice: i + 1,
        cor,
        corTexto: corTextoSobre(cor),
        linhas,
        resumo,
      };
    });
}

function nomeArquivo(ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `andamento-tarefas-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${ext}`;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function titulo(): string {
  return `Relatório de andamento — ${new Date().toLocaleDateString("pt-BR")}`;
}

/* ---------------------------------- Texto ----------------------------------- */

export function relatorioTexto(grupos: GrupoRelatorio[], filtros: string): string {
  const total = grupos.reduce((s, g) => s + g.linhas.length, 0);
  const out: string[] = [`*${titulo()}*`];
  if (filtros) out.push(`_Filtros: ${filtros}_`);
  out.push(`Total: ${total} tarefa(s)`, "");
  for (const g of grupos) {
    if (g.linhas.length === 0) continue;
    out.push(`*${g.indice}. ${g.etapa.nome.toUpperCase()}* (${g.linhas.length})`);
    for (const l of g.linhas) {
      const partes = [l.secretarias, l.fase, l.processo].filter(Boolean).join(" · ");
      const alerta = l.situacao && l.situacao !== "Em dia" ? ` [${l.situacao.toUpperCase()}]` : "";
      out.push(`• ${l.titulo}${partes ? ` — ${partes}` : ""}${alerta}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/* ------------------------------------ PDF ----------------------------------- */

export async function exportarRelatorioPdf(
  grupos: GrupoRelatorio[],
  filtros: string,
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 36;
  const largura = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titulo(), margem, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (filtros) doc.text(`Filtros: ${filtros}`, margem, 56, { maxWidth: largura - margem * 2 });

  // Resumo por etapa
  autoTable(doc, {
    startY: filtros ? 68 : 56,
    margin: { left: margem, right: margem },
    head: [["#", "Etapa", "Tarefas", "Em dia", "Atenção", "Travadas"]],
    body: grupos.map((g) => [
      String(g.indice),
      g.etapa.nome,
      String(g.linhas.length),
      String(g.resumo.ok),
      String(g.resumo.atencao),
      String(g.resumo.travada),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [55, 65, 81] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index <= 1) {
        const g = grupos[data.row.index];
        if (g) {
          data.cell.styles.fillColor = rgbDe(g.cor);
          data.cell.styles.textColor = rgbDe(g.corTexto);
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  for (const g of grupos) {
    if (g.linhas.length === 0) continue;
    const ultimo = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    let y = (ultimo?.finalY ?? 60) + 22;
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = 40;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: margem, right: margem },
      head: [
        [
          {
            content: `${g.indice}. ${g.etapa.nome.toUpperCase()} — ${g.linhas.length} tarefa(s)`,
            colSpan: 8,
            styles: {
              fillColor: rgbDe(g.cor),
              textColor: rgbDe(g.corTexto),
              fontSize: 10,
              fontStyle: "bold",
            },
          },
        ],
        ["Tarefa", "Secretaria(s)", "Modalidade", "Processo", "Fase", "Responsável", "Situação", "Dias"],
      ],
      body: g.linhas.map((l) => [
        l.extras.length
          ? `${l.titulo}\n${l.extras.map((x) => `${x.nome}: ${x.valor}`).join(" | ")}`
          : l.titulo,
        l.secretarias,
        l.modalidade,
        l.processo,
        l.fase,
        l.responsavel,
        l.situacao,
        String(l.dias),
      ]),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 220 }, 7: { halign: "right", cellWidth: 36 } },
      // Linha 2 do cabeçalho em cinza neutro (legível em P&B).
      didParseCell: (data) => {
        if (data.section === "head" && data.row.index === 1) {
          data.cell.styles.fillColor = [229, 231, 235];
          data.cell.styles.textColor = [17, 24, 39];
          data.cell.styles.fontSize = 8;
        }
      },
    });
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${paginas}`, largura - margem, doc.internal.pageSize.getHeight() - 18, {
      align: "right",
    });
  }

  baixar(doc.output("blob"), nomeArquivo("pdf"));
}

/* ----------------------------------- Excel ---------------------------------- */

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

export async function exportarRelatorioExcel(
  grupos: GrupoRelatorio[],
  filtros: string,
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Planeja IA";
  wb.created = new Date();

  const ws = wb.addWorksheet("Andamento", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const cols = [
    { header: "Tarefa", width: 48 },
    { header: "Secretaria(s)", width: 22 },
    { header: "Modalidade", width: 20 },
    { header: "Tipo", width: 16 },
    { header: "Processo", width: 18 },
    { header: "Fase", width: 20 },
    { header: "Responsável", width: 20 },
    { header: "Situação", width: 12 },
    { header: "Dias na etapa", width: 13 },
    { header: "Criada em", width: 12 },
    { header: "Campos da etapa", width: 40 },
    { header: "Observações", width: 50 },
  ];
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = titulo();
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  if (filtros) {
    ws.mergeCells(2, 1, 2, cols.length);
    ws.getCell(2, 1).value = `Filtros: ${filtros}`;
    ws.getCell(2, 1).font = { italic: true, size: 10 };
  }

  let linha = filtros ? 4 : 3;
  const borda = { style: "thin" as const, color: { argb: "FFD1D5DB" } };

  for (const g of grupos) {
    if (g.linhas.length === 0) continue;
    ws.mergeCells(linha, 1, linha, cols.length);
    const banner = ws.getCell(linha, 1);
    banner.value = `${g.indice}. ${g.etapa.nome.toUpperCase()} — ${g.linhas.length} tarefa(s)`;
    banner.font = { bold: true, size: 12, color: { argb: argb(g.corTexto) } };
    banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(g.cor) } };
    banner.alignment = { vertical: "middle" };
    ws.getRow(linha).height = 22;
    linha++;

    const cab = ws.getRow(linha);
    cols.forEach((c, i) => {
      const cell = cab.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      cell.border = { top: borda, bottom: borda, left: borda, right: borda };
    });
    linha++;

    for (const l of g.linhas) {
      const row = ws.getRow(linha);
      const valores: (string | number)[] = [
        l.titulo,
        l.secretarias,
        l.modalidade,
        l.tipo,
        l.processo,
        l.fase,
        l.responsavel,
        l.situacao,
        l.dias,
        l.criada,
        l.extras.map((x) => `${x.nome}: ${x.valor}`).join(" | "),
        l.observacao,
      ];
      valores.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        // Strings são gravadas como texto (shared strings), nunca como fórmula.
        cell.value = v;
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { top: borda, bottom: borda, left: borda, right: borda };
      });
      // Barra de cor da etapa na primeira coluna (mantém leitura em P&B pelo texto).
      row.getCell(1).border = {
        ...row.getCell(1).border,
        left: { style: "thick", color: { argb: argb(g.cor) } },
      };
      linha++;
    }
    linha++;
  }

  ws.views = [{ state: "frozen", ySplit: filtros ? 3 : 2 }];

  const buffer = await wb.xlsx.writeBuffer();
  baixar(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomeArquivo("xlsx"),
  );
}
