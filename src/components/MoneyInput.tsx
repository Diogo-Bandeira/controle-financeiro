import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCents, fromCents } from "@/lib/money";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> {
  value: number | null | undefined;
  onChange: (valor: number) => void;
  /** Mostra o botão +/− e aceita "-" digitado (e "+" para voltar a positivo). */
  permitirNegativo?: boolean;
}

// -0 guarda o sinal enquanto o valor ainda é zero ("-" digitado antes dos números).
const ehNegativo = (v: number): boolean => v < 0 || Object.is(v, -0);

/** Máscara BRL digitada da direita: "8720" → R$ 87,20. `name` gera um input oculto com o número (2 casas). */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({ value, onChange, name, permitirNegativo = false, ...props }, ref) => {
  const centavos = toCents(value ?? 0);
  const negativo = permitirNegativo && ehNegativo(centavos);
  const comSinal = (absoluto: number, neg: boolean) => (neg ? -absoluto : absoluto);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const bruto = e.target.value;
    const digitos = bruto.replace(/\D/g, "").slice(0, 13);
    const neg = permitirNegativo && !bruto.includes("+") && /[-−]/.test(bruto);
    onChange(comSinal(fromCents(Number(digitos || "0")), neg));
  };

  const texto = brl.format(fromCents(Math.abs(centavos)));
  const campo = (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={negativo ? `− ${texto}` : texto}
      onChange={handleChange}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      {...props}
    />
  );
  const oculto = name && <input type="hidden" name={name} value={fromCents(centavos).toFixed(2)} />;

  if (!permitirNegativo) return <>{campo}{oculto}</>;
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-auto self-stretch shrink-0 px-2 text-xs"
        onClick={() => onChange(comSinal(fromCents(Math.abs(centavos)), !negativo))}
        title="Inverter sinal"
        aria-label="Inverter sinal (+/−)"
        aria-pressed={negativo}
      >
        +/−
      </Button>
      {campo}
      {oculto}
    </div>
  );
});
MoneyInput.displayName = "MoneyInput";
