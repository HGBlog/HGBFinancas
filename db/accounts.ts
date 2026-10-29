import { getDatabase } from './database';
import { Account, AccountType } from '@/types';

export async function getAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Account>(
    'SELECT * FROM accounts WHERE is_archived = 0 ORDER BY name ASC'
  );
}

export async function getAccountById(id: number): Promise<Account | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Account>(
    'SELECT * FROM accounts WHERE id = ?',
    [id]
  );
  return row ?? null;
}

export async function createAccount(data: {
  name: string;
  type: AccountType;
  initial_balance: number;
  color?: string;
  icon?: string;
  closing_day?: number | null;
  due_day?: number | null;
  credit_limit?: number | null;
}): Promise<number> {
  const db = await getDatabase();
  const color = data.color || '#0284C7';
  const icon = data.icon || 'card-outline';

  const result = await db.runAsync(
    `INSERT INTO accounts (
      name, type, initial_balance, current_balance, color, icon, 
      closing_day, due_day, credit_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.type,
      data.initial_balance,
      data.initial_balance,
      color,
      icon,
      data.closing_day || null,
      data.due_day || null,
      data.credit_limit || null,
    ]
  );

  return result.lastInsertRowId;
}

export async function updateAccount(
  id: number,
  data: {
    name?: string;
    type?: AccountType;
    color?: string;
    icon?: string;
    closing_day?: number | null;
    due_day?: number | null;
    credit_limit?: number | null;
  }
): Promise<void> {
  const db = await getDatabase();
  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.type !== undefined) {
    updates.push('type = ?');
    params.push(data.type);
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    params.push(data.color);
  }
  if (data.icon !== undefined) {
    updates.push('icon = ?');
    params.push(data.icon);
  }
  if (data.closing_day !== undefined) {
    updates.push('closing_day = ?');
    params.push(data.closing_day);
  }
  if (data.due_day !== undefined) {
    updates.push('due_day = ?');
    params.push(data.due_day);
  }
  if (data.credit_limit !== undefined) {
    updates.push('credit_limit = ?');
    params.push(data.credit_limit);
  }

  if (updates.length === 0) return;

  params.push(id);
  await db.runAsync(
    `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
}

export async function recalculateAccountBalance(accountId: number): Promise<number> {
  const db = await getDatabase();
  const account = await getAccountById(accountId);
  if (!account) return 0;

  // Receitas ou transferências para esta conta
  const incoming = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE (account_id = ? AND type = 'INCOME')
        OR (destination_account_id = ? AND type = 'TRANSFER')`,
    [accountId, accountId]
  );

  // Despesas ou transferências saindo desta conta
  const outgoing = await db.getFirstAsync<{ sum: number | null }>(
    `SELECT SUM(amount) as sum FROM transactions 
     WHERE account_id = ? AND (type = 'EXPENSE' OR type = 'TRANSFER')`,
    [accountId]
  );

  const totalIn = incoming?.sum ?? 0;
  const totalOut = outgoing?.sum ?? 0;
  
  // No caso de cartão de crédito, saldo negativo representa fatura devida
  let newBalance = account.initial_balance + totalIn - totalOut;

  await db.runAsync(
    'UPDATE accounts SET current_balance = ? WHERE id = ?',
    [newBalance, accountId]
  );

  return newBalance;
}

export async function recalculateAllAccountBalances(): Promise<void> {
  const accounts = await getAccounts();
  for (const acc of accounts) {
    await recalculateAccountBalance(acc.id);
  }
}
