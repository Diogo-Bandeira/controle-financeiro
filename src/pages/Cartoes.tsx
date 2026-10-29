import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CreditCard, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CartaoFormDialog } from "@/components/CartaoFormDialog";
import { MesAnoField } from "@/components/CamposData";
import { SubcategoriaChip } from "@/components/SubcategoriaChip";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { formatCurrency, useFinanceData, type Cartao } from "@/lib/finance-store";
import { formatDiaMes, formatDiaMesData, formatMesAno } from "@/lib/format";
import { cartaoConfigurado, diasEntre, faturaAberta, somarMeses, type MesAno, type StatusFatura } from "@/lib/fatura";
import { limiteUsadoCartao } from "@/lib/store/derivados";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_FATURA: Record<StatusFatura, { label: string; classe: string }> = {
  aberta: { label: "Aberta", classe: "bg-primary/10 text-primary border-primary/30" },
  fechada: { label: "Fechada", classe: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning" },
  paga: { label: "Paga", classe: "bg-success/10 text-success border-success/30" },
  futura: { label: "Futura", classe: "bg-muted text-muted-foreground border-border" },
};

function StatusBadge({ status }: { status: StatusFatura }) {
  const s = STATUS_FATURA[status];
  return <Badge variant="outline" className={s.classe}>{s.label}</Badge>;
}

function textoFechamento(dias: number) {
  if (dias <= 0) return "fecha hoje";
  return dias === 1 ? "fecha amanhã" : `fecha em ${dias} dias`;
}

function CartaoCard({ cartao, onEditar, onExcluir, onFatura }: {
  cartao: Cartao;
  onEditar: () => void;
  onExcluir: () => void;
  onFatura: (competencia: MesAno) => void;
}) {
  const { resumoFatura, lancamentos, faturasPagas } = useFinanceData();
  const hoje = new Date();
  const configurado = cartaoConfigurado(cartao);
  const abertaRef = faturaAberta(cartao, hoje);
  const aberta = resumoFatura(cartao.id, abertaRef);
  const proximaRef = somarMeses(abertaRef.mes, abertaRef.ano, 1);
  const proxima = resumoFatura(cartao.id, proximaRef);
  const usado = limiteUsadoCartao(cartao, lancamentos, faturasPagas, hoje);
  const cor = cartao.cor ?? "#64748B";

  return (
    <div className={cn("finance-card flex flex-col gap-4", !cartao.ativo && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cor + "22" }}>
            <CreditCard className="h-5 w-5" style={{ color: cor }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{cartao.nome}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {[cartao.banco, cartao.titular].filter(Boolean).join(" · ") || "—"}
              {!cartao.ativo && " · inativo"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditar} title="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExcluir} title="Excluir">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {!configurado && (
        <button
          type="button"
          onClick={onEditar}
          className="text-left text-xs rounded-md border border-warning/40 bg-warning/10 p-2 flex gap-2 items-start"
        >
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span>Configure fechamento e vencimento para gerar parcelas e calcular faturas.</span>
        </button>
      )}

      {aberta && (
        <button type="button" onClick={() => onFatura(abertaRef)} className="text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="capitalize">Fatura aberta · {formatMesAno(aberta.mes, aberta.ano)}</span>
            <StatusBadge status={aberta.status} />
          </div>
          <p className="text-xl font-bold">{formatCurrency(aberta.total)}</p>
          {configurado && (
            <p className="text-xs text-muted-foreground">
              {textoFechamento(diasEntre(hoje, aberta.dataFechamento))} · vence {formatDiaMesData(aberta.dataVencimento)}
            </p>
          )}
        </button>
      )}

      {proxima && (
        <button type="button" onClick={() => onFatura(proximaRef)} className="text-left flex justify-between text-sm hover:underline">
          <span className="text-muted-foreground capitalize">Próxima fatura ({formatMesAno(proxima.mes, proxima.ano)})</span>
          <span className="font-medium">{formatCurrency(proxima.total)}</span>
        </button>
      )}

      {cartao.limite != null && cartao.limite > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Limite usado {formatCurrency(usado)}</span>
            <span className={cn("font-medium", usado > cartao.limite && "text-destructive")}>
              disponível {formatCurrency(cartao.limite - usado)}
            </span>
          </div>
          <Progress value={Math.min((usado / cartao.limite) * 100, 100)} className={cn("h-1.5", usado > cartao.limite && "[&>div]:bg-destructive")} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2 border-t">
        <span>{configurado ? `Fecha dia ${cartao.diaFechamento} · vence dia ${cartao.diaVencimento}` : "Sem datas configuradas"}</span>
        {configurado && <span>Melhor dia de compra: <strong className="text-foreground">{cartao.diaFechamento}</strong></span>}
      </div>
    </div>
  );
}

function FaturaDetalhe({ cartao, competencia, onCompetencia, onClose }: {
  cartao: Cartao | null;
  competencia: MesAno;
  onCompetencia: (c: MesAno) => void;
  onClose: () => void;
}) {
  const { resumoFatura, parcelamentos, marcarFaturaPaga, desmarcarFaturaPaga } = useFinanceData();
  const [salvando, setSalvando] = useState(false);
  const resumo = cartao ? resumoFatura(cartao.id, competencia) : null;
  const itens = [...(resumo?.lancamentos ?? [])].sort((a, b) => a.data.localeCompare(b.data));

  const alternarPaga = async () => {
    if (!cartao || !resumo) return;
    setSalvando(true);
    const ok = resumo.marcadaPaga ? await desmarcarFaturaPaga(cartao.id, competencia) : await marcarFaturaPaga(cartao.id, competencia);
    setSalvando(false);
    if (ok) toast.success(resumo.marcadaPaga ? "Fatura desmarcada" : "Fatura marcada como paga");
  };

  return (
    <Sheet open={!!cartao} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Fatura · {cartao?.nome}</SheetTitle>
          {resumo && cartaoConfigurado(cartao) && (
            <SheetDescription>
              Fecha {formatDiaMesData(resumo.dataFechamento)} · vence {formatDiaMesData(resumo.dataVencimento)}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onCompetencia(somarMeses(competencia.mes, competencia.ano, -1))} aria-label="Fatura anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MesAnoField value={competencia} onChange={onCompetencia} className="flex-1" />
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onCompetencia(somarMeses(competencia.mes, competencia.ano, 1))} aria-label="Próxima fatura">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {resumo && (
          <>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{formatCurrency(resumo.total)}</p>
              </div>
              <StatusBadge status={resumo.status} />
            </div>

            <Button variant={resumo.marcadaPaga ? "outline" : "default"} onClick={alternarPaga} disabled={salvando}>
              {resumo.marcadaPaga ? "Desmarcar pagamento" : "Marcar fatura como paga"}
            </Button>

            {itens.length === 0 ? (
              <EstadoVazio icone={Receipt} titulo="Nenhuma compra nesta fatura" />
            ) : (
              <div className="divide-y">
                {itens.map((l) => {
                  const parc = l.parcelamentoId ? parcelamentos.find((p) => p.id === l.parcelamentoId) : null;
                  return (
                    <div key={l.id} className="py-2.5 flex items-start gap-3">
                      <span className="text-xs text-muted-foreground w-11 shrink-0 pt-0.5">{formatDiaMes(l.data)}</span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm truncate">{l.descricao}</p>
                        <div className="flex flex-wrap gap-1">
                          <SubcategoriaChip slug={l.subcategoria} />
                          {l.parcelaNum != null && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Parcela {l.parcelaNum}/{parc?.parcelas ?? "?"}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium shrink-0">{formatCurrency(l.valor)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Cartoes() {
  const { cartoes, loading, deleteCartao, lancamentos } = useFinanceData();
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Cartao | null>(null);
  const [excluindo, setExcluindo] = useState<Cartao | null>(null);
  const [detalhe, setDetalhe] = useState<{ cartao: Cartao; competencia: MesAno } | null>(null);

  if (loading) return <PaginaCarregando cards={3} />;

  const ordenados = [...cartoes].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
  const semDatas = cartoes.filter((c) => c.ativo && !cartaoConfigurado(c)).length;
  const usosExcluindo = excluindo ? lancamentos.filter((l) => l.cartaoId === excluindo.id).length : 0;

  const abrirNovo = () => { setEditando(null); setFormAberto(true); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Cartões</h2>
          <p className="text-muted-foreground text-sm">Faturas, limites e datas de fechamento</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Novo cartão</Button>
      </div>

      {semDatas > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>
            {semDatas} cartão(ões) sem fechamento/vencimento. Configure para que parcelas e faturas sejam calculadas corretamente.
          </span>
        </div>
      )}

      {ordenados.length === 0 ? (
        <div className="finance-card">
          <EstadoVazio
            icone={CreditCard}
            titulo="Cadastre seu primeiro cartão"
            descricao="Com o dia de fechamento e vencimento, as compras e parcelas caem automaticamente na fatura certa."
            acao={<Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Novo cartão</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ordenados.map((c) => (
            <CartaoCard
              key={c.id}
              cartao={c}
              onEditar={() => { setEditando(c); setFormAberto(true); }}
              onExcluir={() => setExcluindo(c)}
              onFatura={(competencia) => setDetalhe({ cartao: c, competencia })}
            />
          ))}
        </div>
      )}

      <CartaoFormDialog open={formAberto} onOpenChange={setFormAberto} cartao={editando} />

      <FaturaDetalhe
        cartao={detalhe?.cartao ?? null}
        competencia={detalhe?.competencia ?? { mes: 0, ano: 2000 }}
        onCompetencia={(competencia) => setDetalhe((d) => d && { ...d, competencia })}
        onClose={() => setDetalhe(null)}
      />

      <AlertDialog open={!!excluindo} onOpenChange={(v) => { if (!v) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o cartão {excluindo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {usosExcluindo > 0
                ? `${usosExcluindo} lançamento(s) usam este cartão e ficarão sem cartão. Para manter o histórico, prefira desativar o cartão.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (excluindo && (await deleteCartao(excluindo.id))) toast.success("Cartão excluído");
                setExcluindo(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
