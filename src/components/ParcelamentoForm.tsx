import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MoneyInput } from "@/components/MoneyInput";
import { DataField, MesAnoField } from "@/components/CamposData";
import { CartaoFormDialog } from "@/components/CartaoFormDialog";
import { OpcaoCor } from "@/components/SubcategoriaChip";
import { formatCurrency, useFinanceData, type Parcelamento } from "@/lib/finance-store";
import { formatDataBR, formatDiaMes, formatMesAno } from "@/lib/format";
import {
  calcularFatura, cartaoConfigurado, faturaAberta, gerarParcelas, parseISODate, somarMeses, toISODate, type MesAno,
} from "@/lib/fatura";
import { round2 } from "@/lib/money";
import { lancamentosDasParcelas, parcelasAntesDe, possiveisDuplicados, regerarFuturas, type DadosParcelamento } from "@/lib/parcelamento-ops";
import { toast } from "sonner";

export interface ParcelamentoInicial {
  descricao?: string;
  valorTotal?: number;
  nParcelas?: number;
  cartaoId?: string | null;
  subcategoria?: string | null;
  dataCompra?: string;
  observacao?: string | null;
}

interface ParcelamentoFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Editar parcelamento vinculado. */
  parcelamento?: Parcelamento | null;
  /** Vincular parcelamento legado a um cartão. */
  legado?: Parcelamento | null;
  inicial?: ParcelamentoInicial;
  onSalvo?: (p: Parcelamento) => void;
}

type ModoValor = "total" | "parcela";

