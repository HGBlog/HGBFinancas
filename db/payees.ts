import { getDatabase } from './database';
import { Payee } from '@/types';

export async function getPayees(): Promise<Payee[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Payee>('SELECT * FROM payees ORDER BY name ASC');
}

export async function getOrCreatePayee(name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;

  const db = await getDatabase();
  const existing = await db.getFirstAsync<Payee>(
    'SELECT * FROM payees WHERE LOWER(name) = LOWER(?)',
    [trimmed]
  );

  if (existing) {
    return existing.id;
  }

  const result = await db.runAsync('INSERT INTO payees (name) VALUES (?)', [trimmed]);
  return result.lastInsertRowId;
}

