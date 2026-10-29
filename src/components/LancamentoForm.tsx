import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/MoneyInput";
import { DataField, MesAnoField } from "@/components/CamposData";
import { CartaoFormDialog } from "@/components/CartaoFormDialog";
import { OpcaoCor } from "@/components/SubcategoriaChip";
import { ParcelamentoForm, type ParcelamentoInicial } from "@/components/ParcelamentoForm";
import { CATEGORIAS, useFinanceData, type Categoria, type Lancamento, type NovoLancamento, type Parcelamento } from "@/lib/finance-store";
import { formatDiaMesData, formatMesAno } from "@/lib/format";
import { cartaoConfigurado, faturaDoCartao, parseISODate, toISODate, type MesAno } from "@/lib/fatura";
import { competenciaDoLancamento } from "@/lib/recorrencias";
import { aplicarAPartirDe } from "@/lib/parcelamento-ops";
import { normalizarTexto } from "@/lib/texto";
import { toast } from "sonner";

export interface LancamentoSalvo {
  lancamento?: Lancamento;
  parcelamento?: Parcelamento;
}

interface LancamentoFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lancamento?: Lancamento | null;
  inicial?: Partial<NovoLancamento>;
  onSalvo?: (r: LancamentoSalvo) => void;
}

const SEM = "__nenhum__";
const catKeys = Object.keys(CATEGORIAS) as Categoria[];

