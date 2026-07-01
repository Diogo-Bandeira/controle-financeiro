import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatarMoeda = (valor: number): string => {
  return Number(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export const calcularPct = (atual: number, total: number): number => {
  if (!total || total === 0) return 0
  return Math.min(Math.round((atual / total) * 100), 100)
}