// Escape para parse_mode HTML do Telegram.
export const escaparHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
