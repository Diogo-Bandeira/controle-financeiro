// Dinheiro em centavos inteiros para evitar erro de ponto flutuante nos totais.

export const toCents = (v: number): number => Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-7);

export const fromCents = (c: number): number => c / 100;

export const round2 = (v: number): number => fromCents(toCents(v));

export const sumMoney = (values: number[]): number => fromCents(values.reduce((s, v) => s + toCents(v), 0));
