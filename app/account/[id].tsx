import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  View as RNView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Transaction, TransactionStatus } from '@/types';
import { getAccountById, recalculateAccountBalance } from '@/db/accounts';
import {
  getTransactions,
  toggleTransactionStatus,
  deleteTransaction,
  getTransactionSplits,
} from '@/db/transactions';
import { formatCurrency, formatDateBR } from '@/utils/formatters';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = parseInt(id, 10);

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | 'ALL'>('ALL');
  const [expandedSplits, setExpandedSplits] = useState<Record<number, boolean>>({});

  const loadData = useCallback(async () => {
    if (!accountId) return;
    try {
      await recalculateAccountBalance(accountId);
      const acc = await getAccountById(accountId);
      setAccount(acc);

      const txs = await getTransactions({
        accountId,
        status: filterStatus === 'ALL' ? undefined : filterStatus,
        searchQuery: searchQuery.trim() || undefined,
      });

      // Carregar splits para transações divididas
      for (const t of txs) {
        if (t.is_split === 1) {
          t.splits = await getTransactionSplits(t.id);
        }
      }

      setTransactions(txs);
    } catch (e) {
      console.error('Erro ao carregar livro-caixa da conta:', e);
    }
  }, [accountId, filterStatus, searchQuery]);

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

  const handleToggleStatus = async (txId: number) => {
    await toggleTransactionStatus(txId);
    await loadData();
  };

  const handleDelete = (txId: number) => {
    Alert.alert('Excluir Lançamento', 'Tem certeza que deseja apagar este registro do livro-caixa?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txId);
          await loadData();
        },
      },
    ]);
  };

  const toggleExpandSplits = (txId: number) => {
    setExpandedSplits((prev) => ({ ...prev, [txId]: !prev[txId] }));
  };

  const isCreditCard = account?.type === 'CREDIT_CARD';
  const creditLimit = account?.credit_limit || 0;
  // No cartão, saldo negativo significa fatura a pagar
  const usedLimit = Math.abs(account?.current_balance || 0);
  const availableLimit = Math.max(0, creditLimit - usedLimit);
  const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((usedLimit / creditLimit) * 100)) : 0;

  const clearedTotal = transactions
    .filter((t) => t.status !== 'UNCLEARED')
    .reduce((sum, t) => {
      if (t.type === 'INCOME') return sum + t.amount;
      if (t.type === 'EXPENSE') return sum - t.amount;
      if (t.type === 'TRANSFER') {
        return t.account_id === accountId ? sum - t.amount : sum + t.amount;
      }
      return sum;
    }, account?.initial_balance || 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: account?.name || 'Livro-Caixa' }} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Cartão de Saldo da Conta */}
        <View style={[styles.balanceCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <RNView style={styles.accBadgeRow}>
            <RNView style={[styles.badge, { backgroundColor: (account?.color || theme.tint) + '20' }]}>
              <Ionicons name={isCreditCard ? 'card' : 'wallet'} size={16} color={account?.color || theme.tint} />
              <Text style={[styles.badgeText, { color: account?.color || theme.tint }]}>
                {account?.type}
              </Text>
            </RNView>

            <RNView style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.smallActionBtn, { borderColor: theme.border }]}
                onPress={() => router.push({ pathname: '/import-ofx', params: { accountId: String(accountId) } })}
              >
                <Ionicons name="document-text-outline" size={16} color={theme.tint} />
                <Text style={[styles.smallActionText, { color: theme.tint }]}>OFX</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.newTxBtn, { backgroundColor: theme.tint }]}
                onPress={() =>
                  router.push({
                    pathname: '/new-transaction',
                    params: { initialAccountId: String(accountId) },
                  })
                }
              >
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={styles.newTxBtnText}>Novo Lançamento</Text>
              </TouchableOpacity>
            </RNView>
          </RNView>

          <Text style={[styles.balanceLabel, { color: theme.subtext }]}>
            {isCreditCard ? 'Fatura Atual Aberta' : 'Saldo Atual'}
          </Text>
          <Text
            style={[
              styles.currentBalance,
              { color: (account?.current_balance || 0) >= 0 ? theme.text : theme.expense },
            ]}
          >
            {formatCurrency(account?.current_balance || 0)}
          </Text>

          {/* Gestão Avançada de Cartão de Crédito */}
          {isCreditCard && (
            <RNView style={styles.ccDetailsBox}>
              {creditLimit > 0 && (
                <>
                  <RNView style={styles.ccLimitRow}>
                    <Text style={[styles.ccLimitText, { color: theme.subtext }]}>
                      Limite Utilizado: {formatCurrency(usedLimit)} ({usedPercent}%)
                    </Text>
                    <Text style={[styles.ccLimitText, { color: theme.income, fontWeight: '700' }]}>
                      Disponível: {formatCurrency(availableLimit)}
                    </Text>
                  </RNView>

                  <RNView style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                    <RNView
                      style={[
                        styles.progressBarFill,
                        { width: `${usedPercent}%`, backgroundColor: usedPercent > 85 ? theme.expense : theme.tint },
                      ]}
                    />
                  </RNView>
                </>
              )}

              {account.closing_day && (
                <RNView style={styles.ccDatesRow}>
                  <Text style={[styles.ccDateItem, { color: theme.subtext }]}>
                    Melhor dia de compra: <Text style={{ fontWeight: '700', color: theme.tint }}>dia {account.closing_day}</Text>
                  </Text>
                  {account.due_day && (
                    <Text style={[styles.ccDateItem, { color: theme.subtext }]}>
                      Vencimento: <Text style={{ fontWeight: '700', color: theme.text }}>dia {account.due_day}</Text>
                    </Text>
                  )}
                </RNView>
              )}
            </RNView>
          )}

          <RNView style={[styles.clearedRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.clearedLabel, { color: theme.subtext }]}>
              Saldo Compensado (C/R):
            </Text>
            <Text style={[styles.clearedVal, { color: theme.text }]}>
              {formatCurrency(clearedTotal)}
            </Text>
          </RNView>
        </View>

        {/* Barra de Busca e Filtros */}
        <RNView style={styles.filterSection}>
          <RNView
            style={[
              styles.searchBar,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search" size={18} color={theme.subtext} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Buscar favorecido, nota ou categoria..."
              placeholderTextColor={theme.subtext}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.subtext} />
              </TouchableOpacity>
            )}
          </RNView>

          {/* Chips de Status (MS Money Conciliation filter) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusChipsRow}>
            <TouchableOpacity
              style={[
                styles.statusFilterChip,
                { borderColor: theme.border },
                filterStatus === 'ALL' && { backgroundColor: theme.text, borderColor: theme.text },
              ]}
              onPress={() => setFilterStatus('ALL')}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  { color: filterStatus === 'ALL' ? theme.background : theme.text },
                ]}
              >
                Todos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusFilterChip,
                { borderColor: theme.border },
                filterStatus === 'UNCLEARED' && {
                  backgroundColor: theme.uncleared,
                  borderColor: theme.uncleared,
                },
              ]}
              onPress={() => setFilterStatus('UNCLEARED')}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  { color: filterStatus === 'UNCLEARED' ? '#FFF' : theme.text },
                ]}
              >
                Pendentes (P)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusFilterChip,
                { borderColor: theme.border },
                filterStatus === 'CLEARED' && {
                  backgroundColor: theme.cleared,
                  borderColor: theme.cleared,
                },
              ]}
              onPress={() => setFilterStatus('CLEARED')}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  { color: filterStatus === 'CLEARED' ? '#FFF' : theme.text },
                ]}
              >
                Compensados (C)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusFilterChip,
                { borderColor: theme.border },
                filterStatus === 'RECONCILED' && {
                  backgroundColor: theme.reconciled,
                  borderColor: theme.reconciled,
                },
              ]}
              onPress={() => setFilterStatus('RECONCILED')}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  { color: filterStatus === 'RECONCILED' ? '#FFF' : theme.text },
                ]}
              >
                Conciliados (R)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </RNView>

        {/* Tabela do Livro-Caixa (Register) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Livro-Caixa ({transactions.length})</Text>
          <Text style={[styles.helperNotice, { color: theme.subtext }]}>
            Toque na letra (P/C/R) para conciliar
          </Text>
        </View>

        <View style={[styles.registerList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {transactions.length === 0 ? (
            <RNView style={styles.emptyView}>
              <Ionicons name="receipt-outline" size={40} color={theme.subtext} />
              <Text style={[styles.emptyText, { color: theme.subtext }]}>
                Nenhum lançamento encontrado para esta conta.
              </Text>
            </RNView>
          ) : (
            transactions.map((tx, index) => {
              const isTransfer = tx.type === 'TRANSFER';
              const isOutgoingTransfer = isTransfer && tx.account_id === accountId;
              const isExpense = tx.type === 'EXPENSE' || isOutgoingTransfer;
              const hasSplits = tx.is_split === 1 && tx.splits && tx.splits.length > 0;
              const isExpanded = !!expandedSplits[tx.id];

              return (
                <RNView
                  key={tx.id}
                  style={[
                    styles.txContainer,
                    index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  ]}
                >
                  <RNView style={styles.txRow}>
                    {/* Botão de Status (Conciliação rápida do MS Money) */}
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

                    {/* Informações da Transação */}
                    <RNView style={styles.txMain}>
                      <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.txTitle} numberOfLines={1}>
                          {isTransfer
                            ? isOutgoingTransfer
                              ? `Transf. p/ ${tx.destination_account_name}`
                              : `Transf. de ${tx.account_name}`
                            : tx.payee_name || tx.notes || 'Lançamento'}
                        </Text>
                        {hasSplits && (
                          <TouchableOpacity
                            style={[styles.splitBadge, { backgroundColor: theme.tint + '20' }]}
                            onPress={() => toggleExpandSplits(tx.id)}
                          >
                            <Ionicons name="cut-outline" size={11} color={theme.tint} />
                            <Text style={[styles.splitBadgeText, { color: theme.tint }]}>
                              {tx.splits?.length} divisões
                            </Text>
                          </TouchableOpacity>
                        )}
                      </RNView>

                      <Text style={[styles.txMeta, { color: theme.subtext }]}>
                        {formatDateBR(tx.date)} • {hasSplits ? 'Transação Dividida' : tx.category_name || (isTransfer ? 'Transferência' : 'Geral')}
                        {tx.check_number ? ` • Doc #${tx.check_number}` : ''}
                      </Text>

                      {tx.notes && <Text style={[styles.txNotes, { color: theme.subtext }]}>{tx.notes}</Text>}
                    </RNView>

                    {/* Valor e Ações */}
                    <RNView style={styles.txRight}>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: isExpense ? theme.expense : theme.income },
                        ]}
                      >
                        {isExpense ? '-' : '+'}
                        {formatCurrency(tx.amount)}
                      </Text>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(tx.id)}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.subtext} />
                      </TouchableOpacity>
                    </RNView>
                  </RNView>

                  {/* Fatias da Transação Dividida (Splits Breakdown) */}
                  {hasSplits && isExpanded && (
                    <RNView style={[styles.splitsBreakdown, { backgroundColor: theme.background }]}>
                      {tx.splits?.map((s, sIdx) => (
                        <RNView key={s.id || sIdx} style={styles.splitBreakdownRow}>
                          <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <RNView style={[styles.splitDot, { backgroundColor: s.category_color || theme.tint }]} />
                            <Text style={styles.splitCatName}>
                              {s.category_name || 'Categoria'} {s.memo ? `(${s.memo})` : ''}
                            </Text>
                          </RNView>
                          <Text style={styles.splitAmountText}>
                            {formatCurrency(s.amount)}
                          </Text>
                        </RNView>
                      ))}
                    </RNView>
                  )}
                </RNView>
              );
            })
          )}
        </View>
      </ScrollView>
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
  balanceCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  accBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newTxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  newTxBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  currentBalance: {
    fontSize: 30,
    fontWeight: '800',
    marginVertical: 4,
  },
  ccDetailsBox: {
    marginVertical: 8,
    paddingTop: 8,
  },
  ccLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ccLimitText: {
    fontSize: 12,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  ccDatesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ccDateItem: {
    fontSize: 12,
  },
  clearedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
  },
  clearedLabel: {
    fontSize: 12,
  },
  clearedVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 16,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  statusChipsRow: {
    flexDirection: 'row',
  },
  statusFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  statusFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  helperNotice: {
    fontSize: 11,
  },
  registerList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  txContainer: {
    width: '100%',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  txMain: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  splitBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  txNotes: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },
  splitsBreakdown: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 6,
  },
  splitBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  splitCatName: {
    fontSize: 12,
    fontWeight: '500',
  },
  splitAmountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyView: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
  },
});
