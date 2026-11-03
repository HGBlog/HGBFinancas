import { getDatabase } from './database';
import { ScheduledBill } from '@/types';
import { createTransaction } from './transactions';

export async function getScheduledBills(): Promise<ScheduledBill[]> {
  const db = await getDatabase();
  return await db.getAllAsync<ScheduledBill>(`
    SELECT 
      s.*,
      a.name as account_name,
      c.name as category_name,
      p.name as payee_name
    FROM scheduled_bills s
    LEFT JOIN accounts a ON s.account_id = a.id
    LEFT JOIN categories c ON s.category_id = c.id
    LEFT JOIN payees p ON s.payee_id = p.id
    ORDER BY s.next_due_date ASC
  `);
}

export async function createScheduledBill(data: {
  account_id: number;
  category_id?: number | null;
  payee_id?: number | null;
  amount: number;
  type: 'EXPENSE' | 'INCOME';
  due_day: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY' | 'ONCE';
  auto_record?: number;
  next_due_date: string;
  notes?: string | null;
}): Promise<number> {
  const db = await getDatabase();
  const auto = data.auto_record || 0;

  const res = await db.runAsync(
    `INSERT INTO scheduled_bills (
      account_id, category_id, payee_id, amount, type, 
      due_day, frequency, auto_record, is_active, next_due_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      data.account_id,
      data.category_id || null,
      data.payee_id || null,
      data.amount,
      data.type,
      data.due_day,
      data.frequency,
      auto,
      data.next_due_date,
      data.notes || null,
    ]
  );

  return res.lastInsertRowId;
}

export async function payScheduledBill(billId: number): Promise<void> {
  const db = await getDatabase();
  const bill = await db.getFirstAsync<ScheduledBill>(
    'SELECT * FROM scheduled_bills WHERE id = ?',
    [billId]
  );
  if (!bill) return;

  // Lançar transação na data de vencimento
  await createTransaction({
    account_id: bill.account_id,
    category_id: bill.category_id,
    payee_id: bill.payee_id,
    amount: bill.amount,
    type: bill.type,
    date: bill.next_due_date,
    status: 'CLEARED',
    notes: bill.notes ? `[Agendamento] ${bill.notes}` : '[Agendamento pago]',
  });

  // Atualizar próxima data de vencimento (ex: somar 1 mês se for mensal)
  const currentDate = new Date(bill.next_due_date);
  if (bill.frequency === 'MONTHLY') {
    currentDate.setMonth(currentDate.getMonth() + 1);
  } else if (bill.frequency === 'WEEKLY') {
    currentDate.setDate(currentDate.getDate() + 7);
  } else if (bill.frequency === 'YEARLY') {
    currentDate.setFullYear(currentDate.getFullYear() + 1);
  } else {
    // ONCE -> Desativa
    await db.runAsync('UPDATE scheduled_bills SET is_active = 0 WHERE id = ?', [billId]);
    return;
  }

  const nextIso = currentDate.toISOString().split('T')[0];
  await db.runAsync('UPDATE scheduled_bills SET next_due_date = ? WHERE id = ?', [nextIso, billId]);
}

export interface UpcomingBillItem {
  id: string;
  rawId: number;
  source: 'SCHEDULED' | 'TRANSACTION';
  title: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  accountName?: string;
  categoryName?: string;
  isOverdue: boolean;
  isDueToday: boolean;
  daysDiff: number;
}

export async function getUpcomingAndOverdueBills(): Promise<UpcomingBillItem[]> {
  const db = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const items: UpcomingBillItem[] = [];

  // 1. Contas agendadas ativas (tipo EXPENSE)
  const scheduled = await db.getAllAsync<ScheduledBill>(`
    SELECT 
      s.*,
      a.name as account_name,
      c.name as category_name,
      p.name as payee_name
    FROM scheduled_bills s
    LEFT JOIN accounts a ON s.account_id = a.id
    LEFT JOIN categories c ON s.category_id = c.id
    LEFT JOIN payees p ON s.payee_id = p.id
    WHERE s.is_active = 1 AND s.type = 'EXPENSE'
  `);

  for (const s of scheduled) {
    const isOverdue = s.next_due_date < today;
    const isDueToday = s.next_due_date === today;
    const diffTime = new Date(s.next_due_date).getTime() - new Date(today).getTime();
    const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    items.push({
      id: `sch_${s.id}`,
      rawId: s.id,
      source: 'SCHEDULED',
      title: s.payee_name || s.notes || s.category_name || 'Despesa Agendada',
      amount: s.amount,
      dueDate: s.next_due_date,
      accountName: s.account_name,
      categoryName: s.category_name,
      isOverdue,
      isDueToday,
      daysDiff,
    });
  }

  // 2. Transações pendentes não compensadas (despesas registradas como UNCLEARED)
  const pendingTxs = await db.getAllAsync<{
    id: number;
    amount: number;
    date: string;
    notes: string | null;
    account_name: string | null;
    category_name: string | null;
    payee_name: string | null;
  }>(`
    SELECT 
      t.id, t.amount, t.date, t.notes,
      a.name as account_name,
      c.name as category_name,
      p.name as payee_name
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payees p ON t.payee_id = p.id
    WHERE t.type = 'EXPENSE' AND t.status = 'UNCLEARED'
  `);

  for (const tx of pendingTxs) {
    const isOverdue = tx.date < today;
    const isDueToday = tx.date === today;
    const diffTime = new Date(tx.date).getTime() - new Date(today).getTime();
    const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    items.push({
      id: `tx_${tx.id}`,
      rawId: tx.id,
      source: 'TRANSACTION',
      title: tx.payee_name || tx.notes || tx.category_name || 'Despesa Pendente',
      amount: tx.amount,
      dueDate: tx.date,
      accountName: tx.account_name || undefined,
      categoryName: tx.category_name || undefined,
      isOverdue,
      isDueToday,
      daysDiff,
    });
  }

  // Ordenar por data de vencimento: mais antigas (mais vencidas) primeiro
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return items;
}

