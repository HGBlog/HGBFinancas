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

