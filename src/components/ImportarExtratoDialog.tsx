import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MesAnoField } from "@/components/CamposData";
import { OpcaoCor } from "@/components/SubcategoriaChip";
import { formatCurrency, useFinanceData, type Lancamento, type NovoLancamento } from "@/lib/finance-store";
import { formatDiaMes } from "@/lib/format";
import { faturaAberta, parseISODate, type MesAno } from "@/lib/fatura";
import {
  converterLinhasCSV, detectarColunas, ehOFX, mapaCompleto, parseCSV, parseOFX, type CsvBruto, type LinhaImportada, type MapaColunas,
} from "@/lib/importacao";
import { descricoesParecidas, detectarParcela, normalizarTexto } from "@/lib/texto";
import { sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImportarExtratoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tipo = "cartao" | "conta";

interface LinhaPrevia {
  idx: number;
  data: string;
  descricao: string;
  valor: number;
  categoria: Lancamento["categoria"];
  subcategoria: string;
  incluir: boolean;
  duplicado: boolean;
  estorno: boolean;
  parcela: { atual: number; total: number } | null;
}

const SEM = "__nenhuma__";
const CAMPOS: { chave: keyof MapaColunas; label: string }[] = [
  { chave: "data", label: "Data" },
  { chave: "descricao", label: "Descrição" },
  { chave: "valor", label: "Valor" },
];

/** Subcategoria mais usada em lançamentos com descrição igual/parecida. */
function sugerirSubcategoria(descricao: string, historico: Lancamento[]): string {
  const n = normalizarTexto(descricao);
  const parecidos = historico.filter((l) => normalizarTexto(l.descricao) === n || descricoesParecidas(l.descricao, descricao));
  const contagem = parecidos.reduce((m, l) => m.set(l.subcategoria, (m.get(l.subcategoria) ?? 0) + 1), new Map<string, number>());
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** Cartão: tudo é compra; conta: negativo = saída variável, positivo = entrada. */
function categoriaImportada(tipo: string, valor: number): Lancamento["categoria"] {
  if (tipo === "cartao") return "cartao";
  return valor < 0 ? "variavel" : "entrada";
}

export function ImportarExtratoDialog({ open, onOpenChange }: ImportarExtratoDialogProps) {
  const { cartoes, lancamentos, subcategoriasAtivas, getCartao, inserirLancamentos } = useFinanceData();
  const [tipo, setTipo] = useState<Tipo>("cartao");
  const [cartaoId, setCartaoId] = useState("");
  const [destino, setDestino] = useState<MesAno>({ mes: new Date().getMonth(), ano: new Date().getFullYear() });
  const [csv, setCsv] = useState<CsvBruto | null>(null);
  const [mapa, setMapa] = useState<Partial<MapaColunas>>({});
  const [brutas, setBrutas] = useState<LinhaImportada[] | null>(null);
  const [previa, setPrevia] = useState<LinhaPrevia[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCsv(null);
    setMapa({});
    setBrutas(null);
    setPrevia([]);
    setNomeArquivo("");
  }, [open]);

  // Fatura de destino padrão = fatura aberta do cartão escolhido.
  useEffect(() => {
    const cartao = getCartao(cartaoId);
    if (!cartao) return;
    const f = faturaAberta(cartao, new Date());
    setDestino({ mes: f.mes, ano: f.ano });
  }, [cartaoId, getCartao]);

  const historico = useMemo(() => lancamentos.filter((l) => l.categoria !== "entrada" && l.subcategoria), [lancamentos]);

  // Monta a prévia sempre que as linhas ou o tipo mudam.
  useEffect(() => {
    if (!brutas) return;
    setPrevia(
      brutas.map((b, idx) => {
        const valor = Math.abs(b.valor);
        const estorno = tipo === "cartao" && b.valor < 0;
        const categoria = categoriaImportada(tipo, b.valor);
        const duplicado = lancamentos.some(
          (l) => l.data === b.data && Math.abs(l.valor - valor) <= 0.01 && descricoesParecidas(l.descricao, b.descricao),
        );
        return {
          idx,
          data: b.data,
          descricao: b.descricao,
          valor,
          categoria,
          subcategoria: categoria === "entrada" ? "" : sugerirSubcategoria(b.descricao, historico),
          incluir: !duplicado && !estorno,
          duplicado,
          estorno,
          parcela: detectarParcela(b.descricao),
        };
      }),
    );
  }, [brutas, tipo, lancamentos, historico]);

  const lerArquivo = async (arquivo: File) => {
    const texto = await arquivo.text();
    setNomeArquivo(arquivo.name);
    if (ehOFX(arquivo.name, texto)) {
      const linhas = parseOFX(texto);
      if (linhas.length === 0) toast.error("Nenhuma transação encontrada no OFX");
      setCsv(null);
      setBrutas(linhas);
      return;
    }
    const bruto = parseCSV(texto);
    const detectado = detectarColunas(bruto.cabecalho);
    setCsv(bruto);
    setMapa(detectado);
    setBrutas(mapaCompleto(detectado) ? converterLinhasCSV(bruto.linhas, detectado) : null);
  };

  const aplicarMapa = (m: Partial<MapaColunas>) => {
    setMapa(m);
    if (csv && mapaCompleto(m)) setBrutas(converterLinhasCSV(csv.linhas, m));
  };

  const atualizar = (idx: number, patch: Partial<LinhaPrevia>) =>
    setPrevia((prev) => prev.map((l) => (l.idx === idx ? { ...l, ...patch } : l)));

  const selecionadas = previa.filter((l) => l.incluir);
  const todasMarcadas = previa.length > 0 && selecionadas.length === previa.length;

  const importar = async () => {
    if (tipo === "cartao" && !cartaoId) { toast.error("Selecione o cartão"); return; }
    if (selecionadas.length === 0) { toast.error("Nenhuma linha selecionada"); return; }
    const novos: NovoLancamento[] = selecionadas.map((l) => {
      const d = parseISODate(l.data);
      const competencia = tipo === "cartao" ? destino : { mes: d.getMonth(), ano: d.getFullYear() };
      return {
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria,
        ...competencia,
        data: l.data,
        subcategoria: l.categoria === "entrada" ? null : l.subcategoria || null,
        cartaoId: tipo === "cartao" ? cartaoId : null,
        parcelamentoId: null,
        parcelaNum: null,
        recorrenciaId: null,
        status: "pago",
        reembolso: false,
        responsavel: null,
        observacao: null,
        origem: "importado",
      };
    });
    setImportando(true);
    const inseridos = await inserirLancamentos(novos);
    setImportando(false);
    if (!inseridos) return;
    toast.success(`${inseridos.length} lançamento(s) importado(s)`);
    onOpenChange(false);
  };

  const precisaMapear = csv && !mapaCompleto(mapa);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar extrato ou fatura</DialogTitle>
          <DialogDescription>Arquivos CSV ou OFX. Nada é salvo até você confirmar a prévia.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Tipo</Label>
            <ToggleGroup type="single" value={tipo} onValueChange={(v) => v && setTipo(v as Tipo)} className="justify-start">
              <ToggleGroupItem value="cartao" size="sm">Fatura de cartão</ToggleGroupItem>
              <ToggleGroupItem value="conta" size="sm">Extrato de conta</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {tipo === "cartao" ? (
            <>
              <div>
                <Label>Cartão</Label>
                <Select value={cartaoId} onValueChange={setCartaoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {cartoes.filter((c) => c.ativo).map((c) => (
                      <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fatura de destino</Label>
                <MesAnoField value={destino} onChange={setDestino} />
              </div>
            </>
          ) : (
            <p className="sm:col-span-2 text-xs text-muted-foreground self-end">
              No extrato de conta, cada lançamento entra no mês da própria data. Valores negativos viram saídas variáveis; positivos, entradas.
            </p>
          )}
        </div>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/40 text-sm">
          <FileUp className="h-5 w-5 text-muted-foreground" />
          {nomeArquivo || "Escolher arquivo (.csv ou .ofx)"}
          <input
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) lerArquivo(arquivo);
              e.target.value = "";
            }}
          />
        </label>

        {precisaMapear && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">Não identifiquei todas as colunas. Indique cada uma:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CAMPOS.map(({ chave, label }) => (
                <div key={chave}>
                  <Label>{label}</Label>
                  <Select
                    value={mapa[chave] != null ? String(mapa[chave]) : ""}
                    onValueChange={(v) => aplicarMapa({ ...mapa, [chave]: Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Coluna..." /></SelectTrigger>
                    <SelectContent>
                      {csv.cabecalho.map((h, i) => (
                        <SelectItem key={`${h}-${i}`} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {previa.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {selecionadas.length} de {previa.length} selecionada(s) · {formatCurrency(sumMoney(selecionadas.map((l) => l.valor)))}
              </span>
              <span className="text-xs text-muted-foreground">
                {previa.filter((l) => l.duplicado).length} provável(is) duplicado(s) desmarcado(s)
              </span>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={todasMarcadas}
                        onCheckedChange={(v) => setPrevia((prev) => prev.map((l) => ({ ...l, incluir: v === true })))}
                        aria-label="Marcar todas"
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="min-w-[180px]">Subcategoria</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.map((l) => (
                    <TableRow key={l.idx} className={cn(!l.incluir && "opacity-60")}>
                      <TableCell>
                        <Checkbox checked={l.incluir} onCheckedChange={(v) => atualizar(l.idx, { incluir: v === true })} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDiaMes(l.data)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="break-all">{l.descricao}</span>
                          {l.duplicado && (
                            <Badge variant="outline" className="text-[10px] border-warning/50 text-warning-foreground bg-warning/15">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Duplicado?
                            </Badge>
                          )}
                          {l.estorno && <Badge variant="outline" className="text-[10px]">Pagamento/estorno</Badge>}
                          {l.parcela && (
                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                              Parcela {l.parcela.atual}/{l.parcela.total}
                            </Badge>
                          )}
                          {l.categoria === "entrada" && <Badge variant="outline" className="text-[10px] text-success">Entrada</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-sm font-medium">{formatCurrency(l.valor)}</TableCell>
                      <TableCell>
                        {l.categoria !== "entrada" && (
                          <Select value={l.subcategoria || SEM} onValueChange={(v) => atualizar(l.idx, { subcategoria: v === SEM ? "" : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SEM}>Sem subcategoria</SelectItem>
                              {subcategoriasAtivas.map((s) => (
                                <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {previa.some((l) => l.parcela && l.incluir) && (
              <p className="text-xs text-muted-foreground">
                Linhas com "Parcela x/n" serão importadas como compras avulsas. Se o parcelamento já está cadastrado, desmarque-as para não duplicar.
              </p>
            )}
          </div>
        )}

        {brutas && previa.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">Nenhuma linha válida (data, descrição e valor) encontrada.</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={importar} disabled={importando || selecionadas.length === 0}>
            {importando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Importar {selecionadas.length > 0 && `(${selecionadas.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
