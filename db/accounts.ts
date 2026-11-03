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

export interface CbDonationsSummary {
  cbTotal: number;
  cbAccountId?: number;
  coletasTotal: number;
  coletasAccountId?: number;
  outrosTotal: number;
  outrosAccountId?: number;
}

export async function getCbDonationsSummary(monthPrefix?: string): Promise<CbDonationsSummary> {
  const db = await getDatabase();
  const accounts = await getAccounts();

  const cbAcc = accounts.find(
    (a) => a.name.trim().toUpperCase() === 'CB' || a.name.trim().toUpperCase().startsWith('CB')
  );
  const coletasAcc = accounts.find((a) => a.name.trim().toUpperCase().includes('COLETA'));
  const outrosAcc = accounts.find((a) => a.name.trim().toUpperCase().includes('OUTRO'));

  // A sessão CB e Doações deve mostrar SOMENTE receitas (type = 'INCOME') e não despesas!
  if (monthPrefix) {
    let cbTotal = 0;
    if (cbAcc) {
      const cbRes = await db.getFirstAsync<{ sum: number | null }>(
        `SELECT SUM(amount) as sum 
         FROM transactions 
         WHERE (account_id = ? OR category_id IN (SELECT id FROM categories WHERE UPPER(name) LIKE '%CB%'))
           AND type = 'INCOME'
           AND date LIKE ?`,
        [cbAcc.id, `${monthPrefix}%`]
      );
      cbTotal = cbRes?.sum ?? 0;
    }

    let coletasTotal = 0;
    if (coletasAcc) {
      const coletasRes = await db.getFirstAsync<{ sum: number | null }>(
        `SELECT SUM(amount) as sum 
         FROM transactions 
         WHERE (account_id = ? OR category_id IN (SELECT id FROM categories WHERE UPPER(name) LIKE '%COLETA%'))
           AND type = 'INCOME'
           AND date LIKE ?`,
        [coletasAcc.id, `${monthPrefix}%`]
      );
      coletasTotal = coletasRes?.sum ?? 0;
    }

    let outrosTotal = 0;
    if (outrosAcc) {
      const outrosRes = await db.getFirstAsync<{ sum: number | null }>(
        `SELECT SUM(amount) as sum 
         FROM transactions 
         WHERE (account_id = ? OR category_id IN (SELECT id FROM categories WHERE UPPER(name) LIKE '%OUTRO%' OR UPPER(name) LIKE '%DOA%'))
           AND type = 'INCOME'
           AND date LIKE ?`,
        [outrosAcc.id, `${monthPrefix}%`]
      );
      outrosTotal = outrosRes?.sum ?? 0;
    }

    return {
      cbTotal,
      cbAccountId: cbAcc?.id,
      coletasTotal,
      coletasAccountId: coletasAcc?.id,
      outrosTotal,
      outrosAccountId: outrosAcc?.id,
    };
  }

  // Se não houver monthPrefix, somar todas as receitas registradas para cada conta
  let cbTotalAll = 0;
  if (cbAcc) {
    const r = await db.getFirstAsync<{ sum: number | null }>(
      "SELECT SUM(amount) as sum FROM transactions WHERE account_id = ? AND type = 'INCOME'",
      [cbAcc.id]
    );
    cbTotalAll = r?.sum ?? 0;
  }

  let coletasTotalAll = 0;
  if (coletasAcc) {
    const r = await db.getFirstAsync<{ sum: number | null }>(
      "SELECT SUM(amount) as sum FROM transactions WHERE account_id = ? AND type = 'INCOME'",
      [coletasAcc.id]
    );
    coletasTotalAll = r?.sum ?? 0;
  }

  let outrosTotalAll = 0;
  if (outrosAcc) {
    const r = await db.getFirstAsync<{ sum: number | null }>(
      "SELECT SUM(amount) as sum FROM transactions WHERE account_id = ? AND type = 'INCOME'",
      [outrosAcc.id]
    );
    outrosTotalAll = r?.sum ?? 0;
  }

  return {
    cbTotal: cbTotalAll,
    cbAccountId: cbAcc?.id,
    coletasTotal: coletasTotalAll,
    coletasAccountId: coletasAcc?.id,
    outrosTotal: outrosTotalAll,
    outrosAccountId: outrosAcc?.id,
  };
}
