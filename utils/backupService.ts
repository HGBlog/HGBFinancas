import { recalculateAllAccountBalances } from '@/db/accounts';
import { getDatabase } from '@/db/database';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { getTodayISO } from './formatters';

export async function exportBackup(): Promise<string> {
  const db = await getDatabase();

  const [accounts, categories, payees, transactions, splits, budgets, bills] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts'),
    db.getAllAsync('SELECT * FROM categories'),
    db.getAllAsync('SELECT * FROM payees'),
    db.getAllAsync('SELECT * FROM transactions'),
    db.getAllAsync('SELECT * FROM transaction_splits'),
    db.getAllAsync('SELECT * FROM budgets'),
    db.getAllAsync('SELECT * FROM scheduled_bills'),
  ]);

  const backupData = {
    version: 1,
    appName: 'HGB Finanças',
    exportedAt: new Date().toISOString(),
    data: {
      accounts,
      categories,
      payees,
      transactions,
      transaction_splits: splits,
      budgets,
      scheduled_bills: bills,
    },
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const fileName = `hgb_financas_backup_${getTodayISO()}.json`;

  if (Platform.OS === 'web') {
    // Download no navegador
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return 'Backup baixado com sucesso!';
  } else {
    // Compartilhamento no Android / iOS via expo-file-system
    const FileSystem = require('expo-file-system/legacy') || require('expo-file-system');
    const path = `${FileSystem.documentDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(path, jsonString, { encoding: 'utf8' });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'application/json',
        dialogTitle: 'Exportar Backup do HGB Finanças',
        UTI: 'public.json',
      });
      return 'Backup exportado com sucesso!';
    } else {
      return `Arquivo salvo em: ${path}`;
    }
  }
}

export async function restoreBackup(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString);
  if (!parsed.data || !parsed.data.accounts) {
    throw new Error('Arquivo de backup inválido.');
  }

  const db = await getDatabase();
  const d = parsed.data;

  // Desativar chaves estrangeiras temporariamente para restaurar em lote
  await db.execAsync('PRAGMA foreign_keys = OFF;');

  try {
    await db.execAsync(`
      DELETE FROM transaction_splits;
      DELETE FROM transactions;
      DELETE FROM scheduled_bills;
      DELETE FROM budgets;
      DELETE FROM categories;
      DELETE FROM payees;
      DELETE FROM accounts;
    `);

    // Restaurar contas
    for (const a of d.accounts || []) {
      await db.runAsync(
        `INSERT INTO accounts (id, name, type, initial_balance, current_balance, color, icon, closing_day, due_day, credit_limit, is_archived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.name, a.type, a.initial_balance, a.current_balance, a.color, a.icon, a.closing_day || null, a.due_day || null, a.credit_limit || null, a.is_archived || 0, a.created_at]
      );
    }

    // Restaurar categorias
    for (const c of d.categories || []) {
      await db.runAsync(
        `INSERT INTO categories (id, name, parent_id, type, color, icon)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.parent_id || null, c.type, c.color, c.icon]
      );
    }

    // Restaurar favorecidos
    for (const p of d.payees || []) {
      await db.runAsync('INSERT OR IGNORE INTO payees (id, name) VALUES (?, ?)', [p.id, p.name]);
    }

    // Restaurar transações
    for (const t of d.transactions || []) {
      await db.runAsync(
        `INSERT INTO transactions (id, account_id, destination_account_id, category_id, payee_id, amount, type, date, status, notes, check_number, is_split, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.account_id, t.destination_account_id || null, t.category_id || null, t.payee_id || null, t.amount, t.type, t.date, t.status, t.notes || null, t.check_number || null, t.is_split || 0, t.created_at]
      );
    }

    // Restaurar splits
    for (const s of d.transaction_splits || []) {
      await db.runAsync(
        `INSERT INTO transaction_splits (id, transaction_id, category_id, amount, memo)
         VALUES (?, ?, ?, ?, ?)`,
        [s.id, s.transaction_id, s.category_id, s.amount, s.memo || null]
      );
    }

    // Restaurar orçamentos
    for (const b of d.budgets || []) {
      await db.runAsync(
        `INSERT INTO budgets (id, category_id, month, amount)
         VALUES (?, ?, ?, ?)`,
        [b.id, b.category_id, b.month, b.amount]
      );
    }

    // Restaurar agendamentos
    for (const sb of d.scheduled_bills || []) {
      await db.runAsync(
        `INSERT INTO scheduled_bills (id, account_id, category_id, payee_id, amount, type, due_day, frequency, auto_record, is_active, next_due_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sb.id, sb.account_id, sb.category_id || null, sb.payee_id || null, sb.amount, sb.type, sb.due_day, sb.frequency, sb.auto_record || 0, sb.is_active || 1, sb.next_due_date, sb.notes || null]
      );
    }

    await recalculateAllAccountBalances();
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

