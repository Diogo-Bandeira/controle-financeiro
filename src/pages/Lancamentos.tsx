import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp, ChevronDown, CopyPlus, Download, FileUp, Filter, Loader2, Pencil, Plus, Receipt, Repeat, Search, Trash2, X,
} from "lucide-react";
import {
  useFinanceData, formatCurrency, CATEGORIAS, type Categoria, type Lancamento, type NovoLancamento, type OrigemLancamento,
} from "@/lib/finance-store";
import { OrcamentoCategorias } from "@/components/OrcamentoCategorias";
import { LancamentoForm } from "@/components/LancamentoForm";
import { RecorrenciasDialog } from "@/components/RecorrenciasDialog";
import { ImportarExtratoDialog } from "@/components/ImportarExtratoDialog";
import { CartaoChip, ChipCor, OpcaoCor, SubcategoriaChip } from "@/components/SubcategoriaChip";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DIAS_SEMANA_CURTOS, MESES, formatDataBR, formatDiaMes, formatDiaMesData, gravarLocalStorage, lerLocalStorage } from "@/lib/format";
import { compararMesAno, mesmoMes, parseISODate, somarMeses, toISODate, ultimoDia } from "@/lib/fatura";
import { sumMoney } from "@/lib/money";
import {
  MESES_RECORRENCIA, competenciaDoLancamento, janelaRecorrencia, lancamentosRecorrentesDoMes, mesDaData, pendentesDaRecorrenciaApos,
} from "@/lib/recorrencias";
import { excluirAPartirDe } from "@/lib/parcelamento-ops";
import { iniciais, normalizarTexto } from "@/lib/texto";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Filtros e ordenação ─────────────────────────────────────────────────────

type Aba = "todos" | Categoria;
type CampoOrdem = "data" | "valor" | "descricao" | "cartao" | "subcategoria";

interface Filtros {
  aba: Aba;
  busca: string;
  subcategorias: string[];
  cartoes: string[];
  origens: OrigemLancamento[];
  status: "todos" | "pago" | "pendente";
  responsavel: string;
  reembolso: "todos" | "sim" | "nao";
  valorMin: number | null;
  valorMax: number | null;
}

interface Ordenacao {
  campo: CampoOrdem;
  dir: "asc" | "desc";
}

const FILTROS_VAZIOS: Filtros = {
  aba: "todos", busca: "", subcategorias: [], cartoes: [], origens: [], status: "todos", responsavel: "", reembolso: "todos", valorMin: null, valorMax: null,
};
const ORDEM_PADRAO: Ordenacao = { campo: "data", dir: "desc" };
const CHAVE_FILTROS = "cf:lancamentos:filtros";
const CHAVE_ORDEM = "cf:lancamentos:ordem";
const TODOS = "__todos__";

const ABAS: { valor: Aba; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "entrada", label: "Entradas" },
  { valor: "conta_fixa", label: "Contas Fixas" },
  { valor: "cartao", label: "Cartão" },
  { valor: "variavel", label: "Variáveis" },
];
const ORIGENS: { valor: OrigemLancamento; label: string }[] = [
  { valor: "manual", label: "Manual" },
  { valor: "parcela", label: "Parcela" },
  { valor: "recorrente", label: "Recorrente" },
  { valor: "importado", label: "Importado" },
];
const CAMPOS_ORDEM: { valor: CampoOrdem; label: string }[] = [
  { valor: "data", label: "Data" },
  { valor: "valor", label: "Valor" },
  { valor: "descricao", label: "Descrição" },
  { valor: "cartao", label: "Cartão" },
  { valor: "subcategoria", label: "Subcategoria" },
];

const alternar = <T,>(lista: T[], item: T): T[] => (lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);

const semIdentidade = ({ createdBy: _c, ...l }: Lancamento): NovoLancamento => l;

const cabecalhoDia = (iso: string) => `${DIAS_SEMANA_CURTOS[parseISODate(iso).getDay()]}, ${formatDiaMes(iso)}`;

