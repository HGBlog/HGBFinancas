import { getDatabase } from './database';
import { Transaction, TransactionStatus, TransactionType, FinancialSummary, TransactionSplit, ExpenseRecurrenceType } from '@/types';
import { recalculateAccountBalance } from './accounts';
import { MONTH_NAMES_LIST } from '@/utils/formatters';

export interface TransactionFilter {
  accountId?: number;
  categoryFilter?: string;
  startDate?: string;
  endDate?: string;
  monthPrefix?: string;
  status?: TransactionStatus;
  type?: TransactionType;
  limit?: number;
  searchQuery?: string;
}

export async function getTransactions(filters: TransactionFilter = {}): Promise<Transaction[]> {
  const db = await getDatabase();
  let query = `
    SELECT 
      t.*,
      a.name as account_name,
      dest.name as destination_account_name,
      c.name as category_name,
      c.color as category_color,
      c.icon as category_icon,
      p.name as payee_name
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts dest ON t.destination_account_id = dest.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payees p ON t.payee_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.accountId) {
    query += ' AND (t.account_id = ? OR t.destination_account_id = ?)';
    params.push(filters.accountId, filters.accountId);
  }

  if (filters.categoryFilter) {
    query += ' AND c.name LIKE ?';
    params.push(`%${filters.categoryFilter}%`);
  }

  if (filters.monthPrefix) {
    query += ' AND t.date LIKE ?';
    params.push(`${filters.monthPrefix}%`);
  }

  if (filters.startDate) {
    query += ' AND t.date >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ' AND t.date <= ?';
    params.push(filters.endDate);
  }

  if (filters.status) {
    query += ' AND t.status = ?';
    params.push(filters.status);
  }

  if (filters.type) {
    query += ' AND t.type = ?';
    params.push(filters.type);
  }

  if (filters.searchQuery) {
    query += ' AND (p.name LIKE ? OR t.notes LIKE ? OR c.name LIKE ?)';
    const wildcard = `%${filters.searchQuery}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  query += ' ORDER BY t.date DESC, t.id DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return await db.getAllAsync<Transaction>(query, params);
}

export async function getTransactionSplits(transactionId: number): Promise<TransactionSplit[]> {
  const db = await getDatabase();
  return await db.getAllAsync<TransactionSplit>(
    `SELECT 
      ts.*,
      c.name as category_name,
      c.color as category_color
    FROM transaction_splits ts
    JOIN categories c ON ts.category_id = c.id
    WHERE ts.transaction_id = ?`,
    [transactionId]
  );
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Transaction>(
    `SELECT 
      t.*,
      a.name as account_name,
      dest.name as destination_account_name,
      c.name as category_name,
      c.color as category_color,
      c.icon as category_icon,
      p.name as payee_name
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts dest ON t.destination_account_id = dest.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payees p ON t.payee_id = p.id
    WHERE t.id = ?`,
    [id]
  );
  if (!row) return null;

  if (row.is_split === 1) {
    row.splits = await getTransactionSplits(row.id);
  }

  return row;
}