export function ParcelamentoForm({ open, onOpenChange, parcelamento, legado, inicial, onSalvo }: ParcelamentoFormProps) {
  const {
    cartoes, subcategoriasAtivas, lancamentos, getCartao, salvarParcelamento, progressoParcelamento, statusLancamentoCartao,
  } = useFinanceData();
  const hoje = useMemo(() => new Date(), []);
  const base = parcelamento ?? legado;
  const modo = (() => {
    if (parcelamento) return "editar";
    return legado ? "vincular" : "novo";
  })();

  const [descricao, setDescricao] = useState("");
  const [cartaoId, setCartaoId] = useState<string>("");
  const [subcategoria, setSubcategoria] = useState<string>("");
  const [dataCompra, setDataCompra] = useState(toISODate(hoje));
  const [modoValor, setModoValor] = useState<ModoValor>("total");
  const [valor, setValor] = useState(0);
  const [nParcelas, setNParcelas] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [alterarFatura, setAlterarFatura] = useState(false);
  const [faturaManual, setFaturaManual] = useState<MesAno>({ mes: hoje.getMonth(), ano: hoje.getFullYear() });
  const [soAPartirDaAtual, setSoAPartirDaAtual] = useState(true);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [confirmarEdicao, setConfirmarEdicao] = useState(false);
  const [novoCartao, setNovoCartao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescricao(base?.descricao ?? inicial?.descricao ?? "");
    setCartaoId(base?.cartaoId ?? inicial?.cartaoId ?? "");
    setSubcategoria(base?.subcategoria ?? inicial?.subcategoria ?? "");
    setDataCompra(base?.dataCompra ?? inicial?.dataCompra ?? toISODate(new Date()));
    setModoValor("total");
    setValor(base?.valorTotal ?? inicial?.valorTotal ?? 0);
    setNParcelas(base?.parcelas ?? inicial?.nParcelas ?? 1);
    setObservacao(base?.observacao ?? inicial?.observacao ?? "");
    setAlterarFatura(!!parcelamento);
    setFaturaManual(
      parcelamento?.primeiraFaturaMes != null
        ? { mes: parcelamento.primeiraFaturaMes, ano: parcelamento.primeiraFaturaAno }
        : { mes: new Date().getMonth(), ano: new Date().getFullYear() },
    );
    setSoAPartirDaAtual(true);
    setDesmarcados(new Set());
  }, [open, base, inicial, parcelamento]);

  const cartao = getCartao(cartaoId);
  const configurado = cartaoConfigurado(cartao);
  const aberta = cartao ? faturaAberta(cartao, hoje) : null;
  const valorTotal = modoValor === "total" ? valor : round2(valor * nParcelas);
  const parcelas = Math.max(1, nParcelas);

  // 1ª parcela: no vínculo de legado o campo é a "fatura da próxima parcela" (padrão = aberta).
  const faturaCalculada = ((): MesAno | null => {
    if (!configurado) return null;
    const f = modo === "vincular" ? aberta : calcularFatura(parseISODate(dataCompra), cartao.diaFechamento, cartao.diaVencimento);
    return { mes: f.mes, ano: f.ano };
  })();

  const faturaCampo = alterarFatura || !faturaCalculada ? faturaManual : faturaCalculada;
  const pagasLegado = legado?.parcelasPagas ?? 0;
  const primeira = modo === "vincular" ? somarMeses(faturaCampo.mes, faturaCampo.ano, -pagasLegado) : faturaCampo;

  const rascunho: DadosParcelamento = {
    id: base?.id,
    descricao: descricao.trim(),
    valorTotal,
    parcelas,
    parcelasPagas: 0,
    valorParcela: gerarParcelas({ valorTotal, nParcelas: parcelas, primeiraFatura: primeira })[0]?.valor ?? 0,
    cartaoId: cartaoId || null,
    subcategoria: subcategoria || null,
    dataCompra,
    primeiraFaturaMes: primeira.mes,
    primeiraFaturaAno: primeira.ano,
    quitado: parcelamento?.quitado ?? false,
    observacao: observacao.trim() || null,
  };
  const antigas = modo === "novo" && aberta ? parcelasAntesDe(rascunho, aberta) : 0;
  const parcelasPagas = (() => {
    if (modo === "vincular") return pagasLegado;
    if (modo === "editar") return parcelamento.parcelasPagas;
    return soAPartirDaAtual ? antigas : 0;
  })();
  const dados: DadosParcelamento = { ...rascunho, parcelasPagas };
  const novos = lancamentosDasParcelas(dados);
  const duplicados = modo === "vincular" ? possiveisDuplicados(novos, lancamentos, dados.cartaoId) : [];
  const ultima = somarMeses(primeira.mes, primeira.ano, parcelas - 1);

  const valido = () => {
    if (!dados.descricao) return "Informe a descrição";
    if (!cartao) return "Selecione o cartão";
    if (!configurado) return "Configure fechamento e vencimento do cartão antes de gerar parcelas";
    if (!dados.subcategoria) return "Selecione a subcategoria";
    if (valorTotal <= 0) return "Informe o valor";
    return null;
  };

  const salvar = async (aplicarFuturas: boolean) => {
    setSalvando(true);
    const payload = (() => {
      if (modo !== "editar") {
        return { parcelamento: dados, lancamentos: novos, apagarIds: duplicados.filter((d) => !desmarcados.has(d.id)).map((d) => d.id) };
      }
      if (!aplicarFuturas) return { parcelamento: dados, lancamentos: [], apagarIds: [] };
      const existentes = progressoParcelamento(parcelamento).lancamentos;
      return { parcelamento: dados, ...regerarFuturas(dados, existentes, statusLancamentoCartao) };
    })();
    const salvo = await salvarParcelamento(payload);
    setSalvando(false);
    if (!salvo) return;
    toast.success(modo === "novo" ? `Parcelamento criado: ${novos.length} parcela(s) lançada(s)` : "Parcelamento salvo");
    onSalvo?.(salvo);
    onOpenChange(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const erro = valido();
    if (erro) { toast.error(erro); return; }
    if (modo === "editar") setConfirmarEdicao(true);
    else salvar(false);
  };

  const titulo = { novo: "Novo parcelamento", editar: "Editar parcelamento", vincular: "Vincular parcelamento a um cartão" }[modo];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {modo === "vincular" && (
              <DialogDescription>
                {legado.parcelasPagas} de {legado.parcelas} parcelas já pagas. As {legado.parcelas - legado.parcelasPagas} restantes serão lançadas a partir da fatura escolhida.
              </DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Cartão</Label>
                  <button type="button" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5" onClick={() => setNovoCartao(true)}>
                    <Plus className="h-3 w-3" /> Novo cartão
                  </button>
                </div>
                <Select value={cartaoId} onValueChange={setCartaoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {cartoes.filter((c) => c.ativo || c.id === cartaoId).map((c) => (
                      <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategoria</Label>
                <Select value={subcategoria} onValueChange={setSubcategoria}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {subcategoriasAtivas.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cartao && !configurado && (
              <p className="text-xs text-warning-foreground bg-warning/15 border border-warning/30 rounded-md p-2 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                Configure fechamento e vencimento deste cartão (tela Cartões) para gerar as parcelas.
              </p>
            )}

            {modo !== "vincular" && (
              <div>
                <Label>Data da compra</Label>
                <DataField value={dataCompra} onChange={setDataCompra} />
              </div>
            )}

            <div className="space-y-2">
              <ToggleGroup
                type="single"
                value={modoValor}
                onValueChange={(v) => {
                  if (!v) return;
                  setValor(v === "parcela" ? round2(valorTotal / parcelas) : valorTotal);
                  setModoValor(v as ModoValor);
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="total" size="sm">Valor total</ToggleGroupItem>
                <ToggleGroupItem value="parcela" size="sm">Valor da parcela</ToggleGroupItem>
              </ToggleGroup>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{modoValor === "total" ? "Valor total" : "Valor da parcela"}</Label>
                  <MoneyInput value={valor} onChange={setValor} />
                </div>
                <div>
                  <Label>Nº de parcelas</Label>
                  <Input type="number" inputMode="numeric" min={1} max={72} value={nParcelas} onChange={(e) => setNParcelas(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
            </div>

            {configurado && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{modo === "vincular" ? "Fatura da próxima parcela" : "1ª parcela na fatura de"}</Label>
                  {faturaCalculada && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setFaturaManual(faturaCampo);
                        setAlterarFatura(!alterarFatura);
                      }}
                    >
                      {alterarFatura ? "usar cálculo" : "alterar"}
                    </button>
                  )}
                </div>
                {alterarFatura ? (
                  <MesAnoField value={faturaManual} onChange={setFaturaManual} />
                ) : (
                  <p className="text-sm text-muted-foreground capitalize">{formatMesAno(faturaCampo.mes, faturaCampo.ano)}</p>
                )}
              </div>
            )}

            {antigas > 0 && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={soAPartirDaAtual} onCheckedChange={(v) => setSoAPartirDaAtual(v === true)} className="mt-0.5" />
                <span>
                  Gerar lançamentos só a partir da fatura atual
                  <span className="block text-xs text-muted-foreground">
                    {antigas} parcela(s) anterior(es) contam como pagas e não entram em Lançamentos.
                  </span>
                </span>
              </label>
            )}

            <div>
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>

            {configurado && valorTotal > 0 && (
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-medium">
                  {parcelas}× {formatCurrency(dados.valorParcela)} — de {formatMesAno(primeira.mes, primeira.ano)} a {formatMesAno(ultima.mes, ultima.ano)}
                </p>
                <p className="text-xs text-muted-foreground">
                  cartão {cartao.nome} (vence dia {cartao.diaVencimento}) · total {formatCurrency(valorTotal)} · {novos.length} lançamento(s) a gerar
                </p>
              </div>
            )}

            {duplicados.length > 0 && (
              <div className="rounded-lg border border-warning/40 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Possíveis lançamentos duplicados
                </p>
                <p className="text-xs text-muted-foreground">Marcados serão excluídos ao salvar.</p>
                {duplicados.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!desmarcados.has(d.id)}
                      onCheckedChange={(v) =>
                        setDesmarcados((prev) => {
                          const prox = new Set(prev);
                          if (v === true) prox.delete(d.id);
                          else prox.add(d.id);
                          return prox;
                        })
                      }
                    />
                    <span className="flex-1 truncate">{d.descricao}</span>
                    <span className="text-xs text-muted-foreground">{formatDiaMes(d.data)} · {formatMesAno(d.mes, d.ano)}</span>
                    <span className="font-medium">{formatCurrency(d.valor)}</span>
                  </label>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={salvando}>
              {modo === "novo" ? "Criar parcelamento" : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarEdicao} onOpenChange={setConfirmarEdicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar às parcelas futuras?</AlertDialogTitle>
            <AlertDialogDescription>
              Aplicar apaga e regera as parcelas de faturas ainda não pagas com os novos dados. As parcelas já pagas não mudam.
              {parcelamento?.dataCompra && ` Compra em ${formatDataBR(parcelamento.dataCompra)}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setConfirmarEdicao(false); salvar(false); }}>Só o parcelamento</Button>
            <AlertDialogAction onClick={() => salvar(true)}>Aplicar às futuras</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CartaoFormDialog open={novoCartao} onOpenChange={setNovoCartao} onSalvo={(c) => setCartaoId(c.id)} />
    </>
  );
}

