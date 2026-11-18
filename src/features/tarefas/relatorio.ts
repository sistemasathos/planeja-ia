import type { Font } from "exceljs";
import {
  SITUACOES,
  corValida,
  diasDesde,
  formatarData,
  formatarValorCampo,
  rgbDe,
  type Campo,
  type CriterioFiltro,
  type Etapa,
  type ProcessoResumo,
  type Situacao,
  type Tarefa,
} from "./lib";

export type ContextoRelatorio = {
  etapas: Etapa[];
  tarefas: Tarefa[];
  campos: Campo[];
  siglas: Map<string, string>;
  equipe: Map<string, string>;
  processos: Map<string, ProcessoResumo>;
  /** Somente os critérios efetivamente aplicados no quadro. */
  criterios: CriterioFiltro[];
};

export type LinhaRelatorio = {
  id: string;
  item: number;
  titulo: string;
  etapa: string;
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
  linhas: LinhaRelatorio[];
  resumo: Record<Situacao, number>;
};

export type IndicadoresRelatorio = {
  total: number;
  emAndamento: number;
  concluidas: number;
  emAtencao: number;
  travadas: number;
};

export type Relatorio = {
  grupos: GrupoRelatorio[];
  indicadores: IndicadoresRelatorio;
  criterios: CriterioFiltro[];
  emitidoEm: Date;
};

const TITULO = "Relatório de andamento das tarefas";
const SUBTITULO = "Acompanhamento das atividades da equipe, organizado por etapa.";

/** Identificação institucional opcional, configurada no build (não há valor padrão). */
function identificacao() {
  const env = import.meta.env as Record<string, string | undefined>;
  const limpar = (v: string | undefined) => (v ?? "").trim();
  return {
    orgao: limpar(env.VITE_RELATORIO_ORGAO),
    setor: limpar(env.VITE_RELATORIO_SETOR),
    logoUrl: limpar(env.VITE_RELATORIO_LOGO_URL),
  };
}

function rotuloSecretarias(t: Tarefa, siglas: Map<string, string>): string {
  if (t.todas_secretarias) return "Todas";
  const lista = t.secretaria_ids.map((id) => siglas.get(id) ?? "?");
  if (lista.length === 0) return "—";
  if (lista.length <= 4) return lista.join(", ");
  return `Diversas (${lista.length})`;
}

export function montarRelatorio(ctx: ContextoRelatorio): Relatorio {
  const camposPorEtapa = new Map<string, Campo[]>();
  for (const c of ctx.campos) {
    if (c.arquivado) continue;
    const l = camposPorEtapa.get(c.etapa_id) ?? [];
    l.push(c);
    camposPorEtapa.set(c.etapa_id, l);
  }

  let item = 0;
  const indicadores: IndicadoresRelatorio = {
    total: 0,
    emAndamento: 0,
    concluidas: 0,
    emAtencao: 0,
    travadas: 0,
  };

  const grupos = ctx.etapas
    .filter((e) => !e.arquivada)
    .map<GrupoRelatorio>((etapa, i) => {
      const campos = camposPorEtapa.get(etapa.id) ?? [];
      const fase = campos.find((c) => c.usa_como_fase);
      const tarefas = ctx.tarefas
        .filter((t) => t.etapa_id === etapa.id)
        .sort((a, b) => a.posicao - b.posicao);
      const resumo: Record<Situacao, number> = { ok: 0, atencao: 0, travada: 0 };
      const linhas = tarefas.map<LinhaRelatorio>((t) => {
        resumo[t.situacao] += 1;
        indicadores.total += 1;
        if (etapa.finaliza) indicadores.concluidas += 1;
        else indicadores.emAndamento += 1;
        if (t.situacao === "atencao") indicadores.emAtencao += 1;
        if (t.situacao === "travada") indicadores.travadas += 1;
        item += 1;
        return {
          id: t.id,
          item,
          titulo: t.titulo,
          etapa: etapa.nome,
          secretarias: rotuloSecretarias(t, ctx.siglas),
          modalidade: t.modalidade ?? "",
          tipo: t.tipo ?? "",
          responsavel: t.responsavel_id ? (ctx.equipe.get(t.responsavel_id) ?? "") : "",
          situacao: SITUACOES.find((s) => s.value === t.situacao)?.label ?? "",
          processo: t.processo_id ? (ctx.processos.get(t.processo_id)?.numero ?? "") : "",
          fase: fase ? (t.campos[fase.id] ?? "") : "",
          dias: diasDesde(t.etapa_desde),
          criada: formatarData(t.created_at),
          extras: campos
            .filter((c) => !c.usa_como_fase && t.campos[c.id]?.trim())
            .map((c) => ({ nome: c.nome, valor: formatarValorCampo(c, t.campos[c.id]) })),
          observacao: (t.observacao ?? "").trim(),
        };
      });
      return { etapa, indice: i + 1, cor: corValida(etapa.cor), linhas, resumo };
    });

  return { grupos, indicadores, criterios: ctx.criterios, emitidoEm: new Date() };
}

