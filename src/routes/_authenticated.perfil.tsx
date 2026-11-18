import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, Save } from "lucide-react";
import { routeHead } from "@/lib/utils/route-head";
import { AppShell } from "@/components/layout/AppShell";
import { SecretariasMultiSelect } from "@/components/layout/SecretariasMultiSelect";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { appOriginPath } from "@/lib/utils/app-path";
import {
  usePerfil,
  useSalvarPerfil,
  useSecretariasOpcoes,
} from "@/features/perfil/hooks";
import {
  idsPrincipais,
  iniciais,
  maskTelefone,
  perfilSchema,
  type PerfilFormValues,
} from "@/features/perfil/lib";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: Page,
  head: () =>
    routeHead({
      path: "/perfil",
      title: "Meu perfil",
      description: "Seus dados de contato, cargo e secretarias vinculadas.",
      noindex: true,
    }),
});

const VAZIO: PerfilFormValues = {
  nome: "",
  telefone: "",
  cargo: "",
  endereco: "",
  secretarias: [],
  principal: null,
};

function Page() {
  const { user, roles } = useAuth();
  const { data: perfil, isLoading, error } = usePerfil();
  const { data: opcoes = [] } = useSecretariasOpcoes();
  const salvar = useSalvarPerfil();
  const [enviandoSenha, setEnviandoSenha] = useState(false);

  const form = useForm<PerfilFormValues>({
    resolver: zodResolver(perfilSchema),
    defaultValues: VAZIO,
  });

  useEffect(() => {
    if (!perfil) return;
    const secretarias = idsPrincipais(perfil.secretarias, opcoes);
    const principal = perfil.principal
      ? (idsPrincipais([perfil.principal], opcoes)[0] ?? null)
      : null;
    form.reset({
      nome: perfil.nome,
      telefone: perfil.telefone ?? "",
      cargo: perfil.cargo ?? "",
      endereco: perfil.endereco ?? "",
      secretarias,
      principal: principal && secretarias.includes(principal) ? principal : null,
    });
  }, [perfil, form, opcoes]);

  const secretariasSel = form.watch("secretarias");
  const principal = form.watch("principal");

  // Mantém a principal consistente com a seleção.
  useEffect(() => {
    if (principal && !secretariasSel.includes(principal)) {
      form.setValue("principal", null, { shouldDirty: true });
    }
  }, [secretariasSel, principal, form]);

  async function onSubmit(v: PerfilFormValues) {
    const secretarias = idsPrincipais(v.secretarias, opcoes);
    const principal = v.principal
      ? (idsPrincipais([v.principal], opcoes)[0] ?? null)
      : null;
    const salvo: PerfilFormValues = {
      ...v,
      secretarias,
      principal: principal && secretarias.includes(principal) ? principal : null,
    };
    try {
      await salvar.mutateAsync(salvo);
      notify.success("Perfil atualizado");
      form.reset(salvo);
    } catch (e) {
      notify.error("Não foi possível salvar o perfil", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function alterarSenha() {
    const email = perfil?.email || user?.email;
    if (!email) return;
    setEnviandoSenha(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appOriginPath("/reset-password"),
    });
    setEnviandoSenha(false);
    if (err) {
      notify.error("Não foi possível enviar o e-mail", {
        description: err.message,
      });
      return;
    }
    notify.success("E-mail enviado", {
      description: `Siga o link enviado para ${email} para definir uma nova senha.`,
    });
  }

  return (
    <AppShell title="Meu perfil" subtitle="Dados de contato e secretarias vinculadas">
      {isLoading ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : error ? (
        <Card className="mx-auto w-full max-w-3xl">
          <CardContent className="p-6 text-sm text-destructive">
            Não foi possível carregar o perfil.
          </CardContent>
        </Card>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mx-auto flex w-full max-w-3xl flex-col gap-4"
            noValidate
          >
            <Card className="border-border/60">
              <CardContent className="flex items-center gap-4 p-5">
                <Avatar className="size-14">
                  <AvatarFallback className="bg-gradient-to-br from-accent to-accent-strong text-base font-semibold text-white">
                    {iniciais(form.watch("nome"), perfil?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">
                    {form.watch("nome") || perfil?.email}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {perfil?.email}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(roles.length ? roles : ["operador"]).map((r) => (
                      <Badge key={r} variant="secondary" className="uppercase">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dados pessoais</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Nome completo</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="name" maxLength={120} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <Input value={perfil?.email ?? ""} readOnly disabled />
                  <FormDescription>
                    O e-mail só pode ser alterado por um administrador.
                  </FormDescription>
                </FormItem>
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="(00) 00000-0000"
                          onChange={(e) =>
                            field.onChange(maskTelefone(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cargo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo / função</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={120} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endereco"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Endereço</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} maxLength={300} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Secretarias</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="secretarias"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Secretarias vinculadas</FormLabel>
                      <FormControl>
                        <SecretariasMultiSelect
                          options={opcoes}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="principal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secretaria principal</FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(v) =>
                          field.onChange(v === "none" ? null : v)
                        }
                        disabled={secretariasSel.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Nenhuma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {opcoes
                            .filter((o) => secretariasSel.includes(o.id))
                            .map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Segurança</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Enviaremos um link para {perfil?.email} para você definir uma
                  nova senha.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void alterarSenha()}
                  disabled={enviandoSenha}
                >
                  {enviandoSenha ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Alterar senha
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={salvar.isPending || !form.formState.isDirty}
              >
                {salvar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar alterações
              </Button>
            </div>
          </form>
        </Form>
      )}
    </AppShell>
  );
}
