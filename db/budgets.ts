import { getDatabase } from './database';
import { Budget } from '@/types';

export async function getBudgetsForMonth(month: string): Promise<Budget[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Budget>(
    `SELECT 
      b.*,
      c.name as category_name,
      c.color as category_color,
      COALESCE((
        SELECT SUM(t.amount) 
        FROM transactions t 
        WHERE t.category_id = b.category_id 
          AND t.type = 'EXPENSE' 
          AND t.date LIKE ?
      ), 0) as spent_amount
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    WHERE b.month = ?
    ORDER BY b.amount DESC`,
    [`${month}%`, month]
  );
}

export async function setBudget(categoryId: number, month: string, amount: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO budgets (category_id, month, amount)
     VALUES (?, ?, ?)
     ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount`,
    [categoryId, month, amount]
  );
}