export async function createTransaction(data: {
  account_id: number;
  destination_account_id?: number | null;
  category_id?: number | null;
  payee_id?: number | null;
  amount: number;
  type: TransactionType;
  date: string;
  status?: TransactionStatus;
  notes?: string | null;
  check_number?: string | null;
  expense_type?: ExpenseRecurrenceType;
  start_month?: string | null;
  end_month?: string | null;
  due_day?: number | null;
  splits?: { category_id: number; amount: number; memo?: string }[];
}): Promise<number> {
  const db = await getDatabase();
  const status = data.status || 'UNCLEARED';
  const isSplit = data.splits && data.splits.length > 0 ? 1 : 0;
  const expenseType = data.expense_type || 'UNICO';

  const result = await db.runAsync(
    `INSERT INTO transactions (
      account_id, destination_account_id, category_id, payee_id,
      amount, type, date, status, notes, check_number, is_split,
      expense_type, start_month, end_month, due_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.account_id,
      data.destination_account_id || null,
      data.category_id || null,
      data.payee_id || null,
      Math.abs(data.amount),
      data.type,
      data.date,
      status,
      data.notes || null,
      data.check_number || null,
      isSplit,
      expenseType,
      data.start_month || null,
      data.end_month || null,
      data.due_day || null,
    ]
  );

  const transactionId = result.lastInsertRowId;

  // Se houver splits, salvar na tabela transaction_splits
  if (data.splits && data.splits.length > 0) {
    for (const s of data.splits) {
      await db.runAsync(
        `INSERT INTO transaction_splits (transaction_id, category_id, amount, memo)
         VALUES (?, ?, ?, ?)`,
        [transactionId, s.category_id, Math.abs(s.amount), s.memo || null]
      );
    }
  }

  // Atualizar saldo da conta de origem
  await recalculateAccountBalance(data.account_id);

  // Se for transferência, atualizar saldo da conta de destino
  if (data.type === 'TRANSFER' && data.destination_account_id) {
    await recalculateAccountBalance(data.destination_account_id);
  }

  return transactionId;
}

export async function updateTransaction(
  id: number,
  data: Partial<Omit<Transaction, 'id' | 'created_at'>>
): Promise<void> {
  const db = await getDatabase();
  const existing = await getTransactionById(id);
  if (!existing) return;

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = [
    'account_id',
    'destination_account_id',
    'category_id',
    'payee_id',
    'amount',
    'type',
    'date',
    'status',
    'notes',
    'check_number',
    'is_split',
    'expense_type',
    'start_month',
    'end_month',
    'due_day',
  ] as const;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(data[field] === undefined ? null : data[field]);
    }
  }

  if (fields.length === 0) return;

  params.push(id);
  await db.runAsync(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, params);

  // Recalcular contas afetadas
  await recalculateAccountBalance(existing.account_id);
  if (existing.destination_account_id) {
    await recalculateAccountBalance(existing.destination_account_id);
  }
  if (data.account_id && data.account_id !== existing.account_id) {
    await recalculateAccountBalance(data.account_id);
  }
  if (data.destination_account_id && data.destination_account_id !== existing.destination_account_id) {
    await recalculateAccountBalance(data.destination_account_id);
  }
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  const existing = await getTransactionById(id);
  if (!existing) return;

  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);

  await recalculateAccountBalance(existing.account_id);
  if (existing.destination_account_id) {
    await recalculateAccountBalance(existing.destination_account_id);
  }
}

// Alternância rápida de status de pagamento (Não Pago / UNCLEARED <-> Pago / CLEARED)
export async function toggleTransactionStatus(id: number): Promise<TransactionStatus> {
  const db = await getDatabase();
  const tx = await getTransactionById(id);
  if (!tx) return 'UNCLEARED';

  const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
  const nextStatus: TransactionStatus = isPaid ? 'UNCLEARED' : 'CLEARED';

  await db.runAsync('UPDATE transactions SET status = ? WHERE id = ?', [nextStatus, id]);
  await recalculateAccountBalance(tx.account_id);
  return nextStatus;
}

/**
 * Retorna as despesas para a Fatura Mensal / Painel, aplicando as regras:
 * 1. Despesas Únicas do mês + Despesas Únicas anteriores NÃO PAGAS que se acumulam
 * 2. Despesas Mensais (no mesmo dia, refletindo o último valor editado)
 * 3. Despesas Anuais (no mesmo mês e dia de cada ano)
 * 4. Despesas Personalizadas (entre o mês de Início e Término)
 */
export async function getMonthlyExpensesStatement(monthISO: string): Promise<Transaction[]> {
  const db = await getDatabase();
  const [selectedYearStr, selectedMonthStr] = monthISO.split('-');
  const selectedYear = parseInt(selectedYearStr, 10);
  const selectedMonthNum = parseInt(selectedMonthStr, 10); // 1 to 12

  // Buscar todas as despesas cadastradas
  const allExpenses = await db.getAllAsync<Transaction>(`
    SELECT 
      t.*,
      a.name as account_name,
      c.name as category_name,
      c.color as category_color,
      c.icon as category_icon,
      p.name as payee_name
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payees p ON t.payee_id = p.id
    WHERE t.type = 'EXPENSE'
    ORDER BY t.date ASC, t.id ASC
  `);

  const results: Transaction[] = [];

  for (const exp of allExpenses) {
    const expDate = exp.date;
    const [expYearStr, expMonthStr, expDayStr] = expDate.split('-');
    const expYear = parseInt(expYearStr, 10);
    const expMonthNum = parseInt(expMonthStr, 10);
    const expDay = parseInt(expDayStr, 10) || exp.due_day || 1;
    const expMonthISO = `${expYearStr}-${expMonthStr}`;

    const expType = exp.expense_type || 'UNICO';

    if (expType === 'MENSAL') {
      // Aparece todos os meses a partir do mês de cadastro até ser excluída
      if (monthISO >= expMonthISO) {
        const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
        results.push({
          ...exp,
          date: itemDate,
        });
      }
    } else if (expType === 'ANUAL') {
      // Aparece no mesmo mês e dia todo ano a partir do cadastro
      if (selectedMonthNum === expMonthNum && selectedYear >= expYear) {
        const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
        results.push({
          ...exp,
          date: itemDate,
        });
      }
    } else if (expType === 'PERSONALIZAR') {
      // Início e Término (suporta YYYY-MM, Mês/AAAA ou nome legado do mês)
      const parseMonthISO = (val?: string | null): string | null => {
        if (!val) return null;
        if (/^\d{4}-\d{2}$/.test(val)) return val;
        if (val.includes('/')) {
          const [mPart, yPart] = val.split('/');
          const mIdx = (MONTH_NAMES_LIST as readonly string[]).indexOf(mPart) + 1;
          const yNum = parseInt(yPart, 10);
          if (mIdx > 0 && !isNaN(yNum)) {
            return `${yNum}-${String(mIdx).padStart(2, '0')}`;
          }
        }
        return null;
      };

      const startISO = parseMonthISO(exp.start_month);
      const endISO = parseMonthISO(exp.end_month);

      let inRange = false;
      if (startISO && endISO) {
        inRange = monthISO >= startISO && monthISO <= endISO;
      } else {
        // Fallback para compatibilidade com nomes de meses simples
        const startIdx = exp.start_month ? (MONTH_NAMES_LIST as readonly string[]).indexOf(exp.start_month) + 1 : 1;
        const endIdx = exp.end_month ? (MONTH_NAMES_LIST as readonly string[]).indexOf(exp.end_month) + 1 : 12;

        if (startIdx <= endIdx) {
          inRange = selectedMonthNum >= startIdx && selectedMonthNum <= endIdx;
        } else {
          // Virada de ano (ex: Nov a Fev)
          inRange = selectedMonthNum >= startIdx || selectedMonthNum <= endIdx;
        }
        if (inRange && selectedYear < expYear) {
          inRange = false;
        }
      }

      if (inRange) {
        const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
        results.push({
          ...exp,
          date: itemDate,
        });
      }
    } else {
      // ÚNICO
      if (expMonthISO === monthISO) {
        // Despesa do próprio mês
        results.push(exp);
      } else if (expMonthISO < monthISO && exp.status !== 'CLEARED' && exp.status !== 'RECONCILED') {
        // Despesa de mês anterior NÃO PAGA: acumula e continua aparecendo até o pagamento!
        results.push({
          ...exp,
          notes: exp.notes ? `[Acumulada de ${expMonthStr}/${expYearStr}] ${exp.notes}` : `[Acumulada de ${expMonthStr}/${expYearStr}]`,
        });
      }
    }
  }

  // Carregar splits para transações divididas
  for (const t of results) {
    if (t.is_split === 1) {
      t.splits = await getTransactionSplits(t.id);
    }
  }

  return results;
}

export async function getAvailableRevenue(monthPrefix: string): Promise<number> {
  const db = await getDatabase();
  const [year, month] = monthPrefix.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const lastDateOfMonth = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  const incomeUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'INCOME' AND date <= ?`,
    [lastDateOfMonth]
  );
  const paidExpenseUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'EXPENSE' AND (status = 'CLEARED' OR status = 'RECONCILED') AND date <= ?`,
    [lastDateOfMonth]
  );
  const inSum = incomeUpToMonth?.sum ?? 0;
  const paidOutSum = paidExpenseUpToMonth?.sum ?? 0;
  return Math.max(0, inSum - paidOutSum);
}

export async function getFinancialSummary(monthPrefix: string): Promise<FinancialSummary> {
  const db = await getDatabase();

  const [year, month] = monthPrefix.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const lastDateOfMonth = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  // Receitas acumuladas até o final do mês selecionado
  const incomeUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'INCOME' AND date <= ?`,
    [lastDateOfMonth]
  );

  // Despesas pagas acumuladas até o final do mês selecionado
  const paidExpenseUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'EXPENSE' AND (status = 'CLEARED' OR status = 'RECONCILED') AND date <= ?`,
    [lastDateOfMonth]
  );

  const inSum = incomeUpToMonth?.sum ?? 0;
  const paidOutSum = paidExpenseUpToMonth?.sum ?? 0;

  // Valor total em mãos: somente valores de receita que não foram usados para pagar contas (se todos usados, R$ 0,00)
  const totalBalance = Math.max(0, inSum - paidOutSum);

  // Receitas do mês
  const incomeResult = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'INCOME' AND date LIKE ?`,
    [`${monthPrefix}%`]
  );

  // Despesas totais do mês calculadas via getMonthlyExpensesStatement (incluindo acumuladas e recorrentes)
  const monthlyExpenses = await getMonthlyExpensesStatement(monthPrefix);
  const totalExpenseMonth = monthlyExpenses.reduce((sum, item) => sum + item.amount, 0);

  const totalIncomeMonth = incomeResult?.sum ?? 0;
  const monthlyNet = totalIncomeMonth - totalExpenseMonth;

  // Total não compensado
  const unclearedResult = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE status = 'UNCLEARED' AND date <= ?`,
    [lastDateOfMonth]
  );
  const unclearedTotal = unclearedResult?.sum ?? 0;

  return {
    totalBalance,
    totalIncomeMonth,
    totalExpenseMonth,
    monthlyNet,
    unclearedTotal,
  };
}

export interface CategorySpending {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  totalSpent: number;
  percentage: number;
}

export async function getCategorySpendingReport(monthPrefix: string): Promise<CategorySpending[]> {
  const db = await getDatabase();

  const totalExpense = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'EXPENSE' AND date LIKE ?`,
    [`${monthPrefix}%`]
  );

  const total = totalExpense?.sum ?? 0;
  if (total === 0) return [];

  // Considera tanto transações diretas (não divididas) quanto splits individuais
  const rows = await db.getAllAsync<{
    category_id: number;
    category_name: string;
    category_color: string;
    category_icon: string;
    sum: number;
  }>(
    `SELECT 
      cat.id as category_id,
      cat.name as category_name,
      cat.color as category_color,
      cat.icon as category_icon,
      SUM(sub.amt) as sum
    FROM (
      -- Transações simples
      SELECT t.category_id as cat_id, t.amount as amt
      FROM transactions t
      WHERE t.type = 'EXPENSE' AND t.is_split = 0 AND t.date LIKE ?
      UNION ALL
      -- Transações divididas (splits)
      SELECT ts.category_id as cat_id, ts.amount as amt
      FROM transaction_splits ts
      JOIN transactions t ON ts.transaction_id = t.id
      WHERE t.type = 'EXPENSE' AND t.is_split = 1 AND t.date LIKE ?
    ) sub
    JOIN categories cat ON sub.cat_id = cat.id
    GROUP BY cat.id
    ORDER BY sum DESC`,
    [`${monthPrefix}%`, `${monthPrefix}%`]
  );

  return rows.map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    categoryIcon: r.category_icon,
    totalSpent: r.sum,
    percentage: Math.round((r.sum / total) * 100),
  }));
}
