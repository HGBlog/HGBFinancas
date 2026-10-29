import { getDatabase } from './database';
import { Transaction, TransactionStatus, TransactionType, FinancialSummary, TransactionSplit } from '@/types';
import { recalculateAccountBalance } from './accounts';

export interface TransactionFilter {
  accountId?: number;
  startDate?: string;
  endDate?: string;
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
  splits?: { category_id: number; amount: number; memo?: string }[];
}): Promise<number> {
  const db = await getDatabase();
  const status = data.status || 'UNCLEARED';
  const isSplit = data.splits && data.splits.length > 0 ? 1 : 0;

  const result = await db.runAsync(
    `INSERT INTO transactions (
      account_id, destination_account_id, category_id, payee_id,
      amount, type, date, status, notes, check_number, is_split
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

// Alternância rápida de status (Pendente -> Compensado -> Conciliado)
export async function toggleTransactionStatus(id: number): Promise<TransactionStatus> {
  const db = await getDatabase();
  const tx = await getTransactionById(id);
  if (!tx) return 'UNCLEARED';

  let nextStatus: TransactionStatus = 'UNCLEARED';
  if (tx.status === 'UNCLEARED') {
    nextStatus = 'CLEARED';
  } else if (tx.status === 'CLEARED') {
    nextStatus = 'RECONCILED';
  } else {
    nextStatus = 'UNCLEARED';
  }

  await db.runAsync('UPDATE transactions SET status = ? WHERE id = ?', [nextStatus, id]);
  return nextStatus;
}

export async function getFinancialSummary(monthPrefix: string): Promise<FinancialSummary> {
  const db = await getDatabase();

  // Saldo total de todas as contas ativas
  const totalBalanceResult = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(current_balance) as total FROM accounts WHERE is_archived = 0'
  );

  // Receitas do mês
  const incomeResult = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'INCOME' AND date LIKE ?`,
    [`${monthPrefix}%`]
  );

  // Despesas do mês
  const expenseResult = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE type = 'EXPENSE' AND date LIKE ?`,
    [`${monthPrefix}%`]
  );

  // Não compensados (pendentes) em aberto
  const unclearedResult = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE status = 'UNCLEARED' AND type = 'EXPENSE'`
  );

  const totalBalance = totalBalanceResult?.total ?? 0;
  const totalIncomeMonth = incomeResult?.sum ?? 0;
  const totalExpenseMonth = expenseResult?.sum ?? 0;
  const monthlyNet = totalIncomeMonth - totalExpenseMonth;
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
