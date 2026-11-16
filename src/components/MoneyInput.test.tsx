import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyInput } from "./MoneyInput";
import { validarLancamento } from "@/lib/lancamento";

const valores: number[] = [];

function Campo({ inicial = 0, permitirNegativo = true }: { inicial?: number; permitirNegativo?: boolean }) {
  const [v, setV] = useState(inicial);
  return (
    <MoneyInput
      aria-label="valor"
      name="valor"
      value={v}
      permitirNegativo={permitirNegativo}
      onChange={(n) => { valores.push(n); setV(n); }}
    />
  );
}

const campo = () => screen.getByLabelText("valor") as HTMLInputElement;
const ultimo = () => valores[valores.length - 1];
const texto = (s: string) => s.replace(/\s/g, " ");

describe("MoneyInput", () => {
  it("digitar '-' no início torna o valor negativo e mantém o sinal ao digitar os números", () => {
    render(<Campo />);
    fireEvent.change(campo(), { target: { value: `-${campo().value}` } });
    expect(Object.is(ultimo(), -0)).toBe(true);
    expect(texto(campo().value)).toBe("− R$ 0,00");
    fireEvent.change(campo(), { target: { value: `${campo().value}5000` } });
    expect(ultimo()).toBe(-50);
    expect(texto(campo().value)).toBe("− R$ 50,00");
    expect((document.querySelector('input[name="valor"]') as HTMLInputElement).value).toBe("-50.00");
  });

  it("'+' digitado volta a positivo", () => {
    render(<Campo inicial={-50} />);
    fireEvent.change(campo(), { target: { value: `${campo().value}+` } });
    expect(ultimo()).toBe(50);
  });

  it("botão +/− inverte o sinal", () => {
    render(<Campo inicial={87.2} />);
    const botao = screen.getByRole("button", { name: /inverter sinal/i });
    fireEvent.click(botao);
    expect(ultimo()).toBe(-87.2);
    expect(texto(campo().value)).toBe("− R$ 87,20");
    fireEvent.click(botao);
    expect(ultimo()).toBe(87.2);
  });

  it("sem permitirNegativo ignora '-' e não mostra o botão", () => {
    render(<Campo permitirNegativo={false} />);
    fireEvent.change(campo(), { target: { value: "-R$ 0,001" } });
    expect(ultimo()).toBe(0.01);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("valor zero (só o sinal) é rejeitado pelo formulário", () => {
    render(<Campo />);
    fireEvent.change(campo(), { target: { value: "-R$ 0,00" } });
    const erro = validarLancamento({ descricao: "Estorno", valor: ultimo(), categoria: "cartao", subcategoria: "", cartaoId: "c1", parcelaOuRecorrente: false });
    expect(erro).toBe("Informe o valor");
  });
});
