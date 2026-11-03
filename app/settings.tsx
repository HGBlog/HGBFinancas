import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  View as RNView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  getNotificationSettings,
  saveNotificationSettings,
  getReportSettings,
  saveReportSettings,
  NotificationSettings,
  ReportSettings,
} from '@/services/settingsService';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  sendTestNotification,
  scheduleExpenseReminderNotifications,
} from '@/services/notificationService';
import { exportBackup, restoreBackup } from '@/utils/backupService';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  // Estados de Notificação
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    enabled: true,
    daysBefore: 1,
    hour: '09:00',
  });
  const [hasPermission, setHasPermission] = useState(false);
  const [loadingTestNotif, setLoadingTestNotif] = useState(false);

  // Estados de Relatórios
  const [reportSettings, setReportSettings] = useState<ReportSettings>({
    includeUncleared: true,
    sortBy: 'VALUE',
    savingsTarget: 20,
  });

  // Estados de Backup
  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);

  const loadAllSettings = useCallback(async () => {
    try {
      const [nSettings, rSettings, permStatus] = await Promise.all([
        getNotificationSettings(),
        getReportSettings(),
        getNotificationPermissionStatus(),
      ]);
      setNotifSettings(nSettings);
      setReportSettings(rSettings);
      setHasPermission(permStatus);
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAllSettings();
    }, [loadAllSettings])
  );

  // Toggle de Notificações
  const handleToggleNotifications = async (val: boolean) => {
    if (val) {
      const granted = await requestNotificationPermission();
      setHasPermission(granted);
      if (!granted) {
        Alert.alert(
          'Permissão Necessária',
          'Para receber lembretes de despesas, por favor autorize as notificações nas configurações do seu celular.'
        );
      }
    }

    const updated = { ...notifSettings, enabled: val };
    setNotifSettings(updated);
    await saveNotificationSettings(updated);
    await scheduleExpenseReminderNotifications();
  };

  // Testar Notificação
  const handleTestNotification = async () => {
    try {
      setLoadingTestNotif(true);
      await sendTestNotification();
      Alert.alert(
        'Notificação Enviada!',
        'Em instantes um alerta de teste aparecerá na barra de notificações do seu celular.'
      );
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível disparar a notificação.');
    } finally {
      setLoadingTestNotif(false);
    }
  };

  // Atualizar Configuração de Relatório
  const handleToggleReportUncleared = async (val: boolean) => {
    const updated = { ...reportSettings, includeUncleared: val };
    setReportSettings(updated);
    await saveReportSettings(updated);
  };

  const handleChangeReportSort = async (sortBy: 'VALUE' | 'NAME') => {
    const updated = { ...reportSettings, sortBy };
    setReportSettings(updated);
    await saveReportSettings(updated);
  };

  const handleChangeSavingsTarget = async (savingsTarget: number) => {
    const updated = { ...reportSettings, savingsTarget };
    setReportSettings(updated);
    await saveReportSettings(updated);
  };

  // Exportar Backup
  const handleExportBackup = async () => {
    try {
      setLoadingExport(true);
      const msg = await exportBackup();
      Alert.alert('Backup Concluído', msg);
    } catch (e: any) {
      Alert.alert('Erro ao exportar', e.message || 'Falha ao gerar arquivo de backup.');
    } finally {
      setLoadingExport(false);
    }
  };

  // Restaurar Backup
  const handleRestoreBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      Alert.alert(
        'Atenção: Restaurar Backup',
        'Todos os dados atuais do app serão substituídos pelos dados do arquivo de backup selecionado. Deseja prosseguir?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sim, Restaurar',
            style: 'destructive',
            onPress: async () => {
              try {
                setLoadingRestore(true);
                let textContent = '';
                if (Platform.OS === 'web') {
                  const resp = await fetch(file.uri);
                  textContent = await resp.text();
                } else {
                  const FileSystem = require('expo-file-system/legacy') || require('expo-file-system');
                  textContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
                }

                await restoreBackup(textContent);
                await loadAllSettings();
                Alert.alert('Sucesso!', 'Dados e configurações restaurados com êxito a partir do backup.');
              } catch (err: any) {
                Alert.alert('Erro ao restaurar', err.message || 'Arquivo de backup inválido.');
              } finally {
                setLoadingRestore(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao ler o arquivo de backup.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 1. SEÇÃO DE NOTIFICAÇÕES */}
      <Text style={[styles.sectionHeading, { color: theme.subtext }]}>NOTIFICAÇÕES & LEMBRETES</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.switchRow}>
          <RNView style={styles.switchInfo}>
            <RNView style={[styles.iconCircle, { backgroundColor: '#EF444418' }]}>
              <Ionicons name="notifications" size={22} color="#EF4444" />
            </RNView>
            <RNView style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Habilitar Notificações</Text>
              <Text style={[styles.rowSub, { color: theme.subtext }]}>
                Avisar quando faltar 1 dia para pagar uma despesa
              </Text>
            </RNView>
          </RNView>
          <Switch
            value={notifSettings.enabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: theme.border, true: theme.tint }}
            thumbColor="#FFF"
          />
        </RNView>

        {notifSettings.enabled && (
          <RNView style={[styles.notifDetails, { borderTopColor: theme.border }]}>
            <RNView style={styles.ruleBadgeRow}>
              <Ionicons name="time-outline" size={16} color={theme.tint} />
              <Text style={[styles.ruleBadgeText, { color: theme.text }]}>
                Regra ativa: Notificar às {notifSettings.hour} (1 dia antes do vencimento)
              </Text>
            </RNView>

            <RNView style={styles.permissionStatusRow}>
              <RNView
                style={[
                  styles.statusDot,
                  { backgroundColor: hasPermission ? '#10B981' : '#F59E0B' },
                ]}
              />
              <Text style={[styles.permStatusText, { color: theme.subtext }]}>
                {hasPermission
                  ? 'Permissão de notificação concedida'
                  : 'Aguardando autorização do sistema'}
              </Text>
            </RNView>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: theme.tint + '18' }]}
              onPress={handleTestNotification}
              disabled={loadingTestNotif}
            >
              {loadingTestNotif ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color={theme.tint} />
                  <Text style={[styles.testBtnText, { color: theme.tint }]}>
                    Testar Notificação Agora
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </RNView>
        )}
      </View>

      {/* 2. SEÇÃO DE CONFIGURAÇÃO DE RELATÓRIOS */}
      <Text style={[styles.sectionHeading, { color: theme.subtext, marginTop: 24 }]}>
        CONFIGURAÇÃO DE RELATÓRIOS
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Incluir despesas a vencer */}
        <RNView style={styles.switchRow}>
          <RNView style={styles.switchInfo}>
            <RNView style={[styles.iconCircle, { backgroundColor: '#3B82F618' }]}>
              <Ionicons name="pie-chart" size={22} color="#3B82F6" />
            </RNView>
            <RNView style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Incluir Despesas a Vencer</Text>
              <Text style={[styles.rowSub, { color: theme.subtext }]}>
                Considerar despesas do mês ainda não pagas nos gráficos
              </Text>
            </RNView>
          </RNView>
          <Switch
            value={reportSettings.includeUncleared}
            onValueChange={handleToggleReportUncleared}
            trackColor={{ false: theme.border, true: theme.tint }}
            thumbColor="#FFF"
          />
        </RNView>

        <RNView style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Ordenação das Categorias */}
        <RNView style={styles.optionSection}>
          <Text style={[styles.optionLabel, { color: theme.subtext }]}>
            Ordenação das Categorias no Relatório
          </Text>
          <RNView style={styles.pillRow}>
            <TouchableOpacity
              style={[
                styles.pillBtn,
                { borderColor: theme.border },
                reportSettings.sortBy === 'VALUE' && {
                  backgroundColor: theme.tint,
                  borderColor: theme.tint,
                },
              ]}
              onPress={() => handleChangeReportSort('VALUE')}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: reportSettings.sortBy === 'VALUE' ? '#FFF' : theme.text },
                ]}
              >
                Por Maior Gasto
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pillBtn,
                { borderColor: theme.border },
                reportSettings.sortBy === 'NAME' && {
                  backgroundColor: theme.tint,
                  borderColor: theme.tint,
                },
              ]}
              onPress={() => handleChangeReportSort('NAME')}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: reportSettings.sortBy === 'NAME' ? '#FFF' : theme.text },
                ]}
              >
                Alfabética (A-Z)
              </Text>
            </TouchableOpacity>
          </RNView>
        </RNView>

        <RNView style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Meta Mensal de Economia */}
        <RNView style={styles.optionSection}>
          <Text style={[styles.optionLabel, { color: theme.subtext }]}>
            Meta Alvo de Poupança / Economia Mensal
          </Text>
          <RNView style={styles.pillRow}>
            {[10, 20, 30, 40, 50].map((percent) => {
              const isSelected = reportSettings.savingsTarget === percent;
              return (
                <TouchableOpacity
                  key={percent}
                  style={[
                    styles.targetPill,
                    { borderColor: theme.border },
                    isSelected && {
                      backgroundColor: theme.income,
                      borderColor: theme.income,
                    },
                  ]}
                  onPress={() => handleChangeSavingsTarget(percent)}
                >
                  <Text
                    style={[
                      styles.targetPillText,
                      { color: isSelected ? '#FFF' : theme.text },
                    ]}
                  >
                    {percent}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RNView>
        </RNView>
      </View>

      {/* 3. SEÇÃO DE BACKUP & EXPORTAÇÃO */}
      <Text style={[styles.sectionHeading, { color: theme.subtext, marginTop: 24 }]}>
        CÓPIA DE SEGURANÇA (BACKUP & EXPORTAÇÃO)
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.backupHeader}>
          <RNView style={[styles.iconCircle, { backgroundColor: '#10B98118' }]}>
            <Ionicons name="shield-checkmark" size={24} color="#10B981" />
          </RNView>
          <RNView style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Backup Universal em Formato JSON (.json)</Text>
            <Text style={[styles.rowSub, { color: theme.subtext }]}>
              Exporta todos os lançamentos, contas, favorecidos e configurações. Permite restaurar em qualquer momento.
            </Text>
          </RNView>
        </RNView>

        <RNView style={styles.backupActionsRow}>
          {/* Botão Exportar */}
          <TouchableOpacity
            style={[styles.backupBtn, { backgroundColor: theme.tint }]}
            onPress={handleExportBackup}
            disabled={loadingExport}
          >
            {loadingExport ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#FFF" />
                <Text style={styles.backupBtnText}>Exportar Backup (.json)</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Botão Restaurar */}
          <TouchableOpacity
            style={[styles.backupBtn, { backgroundColor: '#D97706' }]}
            onPress={handleRestoreBackup}
            disabled={loadingRestore}
          >
            {loadingRestore ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color="#FFF" />
                <Text style={styles.backupBtnText}>Restaurar Backup (.json)</Text>
              </>
            )}
          </TouchableOpacity>
        </RNView>
      </View>

      {/* 4. SOBRE O APP */}
      <RNView style={styles.footerInfo}>
        <Text style={[styles.footerText, { color: theme.subtext }]}>
          HGB Finanças • Versão 1.0.0
        </Text>
        <Text style={[styles.footerSubText, { color: theme.subtext }]}>
          Seus dados estão protegidos localmente no seu dispositivo.
        </Text>
      </RNView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  notifDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  ruleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  permissionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  permStatusText: {
    fontSize: 12,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  optionSection: {
    gap: 8,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  targetPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  targetPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backupActionsRow: {
    gap: 10,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  backupBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  footerInfo: {
    alignItems: 'center',
    marginTop: 30,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footerSubText: {
    fontSize: 11,
    textAlign: 'center',
  },
});

