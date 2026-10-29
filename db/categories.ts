import { getDatabase } from './database';
import { Category } from '@/types';

export async function getCategories(type?: 'EXPENSE' | 'INCOME'): Promise<Category[]> {
  const db = await getDatabase();
  let query = `
    SELECT c.*, p.name as parent_name
    FROM categories c
    LEFT JOIN categories p ON c.parent_id = p.id
  `;
  const params: any[] = [];

  if (type) {
    query += ' WHERE c.type = ?';
    params.push(type);
  }

  query += ' ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.name ASC';

  return await db.getAllAsync<Category>(query, params);
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Category>(
    `SELECT c.*, p.name as parent_name
     FROM categories c
     LEFT JOIN categories p ON c.parent_id = p.id
     WHERE c.id = ?`,
    [id]
  );
  return row ?? null;
}

export async function createCategory(data: {
  name: string;
  parent_id?: number | null;
  type: 'EXPENSE' | 'INCOME';
  color?: string;
  icon?: string;
}): Promise<number> {
  const db = await getDatabase();
  const color = data.color || '#64748B';
  const icon = data.icon || 'folder';

  const result = await db.runAsync(
    `INSERT INTO categories (name, parent_id, type, color, icon)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.parent_id || null, data.type, color, icon]
  );

  return result.lastInsertRowId;
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

export async function updateCategory(
  id: number,
  data: {
    name?: string;
    parent_id?: number | null;
    color?: string;
    icon?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.parent_id !== undefined) {
    fields.push('parent_id = ?');
    params.push(data.parent_id);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    params.push(data.color);
  }
  if (data.icon !== undefined) {
    fields.push('icon = ?');
    params.push(data.icon);
  }

  if (fields.length === 0) return;
  params.push(id);

  await db.runAsync(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, params);
}
