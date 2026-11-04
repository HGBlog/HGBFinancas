import { getDatabase } from './database';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  FinancialSummary,
  TransactionSplit,
  ExpenseRecurrenceType,
  RecurrenceEditScope,
} from '@/types';
import { recalculateAccountBalance } from './accounts';
import { getOrCreatePayee } from './payees';
import { MONTH_NAMES_LIST, brDateToISO } from '@/utils/formatters';

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
  recurrence_id?: number | null;
  paid_month?: string | null;
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
      expense_type, start_month, end_month, due_day, recurrence_id, paid_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      data.recurrence_id || null,
      data.paid_month || null,
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
    'recurrence_id',
    'paid_month',
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
export async function toggleTransactionStatus(
  target: number | Transaction,
  monthISO?: string
): Promise<TransactionStatus> {
  const db = await getDatabase();
  const tx = typeof target === 'number' ? await getTransactionById(target) : target;
  if (!tx) return 'UNCLEARED';

  const effectiveMonth = monthISO || tx.date.substring(0, 7);
  const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
  const nextStatus: TransactionStatus = isPaid ? 'UNCLEARED' : 'CLEARED';

  const isRecurring =
    tx.expense_type === 'MENSAL' ||
    tx.expense_type === 'ANUAL' ||
    tx.expense_type === 'PERSONALIZAR';

  if (isRecurring) {
    const seriesRootId = tx.recurrence_id || tx.id;
    if (nextStatus === 'CLEARED') {
      await db.runAsync(
        `INSERT INTO expense_monthly_payments (transaction_id, month, status)
         VALUES (?, ?, ?)
         ON CONFLICT(transaction_id, month) DO UPDATE SET status = excluded.status`,
        [seriesRootId, effectiveMonth, 'CLEARED']
      );
    } else {
      await db.runAsync(
        `DELETE FROM expense_monthly_payments WHERE transaction_id = ? AND month = ?`,
        [seriesRootId, effectiveMonth]
      );
    }

    if (tx.account_id) {
      await recalculateAccountBalance(tx.account_id);
    }
    return nextStatus;
  }

  // Despesa Única (ou receita, ou override avulso)
  // Guarda paid_month no próprio registro para que despesas acumuladas pagas no mês continuem aparecendo no mês em que foram pagas!
  const paidMonthVal = nextStatus === 'CLEARED' ? effectiveMonth : null;
  await db.runAsync(
    'UPDATE transactions SET status = ?, paid_month = ? WHERE id = ?',
    [nextStatus, paidMonthVal, tx.id]
  );

  await recalculateAccountBalance(tx.account_id);
  if (tx.destination_account_id) {
    await recalculateAccountBalance(tx.destination_account_id);
  }
  return nextStatus;
}

