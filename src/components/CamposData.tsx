import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MESES, formatDataBR } from "@/lib/format";
import { parseISODate, toISODate, type MesAno } from "@/lib/fatura";
import { cn } from "@/lib/utils";
import { useState } from "react";

/** Date picker com valor "aaaa-mm-dd". */
export function DataField({ value, onChange, className }: { value: string; onChange: (iso: string) => void; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("w-full justify-start font-normal", className)}>
          <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
          {value ? formatDataBR(value) : "Selecione a data"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={value ? parseISODate(value) : undefined}
          defaultMonth={value ? parseISODate(value) : undefined}
          onSelect={(d) => {
            if (!d) return;
            onChange(toISODate(d));
            setAberto(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Seletor de mês (0–11) + ano numérico livre. */
export function MesAnoField({ value, onChange, className }: { value: MesAno; onChange: (v: MesAno) => void; className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      <Select value={String(value.mes)} onValueChange={(v) => onChange({ ...value, mes: Number(v) })}>
        <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MESES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="numeric"
        className="w-24"
        value={value.ano}
        onChange={(e) => {
          const ano = Number(e.target.value);
          if (ano > 1900 && ano < 3000) onChange({ ...value, ano });
        }}
      />
    </div>
  );
}
