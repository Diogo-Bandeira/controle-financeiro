import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CreditCard, LayoutGrid, Link2, List, MoreVertical, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ParcelamentoForm } from "@/components/ParcelamentoForm";
import { CartaoChip, SubcategoriaChip } from "@/components/SubcategoriaChip";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { formatCurrency, useFinanceData, type Parcelamento, type ProgressoParcelamento } from "@/lib/finance-store";
import { formatDataBR, formatDiaMesData, formatMesAno, gravarLocalStorage, lerLocalStorage } from "@/lib/format";
import { cartaoConfigurado, compararMesAno, somarMeses, type MesAno } from "@/lib/fatura";
import { sumMoney } from "@/lib/money";
import { quitarAntecipado } from "@/lib/parcelamento-ops";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Ordenacao = "valorParcela" | "valorRestante" | "termino" | "descricao";
type Tipo = "todos" | "legado" | "vinculado";
type Visao = "cards" | "tabela";

const TODOS = "__todos__";
const CHAVE_VISAO = "cf:parcelamentos-visao";

const ORDENACOES: Record<Ordenacao, string> = {
  valorParcela: "Valor da parcela",
  valorRestante: "Valor restante",
  termino: "Data de término",
  descricao: "Descrição",
};

interface Item {
  p: Parcelamento;
  prog: ProgressoParcelamento;
}

const mesTxt = (m: MesAno | null) => (m ? formatMesAno(m.mes, m.ano) : "—");

const comparadores: Record<Ordenacao, (a: Item, b: Item) => number> = {
  valorParcela: (a, b) => b.p.valorParcela - a.p.valorParcela,
  valorRestante: (a, b) => b.prog.valorRestante - a.prog.valorRestante,
  termino: (a, b) => {
    if (a.prog.termino && b.prog.termino) return compararMesAno(a.prog.termino, b.prog.termino);
    return a.prog.termino ? -1 : 1;
  },
  descricao: (a, b) => a.p.descricao.localeCompare(b.p.descricao, "pt-BR"),
};

