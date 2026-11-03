import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getDatabase } from '@/db/database';
import { Transaction } from '@/types';
import { formatCurrency, getCurrentMonthISO } from '@/utils/formatters';
import { getNotificationSettings } from './settingsService';

// Configuração de comportamento padrão das notificações quando o app estiver em primeiro plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('expense-reminders', {
      name: 'Lembretes de Despesas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#EF4444',
      sound: 'default',
    });
  }
}

export async function getNotificationPermissionStatus(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.error('Erro ao solicitar permissão de notificação:', err);
    return false;
  }
}

/**
 * Dispara uma notificação de teste rápida (após 2 segundos) para validar o funcionamento no aparelho
 */
export async function sendTestNotification(): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    throw new Error('Permissão de notificação não foi concedida pelo sistema.');
  }

  await initNotifications();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Teste de Notificação - HGB Finanças',
      body: 'Tudo pronto! Você receberá lembretes 1 dia antes do vencimento de suas despesas.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: 'expense-reminders',
    },
  });
}

/**
 * Agenda lembretes de vencimento para todas as despesas a pagar
 * Regra: Notificar 1 dia antes do vencimento da despesa
 */
export async function scheduleExpenseReminderNotifications(): Promise<number> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) {
    // Se o usuário desabilitou as notificações nas configurações, cancela todos os lembretes
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }

  const hasPermission = await getNotificationPermissionStatus();
  if (!hasPermission) {
    return 0;
  }

  await initNotifications();

  // Cancelar agendamentos anteriores para evitar notificações duplicadas
  await Notifications.cancelAllScheduledNotificationsAsync();

  const db = await getDatabase();
  const currentMonth = getCurrentMonthISO();

  // Buscar todas as despesas não pagas (status = 'UNCLEARED') a partir de hoje
  const unpaidExpenses = await db.getAllAsync<Transaction & { payee_name?: string }>(`
    SELECT 
      t.*,
      p.name as payee_name
    FROM transactions t
    LEFT JOIN payees p ON t.payee_id = p.id
    WHERE t.type = 'EXPENSE' AND t.status = 'UNCLEARED'
    ORDER BY t.date ASC
  `);

  const now = new Date();
  const [notifyHourStr, notifyMinuteStr] = (settings.hour || '09:00').split(':');
  const notifyHour = parseInt(notifyHourStr, 10) || 9;
  const notifyMinute = parseInt(notifyMinuteStr, 10) || 0;

  let scheduledCount = 0;

  for (const exp of unpaidExpenses) {
    if (!exp.date || exp.date.length < 10) continue;

    const [yearStr, monthStr, dayStr] = exp.date.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Data de vencimento da despesa
    const dueDate = new Date(year, month - 1, day, notifyHour, notifyMinute, 0, 0);

    // Data da notificação: exatamente 1 dia antes do vencimento
    const reminderDate = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);

    const expenseTitle = exp.notes || exp.payee_name || 'Despesa';
    const amountFormatted = formatCurrency(exp.amount);

    if (reminderDate.getTime() > now.getTime()) {
      // O lembrete está no futuro (ex: faltam 2 ou mais dias para o vencimento)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Despesa Próxima do Vencimento',
          body: `A despesa "${expenseTitle}" no valor de ${amountFormatted} vence amanhã!`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
          channelId: 'expense-reminders',
        },
      });
      scheduledCount++;
    } else {
      // Se a data de vencimento for amanhã e o horário do lembrete já passou hoje:
      // Dispara nos próximos minutos para o usuário não perder o prazo
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);

      if (dueDate.getTime() >= tomorrowStart.getTime() && dueDate.getTime() <= tomorrowEnd.getTime()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚠️ Despesa Vence Amanhã!',
            body: `Lembrete: A despesa "${expenseTitle}" de ${amountFormatted} vence amanhã!`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 5,
            channelId: 'expense-reminders',
          },
        });
        scheduledCount++;
      }
    }
  }

  return scheduledCount;
}
