export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function formatDateBR(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayBR(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${day}-${month}-${year}`;
}

export function getCurrentMonthISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getMonthName(monthISO: string): string {
  if (!monthISO) return '';
  const [year, month] = monthISO.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const raw = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  // Garantir que a preposição "de" seja sempre minúscula
  return raw.replace(/\bDe\b/g, 'de');
}

export function getOnlyMonthName(monthISO: string): string {
  if (!monthISO) return '';
  const [year, month] = monthISO.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase();
}

/**
 * Máscara monetária que preenche os centavos da direita para a esquerda.
 * Ex: Digitar "5" -> "R$ 0,05", "50" -> "R$ 0,50", "1500" -> "R$ 15,00"
 */
export function formatCurrencyInput(rawInput: string): { formatted: string; numericValue: number; rawDigits: string } {
  const digits = rawInput.replace(/\D/g, '');
  if (!digits) {
    return { formatted: 'R$ 0,00', numericValue: 0, rawDigits: '' };
  }
  const cleanDigits = digits.replace(/^0+/, '') || '0';
  const numericValue = parseInt(cleanDigits, 10) / 100;
  const formatted = numericValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return { formatted, numericValue, rawDigits: cleanDigits };
}

/**
 * Converte valor numérico direto para string monetária formatada com dígitos brutos
 */
export function numericToCurrencyInput(value: number): { formatted: string; numericValue: number; rawDigits: string } {
  if (!value || isNaN(value)) {
    return { formatted: 'R$ 0,00', numericValue: 0, rawDigits: '' };
  }
  const cents = Math.round(value * 100);
  return formatCurrencyInput(String(cents));
}

/**
 * Máscara de data no padrão brasileiro com traços: DD-MM-AAAA
 * Preenche automaticamente conforme o usuário digita.
 */
export function formatDateInput(rawInput: string): string {
  const digits = rawInput.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
}

/**
 * Converte data DD-MM-AAAA (ou DD/MM/AAAA) para ISO AAAA-MM-DD
 */
export function brDateToISO(brDate: string): string {
  if (!brDate) return getTodayISO();
  const digits = brDate.replace(/\D/g, '');
  if (digits.length === 8) {
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return `${year}-${month}-${day}`;
  }
  const parts = brDate.split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return brDate;
}

/**
 * Converte data ISO AAAA-MM-DD para DD-MM-AAAA
 */
export function isoToBRDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
  }
  return isoDate;
}

export const MONTH_NAMES_LIST = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;