function Datas({ p, prog }: Item) {
  const linhas = [
    p.dataCompra && ["Compra", formatDataBR(p.dataCompra)],
    prog.primeira && ["1ª parcela", mesTxt(prog.primeira)],
    prog.termino && [prog.vinculado ? "Termina em" : "Termina em (prev.)", mesTxt(prog.termino)],
    prog.proxima && [
      "Próxima cobrança",
      `${mesTxt(prog.proxima)}${prog.proxima.dataVencimento ? ` · vence ${formatDiaMesData(prog.proxima.dataVencimento)}` : ""}`,
    ],
  ].filter(Boolean) as [string, string][];
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {linhas.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface AcoesProps {
  item: Item;
  onEditar: () => void;
  onVincular: () => void;
  onQuitar: () => void;
  onExcluir: () => void;
  onPagar: () => void;
}

function Acoes({ item: { p, prog }, onEditar, onVincular, onQuitar, onExcluir, onPagar }: AcoesProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {prog.vinculado ? (
          <>
            <DropdownMenuItem onClick={onEditar}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
            {!prog.concluido && !p.quitado && (
              <DropdownMenuItem onClick={onQuitar}><Zap className="h-4 w-4 mr-2" /> Quitar antecipado</DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onVincular}><Link2 className="h-4 w-4 mr-2" /> Vincular a cartão</DropdownMenuItem>
            {prog.restantes > 0 && <DropdownMenuItem onClick={onPagar}><CreditCard className="h-4 w-4 mr-2" /> Registrar pagamento</DropdownMenuItem>}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExcluir} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Parcelamentos() {
  const {
    parcelamentos, lancamentos, cartoes, subcategoriasAtivas, loading, mesSelecionado, anoSelecionado, getCartao,
    progressoParcelamento, statusLancamentoCartao, salvarParcelamento, excluirParcelamento, updateParcelamento,
  } = useFinanceData();
  const location = useLocation();

  const [aba, setAba] = useState<"ativos" | "historico">("ativos");
  const [visao, setVisaoState] = useState<Visao>(() => lerLocalStorage<Visao>(CHAVE_VISAO, "cards"));
  const [filtroCartao, setFiltroCartao] = useState(TODOS);
  const [filtroSub, setFiltroSub] = useState(TODOS);
  const [filtroTipo, setFiltroTipo] = useState<Tipo>("todos");
  const [terminando, setTerminando] = useState(false);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("termino");
  const [form, setForm] = useState<{ parcelamento?: Parcelamento; legado?: Parcelamento } | null>(null);
  const [quitando, setQuitando] = useState<Item | null>(null);
  const [excluindo, setExcluindo] = useState<Item | null>(null);
  const [realce, setRealce] = useState<string | null>(null);

  const setVisao = (v: Visao) => {
    setVisaoState(v);
    gravarLocalStorage(CHAVE_VISAO, v);
  };

  // Link "Parcela x/n" de Lançamentos → /parcelamentos#<id>
  const alvoHash = location.hash.slice(1);
  useEffect(() => {
    if (loading || !alvoHash) return;
    const alvo = parcelamentos.find((p) => p.id === alvoHash);
    if (!alvo) return;
    const prog = progressoParcelamento(alvo);
    setAba(prog.concluido || alvo.quitado ? "historico" : "ativos");
    setRealce(alvoHash);
    const t = setTimeout(() => document.getElementById(alvoHash)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    const fim = setTimeout(() => setRealce(null), 2500);
    return () => { clearTimeout(t); clearTimeout(fim); };
  }, [loading, alvoHash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PaginaCarregando cards={3} />;

  const hoje = new Date();
  const mesAtual = { mes: hoje.getMonth(), ano: hoje.getFullYear() };
  const selecionado = { mes: mesSelecionado, ano: anoSelecionado };
  const itens: Item[] = parcelamentos.map((p) => ({ p, prog: progressoParcelamento(p) }));
  const ativos = itens.filter(({ p, prog }) => !prog.concluido && !p.quitado);
  const historico = itens.filter(({ p, prog }) => prog.concluido || p.quitado);

  // ─── Resumo ────────────────────────────────────────────────────────────
  const noIntervalo = (m: MesAno, de: MesAno, ate: MesAno) => compararMesAno(m, de) >= 0 && compararMesAno(m, ate) <= 0;
  const comprometidoMes = sumMoney([
    ...lancamentos.filter((l) => l.parcelamentoId && l.mes === mesSelecionado && l.ano === anoSelecionado).map((l) => l.valor),
    ...ativos
      .filter(({ prog }) => !prog.vinculado && prog.termino && noIntervalo(selecionado, mesAtual, prog.termino))
      .map(({ p }) => p.valorParcela),
  ]);
  const totalRestante = sumMoney(ativos.map(({ prog }) => prog.valorRestante));
  const limite3 = somarMeses(mesSelecionado, anoSelecionado, 2);
  const liberando = ativos.filter(({ prog }) => prog.termino && noIntervalo(prog.termino, selecionado, limite3));
  const libera3Meses = sumMoney(liberando.map(({ p, prog }) => prog.lancamentos.at(-1)?.valor ?? p.valorParcela));

  // ─── Filtros + ordenação ───────────────────────────────────────────────
  const limite2 = somarMeses(mesAtual.mes, mesAtual.ano, 2);
  const visiveis = (aba === "ativos" ? ativos : historico)
    .filter(({ p }) => filtroCartao === TODOS || p.cartaoId === filtroCartao)
    .filter(({ p }) => filtroSub === TODOS || p.subcategoria === filtroSub)
    .filter(({ prog }) => filtroTipo === "todos" || (filtroTipo === "vinculado") === prog.vinculado)
    .filter(({ prog }) => !terminando || (prog.termino != null && compararMesAno(prog.termino, limite2) <= 0))
    .sort(comparadores[ordenacao]);

  const temFiltro = filtroCartao !== TODOS || filtroSub !== TODOS || filtroTipo !== "todos" || terminando;
  const limparFiltros = () => { setFiltroCartao(TODOS); setFiltroSub(TODOS); setFiltroTipo("todos"); setTerminando(false); };

  // ─── Ações ─────────────────────────────────────────────────────────────
  const pagarLegado = ({ p }: Item) => updateParcelamento({ ...p, parcelasPagas: Math.min(p.parcelasPagas + 1, p.parcelas) });

  const confirmarQuitar = async () => {
    if (!quitando) return;
    const { p, prog } = quitando;
    const cartao = getCartao(p.cartaoId);
    setQuitando(null);
    if (!cartao) return;
    const salvo = await salvarParcelamento(quitarAntecipado(p, prog.lancamentos, cartao, statusLancamentoCartao, new Date()));
    if (salvo) toast.success("Parcelas restantes movidas para a fatura atual");
  };

  const confirmarExcluir = async (manterPagas: boolean) => {
    if (!excluindo) return;
    const { p, prog } = excluindo;
    setExcluindo(null);
    const manter = manterPagas ? prog.lancamentos.filter((l) => statusLancamentoCartao(l) === "paga").map((l) => l.id) : [];
    if (await excluirParcelamento(p.id, manter)) toast.success("Parcelamento excluído");
  };

  const acoesDe = (item: Item) => ({
    item,
    onEditar: () => setForm({ parcelamento: item.p }),
    onVincular: () => setForm({ legado: item.p }),
    onQuitar: () => setQuitando(item),
    onExcluir: () => setExcluindo(item),
    onPagar: () => pagarLegado(item),
  });

  const quitarCartao = quitando ? getCartao(quitando.p.cartaoId) : null;

  const tituloVazio = (() => {
    if (temFiltro) return "Nenhum parcelamento com esses filtros";
    return aba === "ativos" ? "Nenhum parcelamento ativo" : "Nenhum parcelamento no histórico";
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Parcelamentos</h2>
          <p className="text-muted-foreground text-sm">Parcelas lançadas automaticamente nas faturas</p>
        </div>
        <Button onClick={() => setForm({})}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="finance-card">
          <p className="stat-label">Comprometido em {formatMesAno(mesSelecionado, anoSelecionado)}</p>
          <p className="text-xl font-bold">{formatCurrency(comprometidoMes)}</p>
        </div>
        <div className="finance-card">
          <p className="stat-label">Total restante a pagar</p>
          <p className="text-xl font-bold text-destructive">{formatCurrency(totalRestante)}</p>
        </div>
        <div className="finance-card">
          <p className="stat-label">Libera nos próximos 3 meses</p>
          <p className="text-xl font-bold text-success">{formatCurrency(libera3Meses)}</p>
          <p className="text-xs text-muted-foreground">{liberando.length} parcelamento(s) terminando</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
          <TabsList>
            <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({historico.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <ToggleGroup type="single" value={visao} onValueChange={(v) => v && setVisao(v as Visao)} className="justify-start">
          <ToggleGroupItem value="cards" size="sm" aria-label="Cards"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
          <ToggleGroupItem value="tabela" size="sm" aria-label="Tabela"><List className="h-4 w-4" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroCartao} onValueChange={setFiltroCartao}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os cartões</SelectItem>
            {cartoes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroSub} onValueChange={setFiltroSub}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas subcategorias</SelectItem>
            {subcategoriasAtivas.map((s) => <SelectItem key={s.slug} value={s.slug}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as Tipo)}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="vinculado">Vinculados</SelectItem>
            <SelectItem value="legado">Legados</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer px-1">
          <Checkbox checked={terminando} onCheckedChange={(v) => setTerminando(v === true)} />
          Terminando em até 2 meses
        </label>
        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-xs text-muted-foreground">Ordenar</Label>
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ORDENACOES) as Ordenacao[]).map((k) => <SelectItem key={k} value={k}>{ORDENACOES[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {temFiltro && <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar filtros</Button>}
      </div>

      {visiveis.length === 0 ? (
        <div className="finance-card">
          <EstadoVazio
            icone={CreditCard}
            titulo={tituloVazio}
            acao={
              temFiltro
                ? <Button variant="outline" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
                : aba === "ativos" && <Button size="sm" onClick={() => setForm({})}><Plus className="h-4 w-4 mr-1" /> Novo parcelamento</Button>
            }
          />
        </div>
      ) : visao === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visiveis.map((item) => {
            const { p, prog } = item;
            return (
              <div
                key={p.id}
                id={p.id}
                className={cn("finance-card flex flex-col gap-3 scroll-mt-24", realce === p.id && "ring-2 ring-primary")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="font-semibold truncate">{p.descricao}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <SubcategoriaChip slug={p.subcategoria} />
                      <CartaoChip cartaoId={p.cartaoId} />
                      {!prog.vinculado && <Badge variant="outline" className="text-[10px] border-warning/50 text-warning-foreground dark:text-warning">Legado</Badge>}
                      {p.quitado && <Badge variant="outline" className="text-[10px]">Quitado</Badge>}
                    </div>
                  </div>
                  <Acoes {...acoesDe(item)} />
                </div>

                <Datas {...item} />

                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{prog.pagas}/{p.parcelas} parcelas pagas</span>
                    <span>{p.parcelas > 0 ? Math.round((prog.pagas / p.parcelas) * 100) : 0}%</span>
                  </div>
                  <Progress value={p.parcelas > 0 ? (prog.pagas / p.parcelas) * 100 : 0} className="h-2.5" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-sm text-center">
                  <div>
                    <p className="text-muted-foreground text-xs">Total</p>
                    <p className="font-semibold">{formatCurrency(p.valorTotal)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Parcela</p>
                    <p className="font-semibold">{formatCurrency(p.valorParcela)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Restam</p>
                    <p className="font-semibold">{prog.restantes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Restante</p>
                    <p className="font-semibold">{formatCurrency(prog.valorRestante)}</p>
                  </div>
                </div>

                {!prog.vinculado && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setForm({ legado: p })}>
                      <Link2 className="h-4 w-4 mr-1" /> Vincular a cartão
                    </Button>
                    {prog.restantes > 0 && (
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => pagarLegado(item)}>
                        Registrar Pagamento
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="finance-card p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden md:table-cell">Cartão</TableHead>
                <TableHead className="text-right">Parcela</TableHead>
                <TableHead className="text-center">Pagas</TableHead>
                <TableHead className="text-right">Restante</TableHead>
                <TableHead className="hidden sm:table-cell">Término</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((item) => {
                const { p, prog } = item;
                return (
                  <TableRow key={p.id} id={p.id} className={cn(realce === p.id && "bg-primary/10")}>
                    <TableCell>
                      <div className="font-medium truncate max-w-[180px]">{p.descricao}</div>
                      <div className="flex gap-1 mt-0.5">
                        <SubcategoriaChip slug={p.subcategoria} className="text-[10px]" />
                        {!prog.vinculado && <Badge variant="outline" className="text-[10px]">Legado</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><CartaoChip cartaoId={p.cartaoId} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(p.valorParcela)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">{prog.pagas}/{p.parcelas}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(prog.valorRestante)}</TableCell>
                    <TableCell className="hidden sm:table-cell capitalize">{mesTxt(prog.termino)}</TableCell>
                    <TableCell><Acoes {...acoesDe(item)} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ParcelamentoForm
        open={!!form}
        onOpenChange={(v) => { if (!v) setForm(null); }}
        parcelamento={form?.parcelamento ?? null}
        legado={form?.legado ?? null}
      />

      <AlertDialog open={!!quitando} onOpenChange={(v) => { if (!v) setQuitando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar antecipado?</AlertDialogTitle>
            <AlertDialogDescription>
              {quitando && `As ${quitando.prog.restantes} parcela(s) restantes (${formatCurrency(quitando.prog.valorRestante)}) serão movidas para a fatura aberta atual`}
              {quitarCartao && ` do ${quitarCartao.nome}`}. O parcelamento será marcado como quitado.
              {quitarCartao && !cartaoConfigurado(quitarCartao) && " Atenção: o cartão não tem fechamento/vencimento configurados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarQuitar}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!excluindo} onOpenChange={(v) => { if (!v) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{excluindo?.p.descricao}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.prog.vinculado
                ? "Escolha se as parcelas já pagas continuam em Lançamentos (desvinculadas) ou se tudo é apagado."
                : "Este parcelamento legado não tem lançamentos gerados. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {excluindo?.prog.vinculado && (
              <Button variant="outline" onClick={() => confirmarExcluir(true)}>Excluir parcelamento e parcelas futuras</Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmarExcluir(false)}
            >
              {excluindo?.prog.vinculado ? "Excluir tudo, inclusive parcelas passadas" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
