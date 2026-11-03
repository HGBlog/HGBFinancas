import { getDatabase } from '@/db/database';

export interface NotificationSettings {
  enabled: boolean;
  daysBefore: number; // Padrão 1 dia antes
  hour: string; // Ex: '09:00'
}

export interface ReportSettings {
  includeUncleared: boolean;
  sortBy: 'VALUE' | 'NAME';
  savingsTarget: number; // Ex: 20 (%)
}

export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return row ? row.value : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const [enabledStr, daysBeforeStr, hour] = await Promise.all([
    getSetting('notif_enabled', 'true'),
    getSetting('notif_days_before', '1'),
    getSetting('notif_hour', '09:00'),
  ]);

  return {
    enabled: enabledStr === 'true',
    daysBefore: parseInt(daysBeforeStr, 10) || 1,
    hour: hour || '09:00',
  };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await Promise.all([
    setSetting('notif_enabled', settings.enabled ? 'true' : 'false'),
    setSetting('notif_days_before', String(settings.daysBefore)),
    setSetting('notif_hour', settings.hour),
  ]);
}

export async function getReportSettings(): Promise<ReportSettings> {
  const [includeUnclearedStr, sortBy, savingsTargetStr] = await Promise.all([
    getSetting('reports_include_uncleared', 'true'),
    getSetting('reports_sort_by', 'VALUE'),
    getSetting('reports_savings_target', '20'),
  ]);

  return {
    includeUncleared: includeUnclearedStr === 'true',
    sortBy: sortBy === 'NAME' ? 'NAME' : 'VALUE',
    savingsTarget: parseInt(savingsTargetStr, 10) || 20,
  };
}

export async function saveReportSettings(settings: ReportSettings): Promise<void> {
  await Promise.all([
    setSetting('reports_include_uncleared', settings.includeUncleared ? 'true' : 'false'),
    setSetting('reports_sort_by', settings.sortBy),
    setSetting('reports_savings_target', String(settings.savingsTarget)),
  ]);
}

