import { describe, expect, it } from "vitest";
import { fromCents, round2, sumMoney, toCents } from "./money";

describe("money", () => {
  it("toCents arredonda meio centavo para longe do zero", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(87.2)).toBe(8720);
    expect(toCents(0)).toBe(0);
  });
  it("fromCents / round2", () => {
    expect(fromCents(8720)).toBe(87.2);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("sumMoney soma em centavos inteiros", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([100, -33.33])).toBe(66.67);
  });
  it("sumMoney com negativos abate sem perder centavos", () => {
    expect(sumMoney([-50])).toBe(-50);
    expect(sumMoney([0.1, 0.2, -0.3])).toBe(0);
    expect(sumMoney([130.45, 89.9, -50.35])).toBe(170);
    expect(sumMoney([-0.1, -0.2])).toBe(-0.3);
    expect(sumMoney([300, -300.01])).toBe(-0.01);
  });
});
