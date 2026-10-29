import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { toCents, fromCents } from "@/lib/money";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> {
  value: number | null | undefined;
  onChange: (valor: number) => void;
}

/** Máscara BRL digitada da direita: "8720" → R$ 87,20. `name` gera um input oculto com o número (2 casas). */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({ value, onChange, name, ...props }, ref) => {
  const centavos = toCents(value ?? 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitos = e.target.value.replace(/\D/g, "").slice(0, 13);
    onChange(fromCents(Number(digitos || "0")));
  };

  return (
    <>
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={brl.format(fromCents(Math.abs(centavos)))}
        onChange={handleChange}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        {...props}
      />
      {name && <input type="hidden" name={name} value={fromCents(centavos).toFixed(2)} />}
    </>
  );
});
MoneyInput.displayName = "MoneyInput";
