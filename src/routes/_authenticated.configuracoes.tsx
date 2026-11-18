import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CamposDialog } from "@/features/tarefas/components/CamposDialog";
import { EtapaDialog } from "@/features/tarefas/components/EtapaDialog";
import { TkButton, TkEmpty, useConfirmDialog } from "@/features/tarefas/components/ui";
import {
  useAtualizarEtapa,
  useCampos,
  useEtapas,
  useExcluirEtapa,
  useSalvarEtapa,
  useTarefas,
} from "@/features/tarefas/hooks";
import { PASSO_POSICAO, corValida, posicaoEntre, type Etapa } from "@/features/tarefas/lib";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { routeHead } from "@/lib/utils/route-head";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () =>
    routeHead({
      title: "Configurações",
      description: "Etapas do quadro de acompanhamento.",
      path: "/configuracoes",
      noindex: true,
    }),
  component: Page,
});

function Page() {
  const { roles } = useAuth();
  const podeEditar = roles.some((r) => r === "admin" || r === "gestor" || r === "operador");
  const etapasQ = useEtapas();
  const camposQ = useCampos();
  const tarefasQ = useTarefas();
  const salvarEtapa = useSalvarEtapa();
  const atualizarEtapa = useAtualizarEtapa();
  const excluirEtapa = useExcluirEtapa();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [dialogo, setDialogo] = useState<{ aberto: boolean; etapa: Etapa | null }>({
    aberto: false,
    etapa: null,
  });
  const [camposEtapa, setCamposEtapa] = useState<Etapa | null>(null);

  const etapas = useMemo(() => etapasQ.data ?? [], [etapasQ.data]);
  const ativas = useMemo(() => etapas.filter((e) => !e.arquivada), [etapas]);
  const arquivadas = useMemo(() => etapas.filter((e) => e.arquivada), [etapas]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tarefasQ.data ?? []) m.set(t.etapa_id, (m.get(t.etapa_id) ?? 0) + 1);
    return m;
  }, [tarefasQ.data]);

  async function salvar(v: { id?: string; nome: string; cor: string; finaliza: boolean }) {
    const nome = v.nome.trim();
    const repetido = etapas.some(
      (e) => e.id !== v.id && e.nome.trim().toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"),
    );
    if (repetido) {
      notify.error("Já existe uma etapa com esse nome");
      return;
    }
    try {
      if (v.id) {
        await salvarEtapa.mutateAsync({ id: v.id, nome, cor: v.cor, finaliza: v.finaliza });
      } else {
        const ultima = ativas.at(-1)?.posicao ?? 0;
        await salvarEtapa.mutateAsync({
          nome,
          cor: v.cor,
          finaliza: v.finaliza,
          posicaoNova: ultima + PASSO_POSICAO,
        });
      }
      notify.success(v.id ? "Etapa atualizada" : "Etapa criada");
      setDialogo({ aberto: false, etapa: null });
    } catch (e) {
      notify.error("Não foi possível salvar a etapa", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function mover(etapa: Etapa, direcao: -1 | 1) {
    const i = ativas.findIndex((e) => e.id === etapa.id);
    const destino = i + direcao;
    if (i < 0 || destino < 0 || destino >= ativas.length) return;
    const vizinho = ativas[destino];
    const antes = direcao < 0 ? ativas[destino - 1] : vizinho;
    const depois = direcao < 0 ? vizinho : ativas[destino + 1];
    try {
      await atualizarEtapa.mutateAsync({
        id: etapa.id,
        patch: { posicao: posicaoEntre(antes?.posicao, depois?.posicao) },
      });
    } catch (e) {
      notify.error("Não foi possível reordenar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function arquivar(etapa: Etapa) {
    if ((contagem.get(etapa.id) ?? 0) > 0) {
      notify.error("Mova os itens desta etapa antes de arquivá-la");
      return;
    }
    const ok = await confirm({
      title: `Arquivar “${etapa.nome}”?`,
      description: "A etapa sai do quadro e pode ser restaurada depois.",
      confirmLabel: "Arquivar",
    });
    if (!ok) return;
    try {
      await atualizarEtapa.mutateAsync({ id: etapa.id, patch: { arquivada: true } });
      notify.success("Etapa arquivada");
    } catch (e) {
      notify.error("Não foi possível arquivar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function restaurar(etapa: Etapa) {
    const ultima = ativas.at(-1)?.posicao ?? 0;
    try {
      await atualizarEtapa.mutateAsync({
        id: etapa.id,
        patch: { arquivada: false, posicao: ultima + PASSO_POSICAO },
      });
      notify.success("Etapa restaurada");
    } catch (e) {
      notify.error("Não foi possível restaurar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function excluir(etapa: Etapa) {
    if ((contagem.get(etapa.id) ?? 0) > 0) {
      notify.error("Mova os itens desta etapa antes de excluí-la");
      return;
    }
    const ok = await confirm({
      title: `Excluir “${etapa.nome}”?`,
      description: "A etapa e os campos dela são removidos. Essa ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await excluirEtapa.mutateAsync(etapa.id);
      notify.success("Etapa excluída");
    } catch (e) {
      notify.error("Não foi possível excluir", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-[30px] font-semibold tracking-tight text-(--tk-text)">Configurações</h1>
            <p className="text-[14px] text-(--tk-text-2)">
              Etapas do quadro: nome, cor, ordem, campos e arquivamento.
            </p>
          </div>
          {podeEditar && (
            <TkButton variant="primary" onClick={() => setDialogo({ aberto: true, etapa: null })}>
              <Plus /> Nova etapa
            </TkButton>
          )}
        </header>

        {etapasQ.isLoading ? (
          <p className="text-[14px] text-(--tk-text-2)">Carregando etapas...</p>
        ) : ativas.length === 0 ? (
          <TkEmpty
            icon={Layers}
            title="Nenhuma etapa ativa"
            description={
              podeEditar
                ? "Crie a primeira etapa para organizar o quadro."
                : "Nenhuma etapa está ativa no quadro."
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {ativas.map((etapa, i) => (
              <li
                key={etapa.id}
                className="flex flex-wrap items-center gap-3 rounded-(--tk-radius-card) border border-(--tk-border) bg-(--tk-card) px-3 py-2.5"
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: corValida(etapa.cor) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-(--tk-text)">
                  {etapa.nome}
                </span>
                <span className="text-[12px] text-(--tk-text-3)">{contagem.get(etapa.id) ?? 0}</span>
                {podeEditar && (
                  <span className="flex flex-wrap items-center gap-1">
                    <TkButton variant="tertiary" size="sm" onClick={() => void mover(etapa, -1)} disabled={i === 0}>
                      <ArrowUp /> Subir
                    </TkButton>
                    <TkButton
                      variant="tertiary"
                      size="sm"
                      onClick={() => void mover(etapa, 1)}
                      disabled={i === ativas.length - 1}
                    >
                      <ArrowDown /> Descer
                    </TkButton>
                    <TkButton variant="tertiary" size="sm" onClick={() => setCamposEtapa(etapa)}>
                      <ListChecks /> Campos
                    </TkButton>
                    <TkButton
                      variant="tertiary"
                      size="sm"
                      onClick={() => setDialogo({ aberto: true, etapa })}
                    >
                      <Pencil /> Editar
                    </TkButton>
                    <TkButton variant="tertiary" size="sm" onClick={() => void arquivar(etapa)}>
                      <Archive /> Arquivar
                    </TkButton>
                    <TkButton variant="danger" size="sm" onClick={() => void excluir(etapa)}>
                      <Trash2 /> Excluir
                    </TkButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {arquivadas.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-(--tk-text-3)">
              Arquivadas
            </h2>
            <ul className="flex flex-col gap-2">
              {arquivadas.map((etapa) => (
                <li
                  key={etapa.id}
                  className="flex items-center gap-3 rounded-(--tk-radius-card) border border-dashed border-(--tk-border) px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-(--tk-text-2)">{etapa.nome}</span>
                  {podeEditar && (
                    <TkButton variant="secondary" size="sm" onClick={() => void restaurar(etapa)}>
                      <RotateCcw /> Restaurar
                    </TkButton>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <EtapaDialog
        aberto={dialogo.aberto}
        etapa={dialogo.etapa}
        salvando={salvarEtapa.isPending || atualizarEtapa.isPending}
        onFechar={() => setDialogo({ aberto: false, etapa: null })}
        onSalvar={(v) => void salvar(v)}
      />
      <CamposDialog etapa={camposEtapa} campos={camposQ.data ?? []} onFechar={() => setCamposEtapa(null)} />
      {confirmDialog}
    </AppShell>
  );
}