function getPreviousMonthISO(monthISO: string): string {
  const [yearStr, monthStr] = monthISO.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface UpdateRecurringExpenseParams {
  tx: Transaction;
  currentMonthISO: string;
  newTitle: string;
  newAmount: number;
  newDateISO: string;
  scope: RecurrenceEditScope;
}

/**
 * Atualiza uma despesa recorrente ou override aplicando o escopo selecionado:
 * 1. 'CURRENT': "Mudar somente essa despesa" (somente o mês vigente)
 * 2. 'ALL': "Mudar todas as despesas (passadas, presente e futuras)"
 * 3. 'FUTURE': "Mudar somente as despesas do presente e do futuro"
 */
export async function updateRecurringExpense({
  tx,
  currentMonthISO,
  newTitle,
  newAmount,
  newDateISO,
  scope,
}: UpdateRecurringExpenseParams): Promise<void> {
  const db = await getDatabase();
  const newPayeeId = await getOrCreatePayee(newTitle);
  const newDueDay = parseInt(newDateISO.split('-')[2], 10) || tx.due_day || 1;
  const seriesRootId = tx.recurrence_id || tx.id;
  const rootTx = (await getTransactionById(seriesRootId)) || tx;

  if (scope === 'CURRENT') {
    // 1. "Mudar somente essa despesa": altera somente no mês vigente
    if (tx.expense_type === 'UNICO' && tx.recurrence_id) {
      await updateTransaction(tx.id, {
        payee_id: newPayeeId,
        notes: newTitle,
        amount: newAmount,
        date: newDateISO,
        due_day: newDueDay,
      });
      return;
    }

    // Verificar se já existe um override avulso deste registro para este mês
    const existingOverride = await db.getFirstAsync<Transaction>(
      `SELECT * FROM transactions 
       WHERE recurrence_id = ? AND expense_type = 'UNICO' AND date LIKE ? LIMIT 1`,
      [seriesRootId, `${currentMonthISO}%`]
    );

    if (existingOverride) {
      await updateTransaction(existingOverride.id, {
        payee_id: newPayeeId,
        notes: newTitle,
        amount: newAmount,
        date: newDateISO,
        due_day: newDueDay,
      });
    } else {
      await createTransaction({
        account_id: tx.account_id,
        category_id: tx.category_id,
        payee_id: newPayeeId,
        amount: newAmount,
        type: 'EXPENSE',
        date: newDateISO,
        status: tx.status || 'UNCLEARED',
        notes: newTitle,
        expense_type: 'UNICO',
        recurrence_id: seriesRootId,
        due_day: newDueDay,
      });
    }
    return;
  }

  if (scope === 'ALL') {
    // 2. "Mudar todas as despesas (passadas, presente e futuras)"
    // REGRA DO USUÁRIO: As alterações NÃO podem ser aplicadas às despesas passadas que foram indicadas como pagas!

    // A) Preserva histórico de meses passados que foram pagos via expense_monthly_payments
    const pastPaidPayments = await db.getAllAsync<{ month: string }>(
      `SELECT month FROM expense_monthly_payments 
       WHERE transaction_id = ? AND month < ? AND status = 'CLEARED'`,
      [seriesRootId, currentMonthISO]
    );

    for (const p of pastPaidPayments) {
      const existing = await db.getFirstAsync<Transaction>(
        `SELECT id FROM transactions 
         WHERE recurrence_id = ? AND expense_type = 'UNICO' AND (date LIKE ? OR paid_month = ?)`,
        [seriesRootId, `${p.month}%`, p.month]
      );
      if (!existing) {
        const oldDueDay = rootTx.due_day || tx.due_day || 1;
        const dayStr = String(oldDueDay).padStart(2, '0');
        await createTransaction({
          account_id: tx.account_id,
          category_id: tx.category_id,
          payee_id: rootTx.payee_id || tx.payee_id,
          amount: rootTx.amount, // Valor original pago intacto!
          type: 'EXPENSE',
          date: `${p.month}-${dayStr}`,
          status: 'CLEARED',
          notes: rootTx.notes, // Título original intacto!
          expense_type: 'UNICO',
          recurrence_id: seriesRootId,
          due_day: oldDueDay,
          paid_month: p.month,
        });
      }
    }

    // B) Atualiza os registros vinculados, NUNCA alterando meses passados que foram pagos!
    const linkedTxs = await db.getAllAsync<Transaction>(
      `SELECT id, date, status, expense_type FROM transactions WHERE id = ? OR recurrence_id = ?`,
      [seriesRootId, seriesRootId]
    );

    for (const item of linkedTxs) {
      const itemMonth = item.date.substring(0, 7);
      const isPastPaid =
        itemMonth < currentMonthISO &&
        (item.status === 'CLEARED' || item.status === 'RECONCILED');

      if (isPastPaid) {
        // NÃO ALTERAR: Despesas passadas pagas devem ser preservadas intactas!
        continue;
      }

      const [yStr, mStr] = itemMonth.split('-');
      const daysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
      const safeDay = Math.min(newDueDay, daysInMonth);
      const updatedDate = `${yStr}-${mStr}-${String(safeDay).padStart(2, '0')}`;

      await db.runAsync(
        `UPDATE transactions SET payee_id = ?, notes = ?, amount = ?, due_day = ?, date = ? WHERE id = ?`,
        [newPayeeId, newTitle, newAmount, newDueDay, updatedDate, item.id]
      );
    }

    if (tx.account_id) {
      await recalculateAccountBalance(tx.account_id);
    }
    return;
  }

  if (scope === 'FUTURE') {
    // 3. "Mudar somente as despesas do presente e do futuro"
    const recurrenceStartMonth = rootTx.start_month || rootTx.date.substring(0, 7);

    if (currentMonthISO <= recurrenceStartMonth) {
      // Estamos no início da série (não há meses passados para esta recorrência)
      await updateTransaction(rootTx.id, {
        payee_id: newPayeeId,
        notes: newTitle,
        amount: newAmount,
        date: newDateISO,
        due_day: newDueDay,
      });

      // Atualiza overrides futuros ou deste mês se houver
      await db.runAsync(
        `UPDATE transactions 
         SET payee_id = ?, notes = ?, amount = ?, due_day = ? 
         WHERE recurrence_id = ? AND date >= ?`,
        [newPayeeId, newTitle, newAmount, newDueDay, seriesRootId, `${currentMonthISO}-01`]
      );
    } else {
      // Há meses passados antes do mês vigente.
      // Encerra a vigência anterior no mês imediatamente anterior (prevMonthISO):
      const prevMonth = getPreviousMonthISO(currentMonthISO);

      // Localiza o registro recorrente ativo até o mês vigente
      const activeRecurrence = await db.getFirstAsync<Transaction>(
        `SELECT * FROM transactions 
         WHERE (id = ? OR recurrence_id = ?) 
           AND expense_type IN ('MENSAL', 'ANUAL', 'PERSONALIZAR')
           AND (start_month IS NULL OR start_month <= ?)
           AND (end_month IS NULL OR end_month >= ?)
         ORDER BY id DESC LIMIT 1`,
        [seriesRootId, seriesRootId, currentMonthISO, currentMonthISO]
      );

      const targetToClose = activeRecurrence || rootTx;

      await updateTransaction(targetToClose.id, {
        end_month: prevMonth,
      });

      // Cria a nova regra recorrente com início no mês vigente
      await createTransaction({
        account_id: tx.account_id,
        category_id: tx.category_id,
        payee_id: newPayeeId,
        amount: newAmount,
        type: 'EXPENSE',
        date: newDateISO,
        status: tx.status || 'UNCLEARED',
        notes: newTitle,
        expense_type: rootTx.expense_type || 'MENSAL',
        start_month: currentMonthISO,
        end_month: rootTx.expense_type === 'PERSONALIZAR' ? rootTx.end_month : null,
        due_day: newDueDay,
        recurrence_id: seriesRootId,
      });

      // Remove eventuais overrides avulsos do mês atual em diante para a nova regra vigorar
      await db.runAsync(
        `DELETE FROM transactions 
         WHERE recurrence_id = ? AND expense_type = 'UNICO' AND date >= ?`,
        [seriesRootId, `${currentMonthISO}-01`]
      );
    }

    if (tx.account_id) {
      await recalculateAccountBalance(tx.account_id);
    }
    return;
  }
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

  // Buscar pagamentos mensais para despesas recorrentes deste mês
  const monthlyPayments = await db.getAllAsync<{ transaction_id: number; status: string }>(
    `SELECT transaction_id, status FROM expense_monthly_payments WHERE month = ?`,
    [monthISO]
  );

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
    const effectiveStartMonth = exp.start_month || expMonthISO;
    const effectiveEndMonth = exp.end_month || null;

    // Helper: se este lançamento recorrente possui uma alteração/sobrescrita avulsa (UNICO) para este mês,
    // a projeção genérica é ignorada para que apenas o lançamento específico apareça.
    const hasOverrideThisMonth = (): boolean => {
      const seriesId = exp.recurrence_id || exp.id;
      return allExpenses.some(
        (o) =>
          o.expense_type === 'UNICO' &&
          (o.recurrence_id === exp.id ||
            (exp.recurrence_id && o.recurrence_id === exp.recurrence_id) ||
            o.recurrence_id === seriesId) &&
          (o.date.substring(0, 7) === monthISO || o.paid_month === monthISO)
      );
    };

    if (expType === 'MENSAL') {
      // Aparece todos os meses a partir do mês de início até o mês de término (se houver)
      const isAfterOrEqualStart = monthISO >= effectiveStartMonth;
      const isBeforeOrEqualEnd = !effectiveEndMonth || monthISO <= effectiveEndMonth;
      if (isAfterOrEqualStart && isBeforeOrEqualEnd) {
        if (!hasOverrideThisMonth()) {
          const seriesId = exp.recurrence_id || exp.id;
          const paymentRecord = monthlyPayments.find(
            (p) => p.transaction_id === exp.id || p.transaction_id === seriesId
          );
          const effectiveStatus = paymentRecord
            ? (paymentRecord.status as TransactionStatus)
            : 'UNCLEARED';

          const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
          results.push({
            ...exp,
            date: itemDate,
            status: effectiveStatus,
          });
        }
      }
    } else if (expType === 'ANUAL') {
      // Aparece no mesmo mês e dia todo ano a partir do cadastro dentro da vigência
      const isAfterOrEqualStart = monthISO >= effectiveStartMonth;
      const isBeforeOrEqualEnd = !effectiveEndMonth || monthISO <= effectiveEndMonth;
      if (selectedMonthNum === expMonthNum && isAfterOrEqualStart && isBeforeOrEqualEnd) {
        if (!hasOverrideThisMonth()) {
          const seriesId = exp.recurrence_id || exp.id;
          const paymentRecord = monthlyPayments.find(
            (p) => p.transaction_id === exp.id || p.transaction_id === seriesId
          );
          const effectiveStatus = paymentRecord
            ? (paymentRecord.status as TransactionStatus)
            : 'UNCLEARED';

          const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
          results.push({
            ...exp,
            date: itemDate,
            status: effectiveStatus,
          });
        }
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

      const startISO = parseMonthISO(exp.start_month) || effectiveStartMonth;
      const endISO = parseMonthISO(exp.end_month) || effectiveEndMonth;

      let inRange = false;
      if (startISO && endISO) {
        inRange = monthISO >= startISO && monthISO <= endISO;
      } else if (startISO) {
        inRange = monthISO >= startISO;
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
        if (!hasOverrideThisMonth()) {
          const seriesId = exp.recurrence_id || exp.id;
          const paymentRecord = monthlyPayments.find(
            (p) => p.transaction_id === exp.id || p.transaction_id === seriesId
          );
          const effectiveStatus = paymentRecord
            ? (paymentRecord.status as TransactionStatus)
            : 'UNCLEARED';

          const itemDate = `${monthISO}-${String(expDay).padStart(2, '0')}`;
          results.push({
            ...exp,
            date: itemDate,
            status: effectiveStatus,
          });
        }
      }
    } else {
      // ÚNICO
      if (expMonthISO === monthISO) {
        // Despesa do próprio mês
        results.push(exp);
      } else if (exp.paid_month === monthISO) {
        // Despesa acumulada de outro mês que FOI PAGA NESTE MÊS! Permanece visível na fatura deste mês como PAGA!
        results.push({
          ...exp,
          notes: exp.notes
            ? (exp.notes.includes('[Acumulada') ? exp.notes : `[Acumulada de ${expMonthStr}/${expYearStr}] ${exp.notes}`)
            : `[Acumulada de ${expMonthStr}/${expYearStr}]`,
        });
      } else if (expMonthISO < monthISO && exp.status !== 'CLEARED' && exp.status !== 'RECONCILED') {
        // Despesa de mês anterior NÃO PAGA: acumula e continua aparecendo até o pagamento!
        results.push({
          ...exp,
          notes: exp.notes
            ? (exp.notes.includes('[Acumulada') ? exp.notes : `[Acumulada de ${expMonthStr}/${expYearStr}] ${exp.notes}`)
            : `[Acumulada de ${expMonthStr}/${expYearStr}]`,
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
     WHERE type = 'EXPENSE' AND (status = 'CLEARED' OR status = 'RECONCILED') AND (date <= ? OR paid_month <= ?)`,
    [lastDateOfMonth, monthPrefix]
  );
  const paidRecurringUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(t.amount) as sum 
     FROM expense_monthly_payments p 
     JOIN transactions t ON p.transaction_id = t.id 
     WHERE p.status = 'CLEARED' AND p.month <= ?`,
    [monthPrefix]
  );

  const inSum = incomeUpToMonth?.sum ?? 0;
  const paidOutSum = (paidExpenseUpToMonth?.sum ?? 0) + (paidRecurringUpToMonth?.sum ?? 0);
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
     WHERE type = 'EXPENSE' AND (status = 'CLEARED' OR status = 'RECONCILED') AND (date <= ? OR paid_month <= ?)`,
    [lastDateOfMonth, monthPrefix]
  );
  const paidRecurringUpToMonth = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(t.amount) as sum 
     FROM expense_monthly_payments p 
     JOIN transactions t ON p.transaction_id = t.id 
     WHERE p.status = 'CLEARED' AND p.month <= ?`,
    [monthPrefix]
  );

  const inSum = incomeUpToMonth?.sum ?? 0;
  const paidOutSum = (paidExpenseUpToMonth?.sum ?? 0) + (paidRecurringUpToMonth?.sum ?? 0);

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