export function relatorioVazio(r: Relatorio): boolean {
  return r.indicadores.total === 0;
}

function emissao(d: Date): string {
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function criteriosTexto(criterios: CriterioFiltro[]): string {
  return criterios.map((c) => `${c.rotulo}: ${c.valor}`).join("; ");
}

function indicadoresLista(i: IndicadoresRelatorio): { rotulo: string; valor: number }[] {
  return [
    { rotulo: "Total de tarefas", valor: i.total },
    { rotulo: "Em andamento", valor: i.emAndamento },
    { rotulo: "Concluídas", valor: i.concluidas },
    { rotulo: "Em atenção", valor: i.emAtencao },
    { rotulo: "Travadas", valor: i.travadas },
  ];
}

function nomeArquivo(ext: string, d: Date): string {
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

/* ---------------------------------- Texto ----------------------------------- */

export function relatorioTexto(r: Relatorio): string {
  const { orgao, setor } = identificacao();
  const out: string[] = [];
  if (orgao) out.push(orgao);
  if (setor) out.push(setor);
  out.push(`*${TITULO}*`, `Emitido em ${emissao(r.emitidoEm)}`);
  if (r.criterios.length) out.push(`_Critérios: ${criteriosTexto(r.criterios)}_`);
  out.push(
    indicadoresLista(r.indicadores)
      .map((x) => `${x.rotulo}: ${x.valor}`)
      .join(" · "),
    "",
  );
  for (const g of r.grupos) {
    if (g.linhas.length === 0) continue;
    out.push(`*${g.indice}. ${g.etapa.nome}* (${g.linhas.length})`);
    for (const l of g.linhas) {
      const partes = [l.secretarias, l.fase, l.processo && `Processo ${l.processo}`]
        .filter(Boolean)
        .join(" · ");
      const alerta = l.situacao && l.situacao !== "Em dia" ? ` [${l.situacao}]` : "";
      out.push(`• ${l.titulo}${partes ? ` — ${partes}` : ""}${alerta}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/* ------------------------------------ PDF ----------------------------------- */

type Logo = { data: string; formato: "PNG" | "JPEG"; largura: number; altura: number };

async function carregarLogo(url: string): Promise<Logo | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const formato = blob.type === "image/png" ? "PNG" : blob.type === "image/jpeg" ? "JPEG" : null;
    if (!formato) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("logo"));
      img.src = data;
    });
    return { data, formato, largura: dims.w, altura: dims.h };
  } catch {
    return null;
  }
}

const CINZA_TEXTO: [number, number, number] = [31, 41, 55];
const CINZA_SECUNDARIO: [number, number, number] = [90, 99, 114];
const CINZA_LINHA: [number, number, number] = [209, 213, 219];
const CINZA_FUNDO: [number, number, number] = [243, 244, 246];

async function gerarPdf(r: Relatorio) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const { orgao, setor, logoUrl } = identificacao();
  const logo = await carregarLogo(logoUrl);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 40;
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const util = largura - margem * 2;
  const topoCorrido = 70; // área reservada ao cabeçalho das páginas seguintes
  const rodape = 44;
  const emitido = `Emitido em ${emissao(r.emitidoEm)}`;

  doc.setTextColor(...CINZA_TEXTO);

  /* Cabeçalho institucional (primeira página) */
  let x = margem;
  let y = margem;
  if (logo) {
    const h = 44;
    const w = Math.min(90, (logo.largura / logo.altura) * h);
    doc.addImage(logo.data, logo.formato, margem, y - 4, w, h);
    x = margem + w + 12;
  }
  if (orgao) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(orgao, x, y + 6, { maxWidth: util - (x - margem) - 160 });
    y += 15;
  }
  if (setor) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...CINZA_SECUNDARIO);
    doc.text(setor, x, y + 6, { maxWidth: util - (x - margem) - 160 });
    doc.setTextColor(...CINZA_TEXTO);
    y += 14;
  }
  y = Math.max(y + (orgao || setor ? 12 : 6), logo ? margem + 52 : 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(TITULO, margem, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_SECUNDARIO);
  doc.text(emitido, largura - margem, margem + 6, { align: "right" });
  doc.setFontSize(10);
  doc.text(SUBTITULO, margem, y + 15);
  y += 28;
  doc.setDrawColor(...CINZA_LINHA);
  doc.setLineWidth(0.75);
  doc.line(margem, y, largura - margem, y);
  y += 16;

  if (r.criterios.length) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...CINZA_TEXTO);
    doc.text("Critérios aplicados:", margem, y);
    doc.setFont("helvetica", "normal");
    const deslocamento = doc.getTextWidth("Critérios aplicados: ");
    const linhas = doc.splitTextToSize(criteriosTexto(r.criterios), util - deslocamento) as string[];
    doc.text(linhas, margem + deslocamento, y);
    y += linhas.length * 11 + 8;
  }

  /* Indicadores */
  const ind = indicadoresLista(r.indicadores);
  const gap = 10;
  const caixa = (util - gap * (ind.length - 1)) / ind.length;
  ind.forEach((it, i) => {
    const cx = margem + i * (caixa + gap);
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.75);
    doc.roundedRect(cx, y, caixa, 42, 4, 4, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA_SECUNDARIO);
    doc.text(it.rotulo, cx + 10, y + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(String(it.valor), cx + 10, y + 33);
  });
  y += 42 + 22;

  const estiloTabela = {
    theme: "grid" as const,
    margin: { left: margem, right: margem, top: topoCorrido, bottom: rodape + 6 },
    rowPageBreak: "avoid" as const,
    showHead: "everyPage" as const,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak" as const,
      valign: "top" as const,
      textColor: CINZA_TEXTO,
      lineColor: CINZA_LINHA,
      lineWidth: 0.5,
    },
    headStyles: { fillColor: CINZA_FUNDO, textColor: [17, 24, 39] as [number, number, number], fontStyle: "bold" as const },
  };

  /* Resumo por etapa */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...CINZA_TEXTO);
  doc.text("Resumo por etapa", margem, y);
  autoTable(doc, {
    ...estiloTabela,
    startY: y + 8,
    tableWidth: Math.min(util, 520),
    head: [["Etapa", "Tarefas", "Em dia", "Atenção", "Travadas"]],
    body: r.grupos.map((g) => [
      `${g.indice}. ${g.etapa.nome}${g.etapa.finaliza ? " (conclusão)" : ""}`,
      String(g.linhas.length),
      String(g.resumo.ok),
      String(g.resumo.atencao),
      String(g.resumo.travada),
    ]),
    columnStyles: {
      1: { halign: "right", cellWidth: 56 },
      2: { halign: "right", cellWidth: 56 },
      3: { halign: "right", cellWidth: 56 },
      4: { halign: "right", cellWidth: 56 },
    },
  });

  /* Tabelas por etapa */
  const ultimoY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  for (const g of r.grupos) {
    if (g.linhas.length === 0) continue;
    let gy = ultimoY() + 26;
    // Evita título de etapa isolado no fim da página.
    if (gy > altura - rodape - 90) {
      doc.addPage();
      gy = topoCorrido + 10;
    }
    doc.setFillColor(...rgbDe(g.cor));
    doc.rect(margem, gy - 8, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...CINZA_TEXTO);
    const tituloEtapa = `${g.indice}. ${g.etapa.nome}`;
    doc.text(tituloEtapa, margem + 14, gy);
    const larguraTitulo = doc.getTextWidth(tituloEtapa);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...CINZA_SECUNDARIO);
    doc.text(
      `${g.linhas.length} ${g.linhas.length === 1 ? "tarefa" : "tarefas"}`,
      margem + 14 + larguraTitulo + 8,
      gy,
    );

    autoTable(doc, {
      ...estiloTabela,
      startY: gy + 8,
      head: [
        ["Item", "Título", "Processo", "Situação", "Modalidade", "Tipo", "Secretaria", "Responsável", "Criada em"],
      ],
      body: g.linhas.map((l) => {
        const complemento = [l.fase && `Fase: ${l.fase}`, ...l.extras.map((x) => `${x.nome}: ${x.valor}`)]
          .filter(Boolean)
          .join(" | ");
        return [
          String(l.item),
          complemento ? `${l.titulo}\n${complemento}` : l.titulo,
          l.processo || "—",
          l.situacao,
          l.modalidade || "—",
          l.tipo || "—",
          l.secretarias,
          l.responsavel || "—",
          l.criada,
        ];
      }),
      columnStyles: {
        0: { halign: "right", cellWidth: 30 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 78 },
        3: { cellWidth: 54 },
        4: { cellWidth: 82 },
        5: { cellWidth: 66 },
        6: { cellWidth: 84 },
        7: { cellWidth: 92 },
        8: { cellWidth: 54 },
      },
    });
  }

  /* Cabeçalho corrido e rodapé em todas as páginas */
  const paginas = doc.getNumberOfPages();
  const identificacaoCurta = [orgao, setor].filter(Boolean).join(" · ");
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...CINZA_TEXTO);
      doc.text(TITULO, margem, margem);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...CINZA_SECUNDARIO);
      if (identificacaoCurta) doc.text(identificacaoCurta, margem, margem + 12, { maxWidth: util - 200 });
      doc.text(emitido, largura - margem, margem, { align: "right" });
      doc.setDrawColor(...CINZA_LINHA);
      doc.setLineWidth(0.5);
      doc.line(margem, margem + 20, largura - margem, margem + 20);
    }
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.5);
    doc.line(margem, altura - rodape + 10, largura - margem, altura - rodape + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_SECUNDARIO);
    doc.text(`${TITULO} · ${emitido}`, margem, altura - rodape + 24);
    doc.text(`Página ${i} de ${paginas}`, largura - margem, altura - rodape + 24, { align: "right" });
  }

  return doc;
}

export async function exportarRelatorioPdf(r: Relatorio): Promise<void> {
  const doc = await gerarPdf(r);
  baixar(doc.output("blob"), nomeArquivo("pdf", r.emitidoEm));
}

/**
 * Abre o PDF em nova aba com o diálogo de impressão. A aba é aberta antes da
 * geração (ainda dentro do gesto do usuário) para não ser bloqueada.
 */
export async function imprimirRelatorio(r: Relatorio): Promise<void> {
  const aba = window.open("", "_blank");
  try {
    const doc = await gerarPdf(r);
    doc.autoPrint();
    const url = URL.createObjectURL(doc.output("blob"));
    if (aba) aba.location.href = url;
    else baixar(doc.output("blob"), nomeArquivo("pdf", r.emitidoEm));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    aba?.close();
    throw e;
  }
}

/* ----------------------------------- Excel ---------------------------------- */

export async function exportarRelatorioExcel(r: Relatorio): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const { orgao, setor } = identificacao();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Planeja IA";
  wb.created = r.emitidoEm;

  const ws = wb.addWorksheet("Andamento", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L${TITULO}&RPágina &P de &N`,
    },
  });
  const cols = [
    { header: "Item", width: 7 },
    { header: "Título", width: 48 },
    { header: "Processo", width: 18 },
    { header: "Situação", width: 12 },
    { header: "Modalidade", width: 20 },
    { header: "Tipo", width: 16 },
    { header: "Secretaria", width: 22 },
    { header: "Responsável", width: 22 },
    { header: "Criada em", width: 12 },
    { header: "Dias na etapa", width: 13 },
    { header: "Fase", width: 18 },
    { header: "Campos da etapa", width: 40 },
    { header: "Observações", width: 50 },
  ];
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  const borda = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
  const cinza = "FF5A6372";
  let linha = 1;
  const cabecalho = (texto: string, font: Partial<Font>) => {
    ws.mergeCells(linha, 1, linha, cols.length);
    const cell = ws.getCell(linha, 1);
    cell.value = texto;
    cell.font = font;
    linha++;
  };

  if (orgao) cabecalho(orgao, { bold: true, size: 12 });
  if (setor) cabecalho(setor, { size: 10, color: { argb: cinza } });
  cabecalho(TITULO, { bold: true, size: 14 });
  cabecalho(`Emitido em ${emissao(r.emitidoEm)}`, { size: 10, color: { argb: cinza } });
  if (r.criterios.length) {
    cabecalho(`Critérios aplicados: ${criteriosTexto(r.criterios)}`, { size: 10 });
  }
  cabecalho(
    indicadoresLista(r.indicadores)
      .map((x) => `${x.rotulo}: ${x.valor}`)
      .join("   ·   "),
    { size: 10, bold: true },
  );
  linha++;

  for (const g of r.grupos) {
    if (g.linhas.length === 0) continue;
    ws.mergeCells(linha, 1, linha, cols.length);
    const titulo = ws.getCell(linha, 1);
    titulo.value = `${g.indice}. ${g.etapa.nome} — ${g.linhas.length} ${g.linhas.length === 1 ? "tarefa" : "tarefas"}`;
    titulo.font = { bold: true, size: 11 };
    titulo.border = { bottom: { style: "medium", color: { argb: "FF9CA3AF" } } };
    ws.getRow(linha).height = 20;
    linha++;

    const cab = ws.getRow(linha);
    cols.forEach((c, i) => {
      const cell = cab.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      cell.border = { top: borda, bottom: borda, left: borda, right: borda };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    linha++;

    for (const l of g.linhas) {
      const row = ws.getRow(linha);
      const valores: (string | number)[] = [
        l.item,
        l.titulo,
        l.processo,
        l.situacao,
        l.modalidade,
        l.tipo,
        l.secretarias,
        l.responsavel,
        l.criada,
        l.dias,
        l.fase,
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
      linha++;
    }
    linha++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  baixar(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomeArquivo("xlsx", r.emitidoEm),
  );
}
