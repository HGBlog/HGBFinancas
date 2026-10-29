import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('mmoney.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await initDatabase(db);
  dbInstance = db;
  return db;
}

async function initDatabase(db: SQLite.SQLiteDatabase) {
  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      initial_balance REAL NOT NULL DEFAULT 0.0,
      current_balance REAL NOT NULL DEFAULT 0.0,
      color TEXT NOT NULL DEFAULT '#1E40AF',
      icon TEXT NOT NULL DEFAULT 'account-balance',
      closing_day INTEGER,
      due_day INTEGER,
      credit_limit REAL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748B',
      icon TEXT NOT NULL DEFAULT 'folder',
      FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      destination_account_id INTEGER,
      category_id INTEGER,
      payee_id INTEGER,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNCLEARED',
      notes TEXT,
      check_number TEXT,
      is_split INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
      FOREIGN KEY (destination_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
      FOREIGN KEY (payee_id) REFERENCES payees (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      memo TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
      UNIQUE(category_id, month)
    );

    CREATE TABLE IF NOT EXISTS scheduled_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      category_id INTEGER,
      payee_id INTEGER,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      due_day INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'MONTHLY',
      auto_record INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      next_due_date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
      FOREIGN KEY (payee_id) REFERENCES payees (id) ON DELETE SET NULL
    );
  `);

  // Migrações dinâmicas para adicionar colunas em bases existentes
  try {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN closing_day INTEGER;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN due_day INTEGER;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN credit_limit REAL;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN is_split INTEGER NOT NULL DEFAULT 0;');
  } catch {}

  // Seed default accounts if empty
  const accountCount = await db.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM accounts');
  if (accountCount && accountCount.count === 0) {
    await seedDefaultData(db);
  }
}

async function seedDefaultData(db: SQLite.SQLiteDatabase) {
  // Contas padrão
  await db.runAsync(
    `INSERT INTO accounts (name, type, initial_balance, current_balance, color, icon, closing_day, due_day, credit_limit) VALUES 
     ('Conta Corrente', 'CHECKING', 0, 0, '#0284C7', 'card-outline', NULL, NULL, NULL),
     ('Carteira (Dinheiro)', 'CASH', 0, 0, '#059669', 'cash-outline', NULL, NULL, NULL),
     ('Cartão de Crédito', 'CREDIT_CARD', 0, 0, '#DC2626', 'card', 25, 5, 3000),
     ('Poupança / Reserva', 'SAVINGS', 0, 0, '#7C3AED', 'wallet-outline', NULL, NULL, NULL)`
  );

  // Categorias padrão inspiradas no Microsoft Money
  // 1. Receitas
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Salário', 'INCOME', '#10B981', 'cash')`);
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Rendimentos', 'INCOME', '#059669', 'trending-up')`);
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Outras Receitas', 'INCOME', '#34D399', 'add-circle-outline')`);

  // 2. Despesas Principais e Subcategorias
  // Moradia
  const moradia = await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Moradia', 'EXPENSE', '#3B82F6', 'home')`);
  const moradiaId = moradia.lastInsertRowId;
  await db.runAsync(`INSERT INTO categories (name, parent_id, type, color, icon) VALUES 
    ('Aluguel / Condomínio', ${moradiaId}, 'EXPENSE', '#3B82F6', 'business'),
    ('Energia Elétrica', ${moradiaId}, 'EXPENSE', '#3B82F6', 'flash'),
    ('Água e Esgoto', ${moradiaId}, 'EXPENSE', '#3B82F6', 'water'),
    ('Internet / TV', ${moradiaId}, 'EXPENSE', '#3B82F6', 'wifi')`);

  // Alimentação
  const alimentacao = await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Alimentação', 'EXPENSE', '#F59E0B', 'restaurant')`);
  const alimentacaoId = alimentacao.lastInsertRowId;
  await db.runAsync(`INSERT INTO categories (name, parent_id, type, color, icon) VALUES 
    ('Supermercado', ${alimentacaoId}, 'EXPENSE', '#F59E0B', 'cart'),
    ('Restaurantes & Lanches', ${alimentacaoId}, 'EXPENSE', '#F59E0B', 'fast-food'),
    ('Padaria', ${alimentacaoId}, 'EXPENSE', '#F59E0B', 'cafe')`);

  // Transporte
  const transporte = await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Transporte', 'EXPENSE', '#EC4899', 'car')`);
  const transporteId = transporte.lastInsertRowId;
  await db.runAsync(`INSERT INTO categories (name, parent_id, type, color, icon) VALUES 
    ('Combustível', ${transporteId}, 'EXPENSE', '#EC4899', 'speedometer'),
    ('Manutenção do Veículo', ${transporteId}, 'EXPENSE', '#EC4899', 'construct'),
    ('Transporte Público / App', ${transporteId}, 'EXPENSE', '#EC4899', 'bus')`);

  // Saúde
  const saude = await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Saúde', 'EXPENSE', '#EF4444', 'medkit')`);
  const saudeId = saude.lastInsertRowId;
  await db.runAsync(`INSERT INTO categories (name, parent_id, type, color, icon) VALUES 
    ('Farmácia', ${saudeId}, 'EXPENSE', '#EF4444', 'medical'),
    ('Consultas e Exames', ${saudeId}, 'EXPENSE', '#EF4444', 'pulse')`);

  // Lazer & Educação
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Lazer & Viagens', 'EXPENSE', '#8B5CF6', 'airplane')`);
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Educação & Cursos', 'EXPENSE', '#6366F1', 'school')`);
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Compras & Vestuário', 'EXPENSE', '#14B8A6', 'shirt')`);
  await db.runAsync(`INSERT INTO categories (name, type, color, icon) VALUES ('Tarifas & Impostos', 'EXPENSE', '#64748B', 'receipt')`);

  // Favorecidos de exemplo
  await db.runAsync(`INSERT INTO payees (name) VALUES 
    ('Supermercado'),
    ('Posto de Gasolina'),
    ('Restaurante'),
    ('Farmácia'),
    ('Companhia de Energia')`);
}