/** Subcategoria e cartão mais usados em lançamentos com descrição igual ou que começa igual. */
function sugerir(descricao: string, historico: Lancamento[]) {
  const n = normalizarTexto(descricao);
  if (n.length < 3) return null;
  const parecidos = historico.filter((l) => {
    const d = normalizarTexto(l.descricao);
    return d === n || d.startsWith(n);
  });
  const maisComum = (valores: (string | null)[]) => {
    const contagem = valores.filter(Boolean).reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return { subcategoria: maisComum(parecidos.map((l) => l.subcategoria)), cartaoId: maisComum(parecidos.map((l) => l.cartaoId)) };
}

export function LancamentoForm({ open, onOpenChange, lancamento, inicial, onSalvo }: LancamentoFormProps) {
  const {
    lancamentos, cartoes, subcategoriasAtivas, membros, metas, mesSelecionado, anoSelecionado, getCartao, parcelamentos,
    addLancamento, updateLancamento, salvarParcelamento, progressoParcelamento, statusLancamentoCartao, addAporte,
  } = useFinanceData();

  const dataPadrao = () => {
    const hoje = new Date();
    const ehAtual = hoje.getMonth() === mesSelecionado && hoje.getFullYear() === anoSelecionado;
    return toISODate(ehAtual ? hoje : new Date(anoSelecionado, mesSelecionado, 1));
  };

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [categoria, setCategoria] = useState<Categoria>("variavel");
  const [data, setData] = useState(dataPadrao);
  const [subcategoria, setSubcategoria] = useState("");
  const [cartaoId, setCartaoId] = useState("");
  const [status, setStatus] = useState<Lancamento["status"]>("pago");
  const [responsavel, setResponsavel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [reembolso, setReembolso] = useState(false);
  const [nParcelas, setNParcelas] = useState(1);
  const [alterarFatura, setAlterarFatura] = useState(false);
  const [faturaManual, setFaturaManual] = useState<MesAno>({ mes: mesSelecionado, ano: anoSelecionado });
  const [metaId, setMetaId] = useState(SEM);
  const [tocados, setTocados] = useState({ subcategoria: false, cartao: false });
  const [parcelar, setParcelar] = useState<ParcelamentoInicial | null>(null);
  const [perguntaParcela, setPerguntaParcela] = useState(false);
  const [novoCartao, setNovoCartao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fonte = lancamento ?? inicial ?? {};
    setDescricao(fonte.descricao ?? "");
    setValor(fonte.valor ?? 0);
    setCategoria(fonte.categoria ?? "variavel");
    setData(fonte.data ?? dataPadrao());
    setSubcategoria(fonte.subcategoria ?? "");
    setCartaoId(fonte.cartaoId ?? "");
    setStatus(fonte.status ?? "pago");
    setResponsavel(fonte.responsavel ?? "");
    setObservacao(fonte.observacao ?? "");
    setReembolso(fonte.reembolso ?? false);
    setNParcelas(1);
    setMetaId(SEM);
    setTocados({ subcategoria: !!fonte.subcategoria, cartao: !!fonte.cartaoId });
    const competenciaOriginal = lancamento && { mes: lancamento.mes, ano: lancamento.ano };
    setFaturaManual(competenciaOriginal ?? { mes: mesSelecionado, ano: anoSelecionado });
    setAlterarFatura(false);
  }, [open, lancamento, inicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const historico = useMemo(() => lancamentos.filter((l) => l.categoria !== "entrada"), [lancamentos]);

  const onDescricao = (v: string) => {
    setDescricao(v);
    if (lancamento) return;
    const s = sugerir(v, historico);
    if (!s) return;
    if (!tocados.subcategoria && s.subcategoria) setSubcategoria(s.subcategoria);
    if (!tocados.cartao && s.cartaoId && categoria === "cartao") setCartaoId(s.cartaoId);
  };

  const ehSaida = categoria !== "entrada";
  const ehCartao = categoria === "cartao";
  const cartao = getCartao(cartaoId);
  const competenciaCalculada = competenciaDoLancamento(categoria, parseISODate(data), cartao);
  const competencia = ehCartao && alterarFatura ? faturaManual : competenciaCalculada;
  const fatura = ehCartao && cartao ? faturaDoCartao(competencia, cartao) : null;
  const parcelaDe = lancamento?.parcelamentoId ? parcelamentos.find((p) => p.id === lancamento.parcelamentoId) : null;
  const ehReserva = subcategoria === "reserva";

  const montar = (): NovoLancamento => ({
    descricao: descricao.trim(),
    valor,
    categoria,
    ...competencia,
    data,
    subcategoria: ehSaida ? subcategoria || null : null,
    cartaoId: ehCartao ? cartaoId || null : null,
    parcelamentoId: lancamento?.parcelamentoId ?? null,
    parcelaNum: lancamento?.parcelaNum ?? null,
    recorrenciaId: lancamento?.recorrenciaId ?? null,
    status,
    reembolso: categoria === "entrada" && reembolso,
    responsavel: responsavel || null,
    observacao: observacao.trim() || null,
    origem: lancamento?.origem ?? inicial?.origem ?? "manual",
  });

  const validar = () => {
    if (!descricao.trim()) return "Informe a descrição";
    if (valor <= 0) return "Informe o valor";
    if (ehSaida && !subcategoria) return "Selecione a subcategoria";
    if (ehCartao && !cartaoId) return "Selecione o cartão";
    return null;
  };

  const concluir = (r: LancamentoSalvo) => {
    onSalvo?.(r);
    onOpenChange(false);
  };

  const salvarSimples = async () => {
    setSalvando(true);
    const dados = montar();
    if (lancamento) {
      const atualizado = { ...lancamento, ...dados };
      const ok = await updateLancamento(atualizado);
      setSalvando(false);
      if (ok) concluir({ lancamento: atualizado });
      return;
    }
    const novo = await addLancamento(dados);
    if (novo && ehReserva && metaId !== SEM) {
      await addAporte({ metaId, data: novo.data, valor: novo.valor, lancamentoId: novo.id });
      toast.success("Aporte vinculado à meta");
    }
    setSalvando(false);
    if (novo) concluir({ lancamento: novo });
  };

  const salvarEstaEProximas = async () => {
    if (!lancamento || !parcelaDe) return;
    setSalvando(true);
    const existentes = progressoParcelamento(parcelaDe).lancamentos;
    const payload = aplicarAPartirDe(parcelaDe, existentes, lancamento.parcelaNum ?? 1, {
      descricao: descricao.trim(), valor, subcategoria: subcategoria || null,
    }, statusLancamentoCartao);
    const salvo = await salvarParcelamento(payload);
    setSalvando(false);
    if (salvo) concluir({ parcelamento: salvo });
  };

  const vaiParcelar = !lancamento && ehCartao && nParcelas > 1;
  const rotuloBotao = (() => {
    if (lancamento) return "Salvar alterações";
    return vaiParcelar ? "Continuar para parcelamento" : "Adicionar";
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    if (vaiParcelar) {
      setParcelar({ descricao: descricao.trim(), valorTotal: valor, nParcelas, cartaoId, subcategoria, dataCompra: data, observacao: observacao.trim() || null });
      return;
    }
    if (parcelaDe) { setPerguntaParcela(true); return; }
    salvarSimples();
  };

  return (
    <>
      <Dialog open={open && !parcelar} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{lancamento ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => onDescricao(e.target.value)} required autoFocus={!lancamento} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor</Label>
                <MoneyInput value={valor} onChange={setValor} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select
                  value={categoria}
                  onValueChange={(v) => setCategoria(v as Categoria)}
                  disabled={!!lancamento?.parcelamentoId}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {catKeys.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{categoria === "conta_fixa" ? "Vencimento" : "Data"}</Label>
                <DataField value={data} onChange={setData} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Lancamento["status"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {ehSaida && (
              <div>
                <Label>Subcategoria</Label>
                <Select value={subcategoria} onValueChange={(v) => { setSubcategoria(v); setTocados((t) => ({ ...t, subcategoria: true })); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {subcategoriasAtivas.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {ehCartao && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Cartão</Label>
                      <button type="button" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5" onClick={() => setNovoCartao(true)}>
                        <Plus className="h-3 w-3" /> Novo
                      </button>
                    </div>
                    <Select value={cartaoId} onValueChange={(v) => { setCartaoId(v); setTocados((t) => ({ ...t, cartao: true })); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {cartoes.filter((c) => c.ativo || c.id === cartaoId).map((c) => (
                          <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!lancamento && (
                    <div>
                      <Label>Parcelas</Label>
                      <Input type="number" inputMode="numeric" min={1} max={72} value={nParcelas} onChange={(e) => setNParcelas(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                  )}
                </div>
                {cartao && (
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                    {fatura && cartaoConfigurado(cartao) ? (
                      <span>
                        Cai na fatura de <strong className="text-foreground">{formatMesAno(competencia.mes, competencia.ano)}</strong> (vence {formatDiaMesData(fatura.dataVencimento)})
                      </span>
                    ) : (
                      <span className="text-warning-foreground">Cartão sem fechamento/vencimento: fatura = mês da data.</span>
                    )}
                    <button type="button" className="text-primary hover:underline" onClick={() => { setFaturaManual(competencia); setAlterarFatura(!alterarFatura); }}>
                      {alterarFatura ? "usar cálculo" : "alterar fatura"}
                    </button>
                  </div>
                )}
                {alterarFatura && <MesAnoField value={faturaManual} onChange={setFaturaManual} />}
                {nParcelas > 1 && <p className="text-xs text-primary">Com {nParcelas} parcelas, o lançamento vira um parcelamento.</p>}
              </div>
            )}

            {categoria === "entrada" && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={reembolso} onCheckedChange={(v) => setReembolso(v === true)} className="mt-0.5" />
                <span>
                  É reembolso
                  <span className="block text-xs text-muted-foreground">Continua contando como entrada, mas fica fora da renda usada no planejamento.</span>
                </span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Responsável</Label>
                <Select value={responsavel || SEM} onValueChange={(v) => setResponsavel(v === SEM ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>—</SelectItem>
                    {membros.map((m) => <SelectItem key={m.userId} value={m.nome}>{m.nome}</SelectItem>)}
                    {responsavel && !membros.some((m) => m.nome === responsavel) && <SelectItem value={responsavel}>{responsavel}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {ehReserva && !lancamento && metas.length > 0 && (
                <div>
                  <Label>Vincular a uma meta</Label>
                  <Select value={metaId} onValueChange={setMetaId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>Não vincular</SelectItem>
                      {metas.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>

            <Button type="submit" className="w-full" disabled={salvando}>
              {rotuloBotao}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={perguntaParcela} onOpenChange={setPerguntaParcela}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar parcela {lancamento?.parcelaNum}/{parcelaDe?.parcelas}</AlertDialogTitle>
            <AlertDialogDescription>Aplicar a alteração só a esta parcela ou também às próximas ainda não pagas?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setPerguntaParcela(false); salvarSimples(); }}>Só esta parcela</Button>
            <AlertDialogAction onClick={salvarEstaEProximas}>Esta e as próximas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ParcelamentoForm
        open={!!parcelar}
        onOpenChange={(v) => { if (!v) { setParcelar(null); onOpenChange(false); } }}
        inicial={parcelar ?? undefined}
        onSalvo={(p) => { setParcelar(null); concluir({ parcelamento: p }); }}
      />

      <CartaoFormDialog open={novoCartao} onOpenChange={setNovoCartao} onSalvo={(c) => { setCartaoId(c.id); setTocados((t) => ({ ...t, cartao: true })); }} />
    </>
  );
}