// CSV com ";" e vírgula decimal, BOM UTF-8 para o Excel.
function exportarCSV(itens: Lancamento[], nomeSub: (s: string | null) => string, nomeCartao: (id: string | null) => string, arquivo: string) {
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linhas = [
    ["Data", "Descrição", "Categoria", "Subcategoria", "Cartão", "Valor", "Status", "Responsável", "Origem", "Reembolso", "Observação"],
    ...itens.map((l) => [
      formatDataBR(l.data), l.descricao, CATEGORIAS[l.categoria], nomeSub(l.subcategoria), nomeCartao(l.cartaoId),
      l.valor.toFixed(2).replace(".", ","), l.status, l.responsavel ?? "", l.origem, l.reembolso ? "sim" : "", l.observacao ?? "",
    ]),
  ];
  const conteudo = String.fromCharCode(0xfeff) + linhas.map((l) => l.map(campo).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Componentes locais ──────────────────────────────────────────────────────

interface OpcaoMulti {
  valor: string;
  label: string;
  cor?: string;
}

function FiltroMulti({ titulo, opcoes, selecionados, onChange }: { titulo: string; opcoes: OpcaoMulti[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8", selecionados.length > 0 && "border-primary text-primary")}>
          {titulo}
          {selecionados.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{selecionados.length}</Badge>}
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2 max-h-72 overflow-y-auto" align="start">
        {opcoes.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhuma opção</p>}
        {opcoes.map((o) => (
          <label key={o.valor} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
            <Checkbox checked={selecionados.includes(o.valor)} onCheckedChange={() => onChange(alternar(selecionados, o.valor))} />
            {o.cor ? <OpcaoCor cor={o.cor} label={o.label} /> : o.label}
          </label>
        ))}
        {selecionados.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1 h-7" onClick={() => onChange([])}>Limpar</Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function Lancamentos() {
  const {
    loading, mesSelecionado, anoSelecionado, lancamentos, lancamentosMes, cartoes, subcategoriasAtivas, membros, parcelamentos,
    entradas, reembolsos, totalSaidas, saldo, getCartao, getSubcategoria, resumoFatura, progressoParcelamento, statusLancamentoCartao,
    inserirLancamentos, updateLancamentos, deleteLancamentos, salvarParcelamento,
    recorrencias, excecoes, lancamentoPago, salvarRecorrencia, registrarExcecoes, removerExcecoes,
  } = useFinanceData();

  const [filtros, setFiltros] = useState<Filtros>(() => ({ ...FILTROS_VAZIOS, ...lerLocalStorage<Partial<Filtros>>(CHAVE_FILTROS, {}) }));
  const [ordem, setOrdem] = useState<Ordenacao>(() => lerLocalStorage(CHAVE_ORDEM, ORDEM_PADRAO));
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ aberto: boolean; lancamento: Lancamento | null }>({ aberto: false, lancamento: null });
  const [recorrentes, setRecorrentes] = useState<{ aberto: boolean; aPartirDe: Lancamento | null }>({ aberto: false, aPartirDe: null });
  const [importar, setImportar] = useState(false);
  const [excluindo, setExcluindo] = useState<Lancamento[] | null>(null);
  const [confirmarCopia, setConfirmarCopia] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [gerandoRecorrencias, setGerandoRecorrencias] = useState(false);

  useEffect(() => gravarLocalStorage(CHAVE_FILTROS, filtros), [filtros]);
  useEffect(() => gravarLocalStorage(CHAVE_ORDEM, ordem), [ordem]);
  useEffect(() => setSelecionados(new Set()), [mesSelecionado, anoSelecionado]);

  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }));
  const nomeSub = useCallback((slug: string | null) => getSubcategoria(slug)?.label ?? "", [getSubcategoria]);
  const nomeCartao = useCallback((id: string | null) => getCartao(id)?.nome ?? "", [getCartao]);

  // Filtros exceto aba (usados também nos contadores das abas).
  const filtradosSemAba = useMemo(() => {
    const busca = normalizarTexto(filtros.busca);
    return lancamentosMes.filter((l) => {
      if (busca && !normalizarTexto(`${l.descricao} ${l.observacao ?? ""}`).includes(busca)) return false;
      if (filtros.subcategorias.length && !filtros.subcategorias.includes(l.subcategoria ?? "")) return false;
      if (filtros.cartoes.length && !filtros.cartoes.includes(l.cartaoId ?? "")) return false;
      if (filtros.origens.length && !filtros.origens.includes(l.origem)) return false;
      if (filtros.status !== "todos" && l.status !== filtros.status) return false;
      if (filtros.responsavel && l.responsavel !== filtros.responsavel) return false;
      if (filtros.reembolso !== "todos" && l.reembolso !== (filtros.reembolso === "sim")) return false;
      if (filtros.valorMin != null && l.valor < filtros.valorMin) return false;
      if (filtros.valorMax != null && l.valor > filtros.valorMax) return false;
      return true;
    });
  }, [lancamentosMes, filtros]);

  const filtrados = useMemo(() => {
    const daAba = filtros.aba === "todos" ? filtradosSemAba : filtradosSemAba.filter((l) => l.categoria === filtros.aba);
    const chave: Record<CampoOrdem, (l: Lancamento) => string | number> = {
      data: (l) => l.data,
      valor: (l) => l.valor,
      descricao: (l) => normalizarTexto(l.descricao),
      cartao: (l) => normalizarTexto(nomeCartao(l.cartaoId)),
      subcategoria: (l) => normalizarTexto(nomeSub(l.subcategoria)),
    };
    const f = chave[ordem.campo];
    const sinal = ordem.dir === "asc" ? 1 : -1;
    return [...daAba].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      if (va === vb) return a.descricao.localeCompare(b.descricao);
      return (va < vb ? -1 : 1) * sinal;
    });
  }, [filtradosSemAba, filtros.aba, ordem, nomeCartao, nomeSub]);

  const totalFiltrado = sumMoney(filtrados.map((l) => l.valor));
  const filtrosAtivos =
    !!filtros.busca || filtros.subcategorias.length + filtros.cartoes.length + filtros.origens.length > 0 ||
    filtros.status !== "todos" || !!filtros.responsavel || filtros.reembolso !== "todos" || filtros.valorMin != null || filtros.valorMax != null;

  // Agrupamento por dia (estilo extrato) quando ordenado por data.
  const grupos = useMemo(() => {
    if (ordem.campo !== "data") return [{ titulo: null as string | null, itens: filtrados }];
    return filtrados.reduce<{ titulo: string | null; itens: Lancamento[] }[]>((acc, l) => {
      const titulo = cabecalhoDia(l.data);
      const ultimo = acc[acc.length - 1];
      if (ultimo?.titulo === titulo) ultimo.itens.push(l);
      else acc.push({ titulo, itens: [l] });
      return acc;
    }, []);
  }, [filtrados, ordem.campo]);

  // Resumos da aba Cartão
  const itensCartao = filtradosSemAba.filter((l) => l.categoria === "cartao");
  const totaisPorCartao = useMemo(() => {
    const mapa = itensCartao.reduce((m, l) => m.set(l.cartaoId ?? "", [...(m.get(l.cartaoId ?? "") ?? []), l.valor]), new Map<string, number[]>());
    return [...mapa.entries()].map(([id, valores]) => ({
      id,
      total: sumMoney(valores),
      vencimento: id ? resumoFatura(id, { mes: mesSelecionado, ano: anoSelecionado })?.dataVencimento ?? null : null,
    }));
  }, [itensCartao, resumoFatura, mesSelecionado, anoSelecionado]);
  const totaisPorSubcategoria = subcategoriasAtivas
    .map((s) => ({ ...s, total: sumMoney(itensCartao.filter((l) => l.subcategoria === s.slug).map((l) => l.valor)) }))
    .filter((s) => s.total > 0);

  // ─── Seleção e ações em massa ──────────────────────────────────────────

  const selecionadosLista = filtrados.filter((l) => selecionados.has(l.id));
  const todosMarcados = filtrados.length > 0 && selecionadosLista.length === filtrados.length;

  const alternarSelecao = (id: string) =>
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });

  const aplicarEmLote = async (transformar: (l: Lancamento) => Lancamento, mensagem: string) => {
    const ok = await updateLancamentos(selecionadosLista.map(transformar));
    if (!ok) return;
    toast.success(`${selecionadosLista.length} ${mensagem}`);
    setSelecionados(new Set());
  };

  const mudarCartaoEmLote = (cartaoId: string) => {
    const cartao = getCartao(cartaoId);
    aplicarEmLote((l) => {
      if (l.categoria !== "cartao" || l.parcelamentoId) return l;
      return { ...l, cartaoId, ...competenciaDoLancamento("cartao", parseISODate(l.data), cartao) };
    }, "lançamento(s) de cartão atualizado(s) (parcelas não mudam)");
  };

  // ─── Exclusão com Desfazer ──────────────────────────────────────────────

  // Recorrentes excluídos viram exceção do mês (senão o gerador os recriaria).
  const excluir = async (alvos: Lancamento[]) => {
    setExcluindo(null);
    const excecoesIds = await registrarExcecoes(alvos);
    if (!excecoesIds) return;
    const removidos = await deleteLancamentos(alvos.map((l) => l.id));
    if (removidos.length === 0) {
      await removerExcecoes(excecoesIds);
      return;
    }
    setSelecionados(new Set());
    toast.success(`${removidos.length} lançamento(s) excluído(s)`, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const reinseridos = await inserirLancamentos(removidos.map(semIdentidade));
          if (reinseridos && (await removerExcecoes(excecoesIds))) toast.success("Exclusão desfeita");
        },
      },
    });
  };

  // Apaga este e os pendentes seguintes; a recorrência termina no mês anterior ao da data deste.
  const excluirRecorrenteEProximos = async (l: Lancamento) => {
    setExcluindo(null);
    const rec = recorrencias.find((r) => r.id === l.recorrenciaId);
    if (!rec) return;
    const removidos = [l, ...pendentesDaRecorrenciaApos(rec.id, lancamentos, l.data, lancamentoPago)];
    const mesLanc = mesDaData(l.data);
    const anteriorAoLanc = somarMeses(mesLanc.mes, mesLanc.ano, -1);
    const fimAtual = rec.fimAno != null && rec.fimMes != null ? { mes: rec.fimMes, ano: rec.fimAno } : null;
    const fim = fimAtual && compararMesAno(fimAtual, anteriorAoLanc) < 0 ? fimAtual : anteriorAoLanc;
    const ok = await salvarRecorrencia({ ...rec, fimMes: fim.mes, fimAno: fim.ano }, [], removidos.map((x) => x.id));
    if (!ok) return;
    toast.success(`${removidos.length} lançamento(s) excluído(s); recorrência encerrada em ${MESES[fim.mes]}/${fim.ano}`, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const reinseridos = await inserirLancamentos(removidos.map(semIdentidade));
          if (reinseridos && (await salvarRecorrencia(rec))) toast.success("Exclusão desfeita");
        },
      },
    });
  };

  const excluirParcelaEProximas = async (l: Lancamento) => {
    setExcluindo(null);
    const p = parcelamentos.find((x) => x.id === l.parcelamentoId);
    if (!p) return;
    const payload = excluirAPartirDe(p, progressoParcelamento(p).lancamentos, l.parcelaNum ?? 1, statusLancamentoCartao);
    if (await salvarParcelamento(payload)) toast.success(`Parcelas a partir da ${l.parcelaNum}ª excluídas`);
  };

  const parcelaUnica = excluindo?.length === 1 && excluindo[0].parcelamentoId ? excluindo[0] : null;
  const recorrenteUnico =
    excluindo?.length === 1 && !excluindo[0].parcelamentoId && recorrencias.some((r) => r.id === excluindo[0].recorrenciaId) ? excluindo[0] : null;
  const temRecorrentes = !!excluindo?.some((l) => l.recorrenciaId);

  // ─── Recorrências fora da janela automática ──────────────────────────────

  const selecionado = { mes: mesSelecionado, ano: anoSelecionado };
  const foraDaJanela = !janelaRecorrencia(new Date()).some((m) => mesmoMes(m, selecionado));
  const recorrentesFaltando = foraDaJanela
    ? lancamentosRecorrentesDoMes(recorrencias, lancamentos, selecionado, new Date(), cartoes, excecoes)
    : [];

  const gerarRecorrenciasDoMes = async () => {
    setGerandoRecorrencias(true);
    const inseridos = await inserirLancamentos(recorrentesFaltando);
    setGerandoRecorrencias(false);
    if (inseridos) toast.success(`${inseridos.length} lançamento(s) recorrente(s) gerado(s) em ${MESES[mesSelecionado]}`);
  };

  // ─── Copiar mês anterior ────────────────────────────────────────────────

  const anterior = somarMeses(mesSelecionado, anoSelecionado, -1);
  const fonteCopia = lancamentos.filter(
    (l) => l.mes === anterior.mes && l.ano === anterior.ano && l.origem !== "parcela" && l.origem !== "recorrente" && !l.parcelamentoId && !l.recorrenciaId,
  );

  const pedirCopia = () => {
    if (fonteCopia.length === 0) {
      toast.error(`Nada para copiar de ${MESES[anterior.mes]}/${anterior.ano} (parcelas e recorrências são ignoradas)`);
      return;
    }
    if (lancamentosMes.length > 0) setConfirmarCopia(true);
    else copiar();
  };

  const copiar = async () => {
    setConfirmarCopia(false);
    setCopiando(true);
    const hojeIso = toISODate(new Date());
    const novos: NovoLancamento[] = fonteCopia.map((l) => {
      const d = parseISODate(l.data);
      const alvo = somarMeses(d.getMonth(), d.getFullYear(), 1);
      const novaData = new Date(alvo.ano, alvo.mes, Math.min(d.getDate(), ultimoDia(alvo.ano, alvo.mes)));
      const iso = toISODate(novaData);
      return {
        ...semIdentidade(l),
        id: undefined,
        data: iso,
        ...competenciaDoLancamento(l.categoria, novaData, getCartao(l.cartaoId)),
        status: l.categoria === "conta_fixa" && iso > hojeIso ? "pendente" : l.status,
        origem: "manual",
      };
    });
    const inseridos = await inserirLancamentos(novos);
    setCopiando(false);
    if (inseridos) toast.success(`${inseridos.length} lançamento(s) copiado(s) de ${MESES[anterior.mes]}`);
  };

  if (loading) return <PaginaCarregando cards={3} />;

  const contagemAba = (a: Aba) => (a === "todos" ? filtradosSemAba.length : filtradosSemAba.filter((l) => l.categoria === a).length);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Lançamentos</h2>
          <p className="text-muted-foreground text-sm">{MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setRecorrentes({ aberto: true, aPartirDe: null })}>
            <Repeat className="h-4 w-4 mr-1" /> Recorrentes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportar(true)}>
            <FileUp className="h-4 w-4 mr-1" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={pedirCopia} disabled={copiando}>
            {copiando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CopyPlus className="h-4 w-4 mr-1" />}
            Copiar mês anterior
          </Button>
          <Button size="sm" onClick={() => setForm({ aberto: true, lancamento: null })}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      {recorrentesFaltando.length > 0 && (
        <div className="text-xs rounded-md border border-warning/40 bg-warning/10 p-2 flex flex-wrap gap-2 items-center">
          <Repeat className="h-4 w-4 text-warning shrink-0" />
          <span className="flex-1 min-w-[200px]">
            {recorrentesFaltando.length} recorrência(s) vigente(s) sem lançamento neste mês (fora dos próximos {MESES_RECORRENCIA} meses, não é gerado automaticamente).
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={gerarRecorrenciasDoMes} disabled={gerandoRecorrencias}>
            {gerandoRecorrencias && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Gerar recorrências deste mês
          </Button>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="finance-card text-center p-3 sm:p-5">
          <p className="stat-label">Entradas</p>
          <p className="text-base sm:text-lg font-bold text-success">{formatCurrency(entradas)}</p>
          {reembolsos > 0 && <p className="text-[11px] text-muted-foreground">reembolsos {formatCurrency(reembolsos)}</p>}
        </div>
        <div className="finance-card text-center p-3 sm:p-5">
          <p className="stat-label">Saídas</p>
          <p className="text-base sm:text-lg font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
        </div>
        <div className="finance-card text-center p-3 sm:p-5">
          <p className="stat-label">Saldo</p>
          <p className={cn("text-base sm:text-lg font-bold", saldo >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(saldo)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-3 min-w-0">
          {/* Abas-filtro */}
          <Tabs value={filtros.aba} onValueChange={(v) => setFiltro("aba", v as Aba)}>
            <TabsList className="w-full flex flex-wrap h-auto gap-1">
              {ABAS.map((a) => (
                <TabsTrigger key={a.valor} value={a.valor} className="text-xs flex-1 min-w-[80px]">
                  {a.label} <span className="ml-1 text-muted-foreground">({contagemAba(a.valor)})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Busca, filtros e ordenação */}
          <div className="finance-card p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8"
                  placeholder="Buscar descrição ou observação"
                  value={filtros.busca}
                  onChange={(e) => setFiltro("busca", e.target.value)}
                />
              </div>
              <Button variant={mostrarFiltros ? "secondary" : "outline"} size="sm" className="h-8" onClick={() => setMostrarFiltros(!mostrarFiltros)}>
                <Filter className="h-3.5 w-3.5 mr-1" /> Filtros
              </Button>
              <Select value={ordem.campo} onValueChange={(v) => setOrdem((o) => ({ ...o, campo: v as CampoOrdem }))}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPOS_ORDEM.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setOrdem((o) => ({ ...o, dir: o.dir === "asc" ? "desc" : "asc" }))}
                title={ordem.dir === "asc" ? "Crescente" : "Decrescente"}
              >
                <ArrowDownUp className="h-3.5 w-3.5 mr-1" /> {ordem.dir === "asc" ? "Asc" : "Desc"}
              </Button>
            </div>

            {mostrarFiltros && (
              <div className="flex flex-wrap gap-2 items-end">
                <FiltroMulti
                  titulo="Subcategorias"
                  opcoes={subcategoriasAtivas.map((s) => ({ valor: s.slug, label: s.label, cor: s.cor }))}
                  selecionados={filtros.subcategorias}
                  onChange={(v) => setFiltro("subcategorias", v)}
                />
                <FiltroMulti
                  titulo="Cartões"
                  opcoes={cartoes.map((c) => ({ valor: c.id, label: c.nome, cor: c.cor ?? "#64748B" }))}
                  selecionados={filtros.cartoes}
                  onChange={(v) => setFiltro("cartoes", v)}
                />
                <FiltroMulti
                  titulo="Origem"
                  opcoes={ORIGENS}
                  selecionados={filtros.origens}
                  onChange={(v) => setFiltro("origens", v as OrigemLancamento[])}
                />
                <Select value={filtros.status} onValueChange={(v) => setFiltro("status", v as Filtros["status"])}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Status: todos</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtros.responsavel || TODOS} onValueChange={(v) => setFiltro("responsavel", v === TODOS ? "" : v)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Responsável: todos</SelectItem>
                    {membros.map((m) => <SelectItem key={m.userId} value={m.nome}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filtros.reembolso} onValueChange={(v) => setFiltro("reembolso", v as Filtros["reembolso"])}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Reembolso: todos</SelectItem>
                    <SelectItem value="sim">Só reembolsos</SelectItem>
                    <SelectItem value="nao">Sem reembolsos</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-end gap-1">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Mín.</Label>
                    <MoneyInput className="h-8 w-[110px] text-xs" value={filtros.valorMin} onChange={(v) => setFiltro("valorMin", v || null)} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Máx.</Label>
                    <MoneyInput className="h-8 w-[110px] text-xs" value={filtros.valorMax} onChange={(v) => setFiltro("valorMax", v || null)} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {filtrados.length} lançamento(s) · total <strong className="text-foreground">{formatCurrency(totalFiltrado)}</strong>
              </span>
              <div className="flex gap-1">
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFiltros((f) => ({ ...FILTROS_VAZIOS, aba: f.aba }))}>
                    <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={filtrados.length === 0}
                  onClick={() => exportarCSV(filtrados, nomeSub, nomeCartao, `lancamentos-${anoSelecionado}-${String(mesSelecionado + 1).padStart(2, "0")}.csv`)}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
                </Button>
              </div>
            </div>
          </div>

          {/* Resumo da aba Cartão */}
          {filtros.aba === "cartao" && (totaisPorCartao.length > 0 || totaisPorSubcategoria.length > 0) && (
            <div className="finance-card p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {totaisPorCartao.map((c) => (
                  <div key={c.id || "sem"} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border bg-muted/30">
                    {c.id ? <CartaoChip cartaoId={c.id} /> : <span className="font-medium text-muted-foreground">Sem cartão</span>}
                    <span className="font-bold">{formatCurrency(c.total)}</span>
                    {c.vencimento && <span className="text-muted-foreground">· vence {formatDiaMesData(c.vencimento)}</span>}
                  </div>
                ))}
              </div>
              {totaisPorSubcategoria.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed">
                  {totaisPorSubcategoria.map((s) => (
                    <ChipCor key={s.slug} cor={s.cor} label={s.label} className="text-xs px-2.5 py-1">
                      <span className="font-bold">{formatCurrency(s.total)}</span>
                    </ChipCor>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Barra de ações em massa */}
          {selecionadosLista.length > 0 && (
            <div className="sticky top-2 z-10 finance-card p-2 flex flex-wrap items-center gap-2 border-primary/40 shadow-md">
              <span className="text-xs font-medium px-1">{selecionadosLista.length} selecionado(s)</span>
              <Select value="" onValueChange={(v) => aplicarEmLote((l) => (l.categoria === "entrada" ? l : { ...l, subcategoria: v }), "lançamento(s) atualizado(s)")}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Subcategoria..." /></SelectTrigger>
                <SelectContent>
                  {subcategoriasAtivas.map((s) => <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>)}
                </SelectContent>
              </Select>
              <Select value="" onValueChange={mudarCartaoEmLote}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Cartão..." /></SelectTrigger>
                <SelectContent>
                  {cartoes.filter((c) => c.ativo).map((c) => <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>)}
                </SelectContent>
              </Select>
              <Select value="" onValueChange={(v) => aplicarEmLote((l) => ({ ...l, responsavel: v === TODOS ? null : v }), "lançamento(s) atualizado(s)")}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Responsável..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Sem responsável</SelectItem>
                  {membros.map((m) => <SelectItem key={m.userId} value={m.nome}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => aplicarEmLote((l) => ({ ...l, status: "pago" }), "marcado(s) como pago(s)")}>
                Pago
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => aplicarEmLote((l) => ({ ...l, status: "pendente" }), "marcado(s) como pendente(s)")}>
                Pendente
              </Button>
              <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setExcluindo(selecionadosLista)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => setSelecionados(new Set())} aria-label="Limpar seleção">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Lista */}
          <div className="finance-card p-0 overflow-hidden">
            {filtrados.length === 0 ? (
              <EstadoVazio
                icone={Receipt}
                titulo={lancamentosMes.length === 0 ? "Nenhum lançamento neste mês" : "Nenhum lançamento com esses filtros"}
                descricao={lancamentosMes.length === 0 ? "Adicione um lançamento, importe um extrato ou copie o mês anterior." : undefined}
                acao={
                  lancamentosMes.length === 0 ? (
                    <Button size="sm" onClick={() => setForm({ aberto: true, lancamento: null })}><Plus className="h-4 w-4 mr-1" /> Novo lançamento</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button>
                  )
                }
              />
            ) : (
              <>
                <label className="flex items-center gap-2 px-3 py-2 border-b text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={todosMarcados}
                    onCheckedChange={(v) => setSelecionados(v === true ? new Set(filtrados.map((l) => l.id)) : new Set())}
                  />
                  Selecionar todos
                </label>
                {grupos.map((g, gi) => (
                  <div key={g.titulo ?? gi}>
                    {g.titulo && (
                      <div className="flex justify-between px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                        <span>{g.titulo}</span>
                        <span>{formatCurrency(sumMoney(g.itens.map((l) => (l.categoria === "entrada" ? l.valor : -l.valor))))}</span>
                      </div>
                    )}
                    <div className="divide-y">
                      {g.itens.map((l) => (
                        <LinhaLancamento
                          key={l.id}
                          l={l}
                          totalParcelas={parcelamentos.find((p) => p.id === l.parcelamentoId)?.parcelas}
                          selecionado={selecionados.has(l.id)}
                          onSelecionar={() => alternarSelecao(l.id)}
                          onEditar={() => setForm({ aberto: true, lancamento: l })}
                          onRecorrente={() => setRecorrentes({ aberto: true, aPartirDe: l })}
                          onExcluir={() => setExcluindo([l])}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <OrcamentoCategorias className="lg:sticky lg:top-4" />
      </div>

      <LancamentoForm
        open={form.aberto}
        onOpenChange={(v) => setForm((f) => ({ ...f, aberto: v }))}
        lancamento={form.lancamento}
      />
      <RecorrenciasDialog
        open={recorrentes.aberto}
        onOpenChange={(v) => setRecorrentes((r) => ({ ...r, aberto: v }))}
        aPartirDe={recorrentes.aPartirDe}
      />
      <ImportarExtratoDialog open={importar} onOpenChange={setImportar} />

      {/* Excluir */}
      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {parcelaUnica
                ? `Excluir parcela ${parcelaUnica.parcelaNum}/${parcelamentos.find((p) => p.id === parcelaUnica.parcelamentoId)?.parcelas ?? "?"}?`
                : `Excluir ${excluindo?.length ?? 0} lançamento(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {parcelaUnica && `"${parcelaUnica.descricao}" faz parte de um parcelamento. Excluir só esta parcela ou também as próximas ainda não pagas?`}
              {recorrenteUnico &&
                `"${recorrenteUnico.descricao}" é recorrente. "Só este mês" não volta a ser gerado neste mês; "Este e os próximos" também remove os pendentes seguintes e encerra a recorrência no mês anterior.`}
              {!parcelaUnica && !recorrenteUnico &&
                `${temRecorrentes ? "Os recorrentes não serão gerados de novo nesses meses. " : ""}Você poderá desfazer logo após a exclusão.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {recorrenteUnico && (
              <>
                <Button variant="outline" onClick={() => excluir([recorrenteUnico])}>Só este mês</Button>
                <AlertDialogAction
                  onClick={() => excluirRecorrenteEProximos(recorrenteUnico)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Este e os próximos
                </AlertDialogAction>
              </>
            )}
            {!recorrenteUnico && (parcelaUnica ? (
              <>
                <Button variant="outline" onClick={() => excluir([parcelaUnica])}>Só esta</Button>
                <AlertDialogAction
                  onClick={() => excluirParcelaEProximas(parcelaUnica)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Esta e as próximas
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => excluindo && excluir(excluindo)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copiar mês anterior */}
      <AlertDialog open={confirmarCopia} onOpenChange={setConfirmarCopia}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar {fonteCopia.length} lançamento(s) de {MESES[anterior.mes]}?</AlertDialogTitle>
            <AlertDialogDescription>
              Já existem {lancamentosMes.length} lançamentos neste mês. Copiar mesmo assim? Parcelas e recorrências não são copiadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={copiar}>Copiar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface LinhaLancamentoProps {
  l: Lancamento;
  totalParcelas?: number;
  selecionado: boolean;
  onSelecionar: () => void;
  onEditar: () => void;
  onRecorrente: () => void;
  onExcluir: () => void;
}

function LinhaLancamento({ l, totalParcelas, selecionado, onSelecionar, onEditar, onRecorrente, onExcluir }: LinhaLancamentoProps) {
  const pendente = l.status === "pendente";
  const entrada = l.categoria === "entrada";
  const previsto = l.origem === "recorrente" && l.data > toISODate(new Date());
  return (
    <div className={cn("flex items-start gap-2 px-3 py-2.5", pendente && "border-l-2 border-l-warning bg-warning/5", selecionado && "bg-primary/5")}>
      <Checkbox checked={selecionado} onCheckedChange={onSelecionar} className="mt-0.5" aria-label="Selecionar" />
      <span className="text-xs text-muted-foreground w-10 shrink-0 mt-0.5">{formatDiaMes(l.data)}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm truncate">{l.descricao}</span>
          {l.responsavel && (
            <span
              title={l.responsavel}
              className="h-5 w-5 shrink-0 rounded-full bg-secondary text-secondary-foreground text-[9px] font-bold flex items-center justify-center"
            >
              {iniciais(l.responsavel)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <SubcategoriaChip slug={l.subcategoria} className="text-[10px] py-0" />
          <CartaoChip cartaoId={l.cartaoId} className="text-[10px] py-0" />
          {l.parcelamentoId && (
            <Link
              to={`/parcelamentos#${l.parcelamentoId}`}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:underline"
            >
              Parcela {l.parcelaNum}/{totalParcelas ?? "?"}
            </Link>
          )}
          {!l.parcelamentoId && l.recorrenciaId && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground inline-flex items-center gap-0.5">
              <Repeat className="h-2.5 w-2.5" /> Recorrente
            </span>
          )}
          {previsto && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-dashed border-primary/50 text-primary">Previsto</span>
          )}
          {l.origem === "importado" && <span className="text-[10px] text-muted-foreground">importado</span>}
          {entrada && l.reembolso && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">Reembolso</span>
          )}
          {pendente && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground">Pendente</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <span className={cn("font-medium text-sm whitespace-nowrap mr-1", entrada ? "text-success" : "")}>
          {entrada ? "+" : ""}{formatCurrency(l.valor)}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditar} title="Editar">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        {!l.parcelamentoId && !l.recorrenciaId && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden sm:inline-flex" onClick={onRecorrente} title="Tornar recorrente">
            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExcluir} title="Excluir">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
