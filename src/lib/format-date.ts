export function formatDateBR(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sem data";

  const brDate = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (brDate) return `${brDate[1]}/${brDate[2]}/${brDate[3]}`;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR");
}
