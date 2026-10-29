import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, FinancialSummary, Transaction, ScheduledBill } from '@/types';
import { getAccounts } from '@/db/accounts';
import { getFinancialSummary, getTransactions, toggleTransactionStatus } from '@/db/transactions';
import { getScheduledBills, payScheduledBill } from '@/db/scheduled';
import {
  formatCurrency,
  formatDateBR,
  getCurrentMonthISO,
  getMonthName,
} from '@/utils/formatters';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalBalance: 0,
    totalIncomeMonth: 0,
    totalExpenseMonth: 0,
    monthlyNet: 0,
    unclearedTotal: 0,
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [upcomingBills, setUpcomingBills] = useState<ScheduledBill[]>([]);

  const loadData = useCallback(async () => {
    try {
      const currentMonth = getCurrentMonthISO();
      const [sum, accs, txs, bills] = await Promise.all([
        getFinancialSummary(currentMonth),
        getAccounts(),
        getTransactions({ limit: 6 }),
        getScheduledBills(),
      ]);

      setSummary(sum);
      setAccounts(accs);
      setRecentTransactions(txs);
      setUpcomingBills(bills.filter((b) => b.is_active === 1).slice(0, 3));
    } catch (e) {
      console.error('Erro ao carregar dados do painel:', e);
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

  const handleToggleStatus = async (id: number) => {
    await toggleTransactionStatus(id);
    await loadData();
  };

  const handlePayBill = async (billId: number) => {
    await payScheduledBill(billId);
    await loadData();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 1. Header Card - Patrimônio Total */}
      <View style={[styles.mainCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.subTitle, { color: theme.subtext }]}>
          Patrimônio Líquido Total
        </Text>
        <Text
          style={[
            styles.totalAmount,
            { color: summary.totalBalance >= 0 ? theme.text : theme.expense },
          ]}
        >
          {formatCurrency(summary.totalBalance)}
        </Text>

        {summary.unclearedTotal > 0 && (
          <View style={styles.unclearedBadge}>
            <Ionicons name="time-outline" size={14} color={theme.uncleared} />
            <Text style={[styles.unclearedText, { color: theme.uncleared }]}>
              {formatCurrency(summary.unclearedTotal)} em lançamentos pendentes
            </Text>
          </View>
        )}

        {/* Resumo Mensal */}
        <View style={[styles.summaryRow, { borderTopColor: theme.border }]}>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Receitas (Mês)</Text>
            <Text style={[styles.summaryValue, { color: theme.income }]}>
              +{formatCurrency(summary.totalIncomeMonth)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Despesas (Mês)</Text>
            <Text style={[styles.summaryValue, { color: theme.expense }]}>
              -{formatCurrency(summary.totalExpenseMonth)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>Resultado</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: summary.monthlyNet >= 0 ? theme.income : theme.expense },
              ]}
            >
              {summary.monthlyNet >= 0 ? '+' : ''}
              {formatCurrency(summary.monthlyNet)}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Botões de Ação Rápida */}
      <RNView style={styles.actionButtonsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}
          onPress={() => router.push({ pathname: '/new-transaction', params: { initialType: 'INCOME' } })}
        >
          <Ionicons name="arrow-down-circle" size={22} color="#15803D" />
          <Text style={[styles.actionBtnText, { color: '#15803D' }]}>Receita</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
          onPress={() => router.push({ pathname: '/new-transaction', params: { initialType: 'EXPENSE' } })}
        >
          <Ionicons name="arrow-up-circle" size={22} color="#B91C1C" />
          <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>Despesa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#E0E7FF' }]}
          onPress={() => router.push({ pathname: '/new-transaction', params: { initialType: 'TRANSFER' } })}
        >
          <Ionicons name="swap-horizontal" size={22} color="#4338CA" />
          <Text style={[styles.actionBtnText, { color: '#4338CA' }]}>Transferir</Text>
        </TouchableOpacity>
      </RNView>

      {/* 3. Contas Bancárias & Saldos */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Minhas Contas</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/accounts')}>
          <Text style={[styles.seeAllText, { color: theme.tint }]}>Ver todas</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
        {accounts.map((acc) => (
          <TouchableOpacity
            key={acc.id}
            style={[styles.accountCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => router.push(`/account/${acc.id}` as any)}
          >
            <RNView style={styles.accountCardHeader}>
              <RNView style={[styles.accIconBadge, { backgroundColor: acc.color + '20' }]}>
                <Ionicons name="card" size={18} color={acc.color} />
              </RNView>
              <Text style={[styles.accountType, { color: theme.subtext }]}>
                {acc.type === 'CHECKING'
                  ? 'Corrente'
                  : acc.type === 'SAVINGS'
                  ? 'Poupança'
                  : acc.type === 'CREDIT_CARD'
                  ? 'Cartão'
                  : 'Carteira'}
              </Text>
            </RNView>
            <Text style={styles.accountName} numberOfLines={1}>
              {acc.name}
            </Text>
            <Text
              style={[
                styles.accountBalance,
                { color: acc.current_balance >= 0 ? theme.text : theme.expense },
              ]}
            >
              {formatCurrency(acc.current_balance)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 4. Próximas Contas a Pagar / Receber (MS Money Classic Feature) */}
      {upcomingBills.length > 0 && (
        <RNView style={{ marginTop: 24 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Contas Agendadas</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/planning')}>
              <Text style={[styles.seeAllText, { color: theme.tint }]}>Gerenciar</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.billsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {upcomingBills.map((bill, index) => (
              <RNView
                key={bill.id}
                style={[
                  styles.billItem,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                <RNView style={styles.billInfo}>
                  <Text style={styles.billTitle}>{bill.payee_name || bill.notes || 'Conta agendada'}</Text>
                  <Text style={[styles.billDate, { color: theme.subtext }]}>
                    Vence em {formatDateBR(bill.next_due_date)} • {bill.category_name || 'Geral'}
                  </Text>
                </RNView>
                <RNView style={styles.billRight}>
                  <Text
                    style={[
                      styles.billAmount,
                      { color: bill.type === 'INCOME' ? theme.income : theme.expense },
                    ]}
                  >
                    {bill.type === 'INCOME' ? '+' : '-'}
                    {formatCurrency(bill.amount)}
                  </Text>
                  <TouchableOpacity
                    style={[styles.payBtn, { backgroundColor: theme.tint }]}
                    onPress={() => handlePayBill(bill.id)}
                  >
                    <Text style={styles.payBtnText}>Lançar</Text>
                  </TouchableOpacity>
                </RNView>
              </RNView>
            ))}
          </View>
        </RNView>
      )}

      {/* 5. Últimas Transações do Livro-Caixa */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>Últimos Lançamentos</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/accounts')}>
          <Text style={[styles.seeAllText, { color: theme.tint }]}>Livro-Caixa</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.txList, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {recentTransactions.length === 0 ? (
          <RNView style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={40} color={theme.subtext} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              Nenhum lançamento registrado ainda.
            </Text>
          </RNView>
        ) : (
          recentTransactions.map((tx, index) => {
            const isExpense = tx.type === 'EXPENSE';
            const isTransfer = tx.type === 'TRANSFER';

            return (
              <RNView
                key={tx.id}
                style={[
                  styles.txRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                {/* Status Indicator (Pendente/Compensado/Conciliado) com clique para alternar */}
                <TouchableOpacity
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        tx.status === 'RECONCILED'
                          ? theme.reconciled + '20'
                          : tx.status === 'CLEARED'
                          ? theme.cleared + '20'
                          : theme.uncleared + '20',
                    },
                  ]}
                  onPress={() => handleToggleStatus(tx.id)}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color:
                          tx.status === 'RECONCILED'
                            ? theme.reconciled
                            : tx.status === 'CLEARED'
                            ? theme.cleared
                            : theme.uncleared,
                      },
                    ]}
                  >
                    {tx.status === 'RECONCILED' ? 'R' : tx.status === 'CLEARED' ? 'C' : 'P'}
                  </Text>
                </TouchableOpacity>

                {/* Info */}
                <RNView style={styles.txInfo}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {isTransfer
                      ? `Transf: ${tx.account_name} ➔ ${tx.destination_account_name}`
                      : tx.payee_name || tx.notes || 'Lançamento'}
                  </Text>
                  <Text style={[styles.txSub, { color: theme.subtext }]}>
                    {formatDateBR(tx.date)} • {tx.category_name || (isTransfer ? 'Transferência' : 'Geral')}
                  </Text>
                </RNView>

                {/* Amount */}
                <Text
                  style={[
                    styles.txAmount,
                    {
                      color: isTransfer
                        ? theme.transfer
                        : isExpense
                        ? theme.expense
                        : theme.income,
                    },
                  ]}
                >
                  {isTransfer ? '' : isExpense ? '-' : '+'}
                  {formatCurrency(tx.amount)}
                </Text>
              </RNView>
            );
          })
        )}
      </View>
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
  mainCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
  },
  unclearedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  unclearedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: '100%',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 14,
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
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  accountsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  accountCard: {
    width: 150,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 12,
  },
  accountCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  accIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountType: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  accountName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  accountBalance: {
    fontSize: 15,
    fontWeight: '800',
  },
  billsList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  billInfo: {
    flex: 1,
  },
  billTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  billDate: {
    fontSize: 12,
    marginTop: 2,
  },
  billRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  billAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  payBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  payBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  txList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  statusBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  txSub: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
  },
});
