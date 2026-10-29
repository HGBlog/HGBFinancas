import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  View as RNView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, AccountType } from '@/types';
import { getAccounts, createAccount, recalculateAllAccountBalances } from '@/db/accounts';
import { formatCurrency } from '@/utils/formatters';

const ACCOUNT_TYPES: { label: string; value: AccountType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Conta Corrente', value: 'CHECKING', icon: 'business-outline' },
  { label: 'Poupança / Reserva', value: 'SAVINGS', icon: 'wallet-outline' },
  { label: 'Cartão de Crédito', value: 'CREDIT_CARD', icon: 'card-outline' },
  { label: 'Dinheiro / Carteira', value: 'CASH', icon: 'cash-outline' },
  { label: 'Investimentos', value: 'INVESTMENT', icon: 'trending-up-outline' },
];

export default function AccountsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Formulário de nova conta
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('CHECKING');
  const [newAccBalance, setNewAccBalance] = useState('');

  // Campos específicos de Cartão de Crédito
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  const loadData = useCallback(async () => {
    try {
      await recalculateAllAccountBalances();
      const list = await getAccounts();
      setAccounts(list);
    } catch (e) {
      console.error('Erro ao carregar contas:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateAccount = async () => {
    if (!newAccName.trim()) return;

    const initial = parseFloat(newAccBalance.replace(',', '.')) || 0;
    let color = '#0284C7';
    let icon = 'business-outline';

    if (newAccType === 'SAVINGS') {
      color = '#7C3AED';
      icon = 'wallet-outline';
    } else if (newAccType === 'CREDIT_CARD') {
      color = '#DC2626';
      icon = 'card';
    } else if (newAccType === 'CASH') {
      color = '#059669';
      icon = 'cash-outline';
    } else if (newAccType === 'INVESTMENT') {
      color = '#0D9488';
      icon = 'trending-up-outline';
    }

    await createAccount({
      name: newAccName.trim(),
      type: newAccType,
      initial_balance: initial,
      color,
      icon,
      closing_day: newAccType === 'CREDIT_CARD' ? parseInt(closingDay, 10) || null : null,
      due_day: newAccType === 'CREDIT_CARD' ? parseInt(dueDay, 10) || null : null,
      credit_limit: newAccType === 'CREDIT_CARD' ? parseFloat(creditLimit.replace(',', '.')) || null : null,
    });

    setNewAccName('');
    setNewAccBalance('');
    setClosingDay('');
    setDueDay('');
    setCreditLimit('');
    setModalVisible(false);
    await loadData();
  };

  const totalAssets = accounts.reduce((acc, curr) => acc + curr.current_balance, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Total consolidado */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.headerLabel, { color: theme.subtext }]}>Saldo Total Consolidado</Text>
          <Text
            style={[
              styles.headerValue,
              { color: totalAssets >= 0 ? theme.text : theme.expense },
            ]}
          >
            {formatCurrency(totalAssets)}
          </Text>
          <Text style={[styles.headerSub, { color: theme.subtext }]}>
            {accounts.length} contas cadastradas
          </Text>

          {/* Atalhos Rápidos: OFX, Backup, Categorias */}
          <RNView style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickActionBtn, { borderColor: theme.border }]}
              onPress={() => router.push('/import-ofx')}
            >
              <Ionicons name="document-text-outline" size={16} color={theme.tint} />
              <Text style={[styles.quickActionText, { color: theme.tint }]}>Importar OFX</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionBtn, { borderColor: theme.border }]}
              onPress={() => router.push('/category-manager')}
            >
              <Ionicons name="pricetags-outline" size={16} color={theme.tint} />
              <Text style={[styles.quickActionText, { color: theme.tint }]}>Categorias</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionBtn, { borderColor: theme.border }]}
              onPress={() => router.push('/backup')}
            >
              <Ionicons name="cloud-outline" size={16} color={theme.tint} />
              <Text style={[styles.quickActionText, { color: theme.tint }]}>Backup</Text>
            </TouchableOpacity>
          </RNView>
        </View>

        {/* Lista de Contas */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Livro-Caixa por Conta</Text>
          <TouchableOpacity
            style={[styles.addAccBtn, { backgroundColor: theme.tint }]}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addAccText}>Nova Conta</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.accountsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {accounts.map((acc, index) => {
            const isCreditCard = acc.type === 'CREDIT_CARD';
            const isNegative = acc.current_balance < 0;

            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
                onPress={() => router.push(`/account/${acc.id}` as any)}
              >
                <RNView style={[styles.iconCircle, { backgroundColor: acc.color + '20' }]}>
                  <Ionicons name={isCreditCard ? 'card' : 'wallet'} size={20} color={acc.color} />
                </RNView>

                <RNView style={styles.accountDetails}>
                  <Text style={styles.accName}>{acc.name}</Text>
                  <Text style={[styles.accType, { color: theme.subtext }]}>
                    {acc.type === 'CHECKING'
                      ? 'Conta Corrente'
                      : acc.type === 'SAVINGS'
                      ? 'Poupança / Reserva'
                      : isCreditCard
                      ? 'Cartão de Crédito'
                      : acc.type === 'INVESTMENT'
                      ? 'Investimento'
                      : 'Carteira / Dinheiro'}
                  </Text>

                  {/* Informações avançadas de Cartão de Crédito */}
                  {isCreditCard && acc.closing_day && (
                    <Text style={[styles.ccHighlight, { color: theme.subtext }]}>
                      Melhor dia: <Text style={{ fontWeight: '700', color: theme.tint }}>dia {acc.closing_day}</Text>
                      {acc.due_day ? ` • Vence dia ${acc.due_day}` : ''}
                    </Text>
                  )}
                </RNView>

                <RNView style={styles.balanceContainer}>
                  <Text
                    style={[
                      styles.balanceAmount,
                      { color: isNegative ? theme.expense : theme.text },
                    ]}
                  >
                    {formatCurrency(acc.current_balance)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
                </RNView>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal Nova Conta */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <RNView style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}>
            <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
              <Text style={styles.modalTitle}>Criar Nova Conta</Text>

              <Text style={[styles.inputLabel, { color: theme.subtext }]}>Nome da Conta</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                ]}
                placeholder="Ex: Nubank, Itaú, Carteira..."
                placeholderTextColor={theme.subtext}
                value={newAccName}
                onChangeText={setNewAccName}
              />

              <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>
                Tipo de Conta
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typesRow}>
                {ACCOUNT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.typeChip,
                      { borderColor: theme.border },
                      newAccType === t.value && { backgroundColor: theme.tint, borderColor: theme.tint },
                    ]}
                    onPress={() => setNewAccType(t.value)}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={newAccType === t.value ? '#FFF' : theme.text}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        { color: newAccType === t.value ? '#FFF' : theme.text },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>
                Saldo Inicial (R$)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                ]}
                placeholder="0,00"
                placeholderTextColor={theme.subtext}
                keyboardType="numeric"
                value={newAccBalance}
                onChangeText={setNewAccBalance}
              />

              {/* Se for Cartão de Crédito, exibir configurações avançadas */}
              {newAccType === 'CREDIT_CARD' && (
                <RNView style={{ marginTop: 12 }}>
                  <Text style={[styles.inputLabel, { color: theme.subtext }]}>
                    Limite Total de Crédito (R$)
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                    ]}
                    placeholder="Ex: 5000,00"
                    placeholderTextColor={theme.subtext}
                    keyboardType="numeric"
                    value={creditLimit}
                    onChangeText={setCreditLimit}
                  />

                  <RNView style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <RNView style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext }]}>
                        Dia Fechamento
                      </Text>
                      <TextInput
                        style={[
                          styles.textInput,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        placeholder="Ex: 25"
                        placeholderTextColor={theme.subtext}
                        keyboardType="number-pad"
                        maxLength={2}
                        value={closingDay}
                        onChangeText={setClosingDay}
                      />
                    </RNView>

                    <RNView style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { color: theme.subtext }]}>
                        Dia Vencimento
                      </Text>
                      <TextInput
                        style={[
                          styles.textInput,
                          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                        ]}
                        placeholder="Ex: 5"
                        placeholderTextColor={theme.subtext}
                        keyboardType="number-pad"
                        maxLength={2}
                        value={dueDay}
                        onChangeText={setDueDay}
                      />
                    </RNView>
                  </RNView>
                </RNView>
              )}

              <RNView style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.tint }]}
                  onPress={handleCreateAccount}
                >
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Salvar Conta</Text>
                </TouchableOpacity>
              </RNView>
            </View>
          </ScrollView>
        </RNView>
      </Modal>
    </View>
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
  headerCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  headerValue: {
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 4,
  },
  headerSub: {
    fontSize: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addAccBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addAccText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  accountsList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountDetails: {
    flex: 1,
  },
  accName: {
    fontSize: 15,
    fontWeight: '700',
  },
  accType: {
    fontSize: 12,
    marginTop: 2,
  },
  ccHighlight: {
    fontSize: 11,
    marginTop: 3,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  typesRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
