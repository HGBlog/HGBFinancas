import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  View as RNView,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Transaction } from '@/types';
import { getAccountById, recalculateAccountBalance } from '@/db/accounts';
import {
  getTransactions,
  toggleTransactionStatus,
  deleteTransaction,
  updateTransaction,
  getTransactionSplits,
} from '@/db/transactions';
import {
  formatCurrency,
  formatDateBR,
  formatCurrencyInput,
  numericToCurrencyInput,
  formatDateInput,
  brDateToISO,
  isoToBRDate,
} from '@/utils/formatters';

const CATEGORY_TABS = [
  { label: 'Dinheiro(Din)', key: 'Dinheiro(Din)' },
  { label: 'C.Itau (CIT)', key: 'C.Itau (CIT)' },
  { label: 'C.Bradesco(CBr)', key: 'C.Bradesco(CBr)' },
  { label: 'C.PagBank(CPb)', key: 'C.PagBank(CPb)' },
];

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = parseInt(id, 10);

  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedSplits, setExpandedSplits] = useState<Record<number, boolean>>({});

  // Estados do Modal de Edição (Valor e Data)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmountDigits, setEditAmountDigits] = useState('');
  const [editDateBR, setEditDateBR] = useState('');

  const loadData = useCallback(async () => {
    if (!accountId) return;
    try {
      await recalculateAccountBalance(accountId);
      const acc = await getAccountById(accountId);
      setAccount(acc);

      const txs = await getTransactions({
        accountId,
        categoryFilter: selectedCategory || undefined,
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
  }, [accountId, selectedCategory]);

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

  const handleToggleCategory = (catKey: string) => {
    // Alterna o filtro: se clicar no mesmo, remove para ver todas as categorias
    setSelectedCategory((prev) => (prev === catKey ? null : catKey));
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

  // Abrir Modal de Edição
  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    const curr = numericToCurrencyInput(tx.amount);
    setEditAmountDigits(curr.rawDigits);
    setEditDateBR(isoToBRDate(tx.date));
  };

  // Salvar Edição de Valor e Data
  const handleSaveEdit = async () => {
    if (!editingTx) return;

    const { numericValue } = formatCurrencyInput(editAmountDigits);
    if (numericValue <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }

    const isoDate = brDateToISO(editDateBR);
    if (!isoDate || isoDate.length !== 10) {
      Alert.alert('Data inválida', 'Informe a data no formato DD-MM-AAAA.');
      return;
    }

    try {
      await updateTransaction(editingTx.id, {
        amount: numericValue,
        date: isoDate,
      });

      setEditingTx(null);
      await loadData();
      Alert.alert('Sucesso', 'Lançamento atualizado com sucesso!');
    } catch (e) {
      console.error('Erro ao atualizar lançamento:', e);
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    }
  };

  const isCreditCard = account?.type === 'CREDIT_CARD';
  const creditLimit = account?.credit_limit || 0;
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
            {/* Onde estava "Cash", agora exibe "Valores Recebidos" */}
            <RNView style={[styles.badge, { backgroundColor: (account?.color || theme.tint) + '20' }]}>
              <Ionicons name={isCreditCard ? 'card' : 'wallet'} size={16} color={account?.color || theme.tint} />
              <Text style={[styles.badgeText, { color: account?.color || theme.tint }]}>
                Valores Recebidos
              </Text>
            </RNView>

            {/* Apenas botão Novo Lançamento (botão OFX removido) */}
            <TouchableOpacity
              style={[styles.newTxBtn, { backgroundColor: theme.tint }]}
              onPress={() =>
                router.push({
                  pathname: '/new-transaction',
                  params: { initialAccountId: String(accountId), initialType: 'INCOME' },
                })
              }
            >
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={styles.newTxBtnText}>Novo Lançamento</Text>
            </TouchableOpacity>
          </RNView>

          <Text style={[styles.balanceLabel, { color: theme.subtext }]}>
            {isCreditCard ? 'Fatura Atual Aberta' : 'Saldo Total Recebido'}
          </Text>
          <Text
            style={[
              styles.currentBalance,
              { color: (account?.current_balance || 0) >= 0 ? theme.text : theme.expense },
            ]}
          >
            {formatCurrency(account?.current_balance || 0)}
          </Text>

          {isCreditCard && creditLimit > 0 && (
            <RNView style={styles.ccDetailsBox}>
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

        {/* Filtro por Categorias (Onde o dinheiro estará):
            1. Dinheiro(Din)
            2. C.Itau (CIT)
            3. C.Bradesco(CBr)
            4. C.PagBank(CPb)
        */}
        <RNView style={styles.categoryFilterContainer}>
          <Text style={[styles.filterNotice, { color: theme.subtext }]}>
            Filtrar por Destino do Dinheiro:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusChipsRow}>
            {CATEGORY_TABS.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.statusFilterChip,
                    { borderColor: theme.border },
                    isSelected && { backgroundColor: theme.tint, borderColor: theme.tint },
                  ]}
                  onPress={() => handleToggleCategory(cat.key)}
                >
                  <Text
                    style={[
                      styles.statusFilterText,
                      { color: isSelected ? '#FFF' : theme.text, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {selectedCategory && (
            <TouchableOpacity onPress={() => setSelectedCategory(null)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: theme.tint, fontWeight: '600' }}>
                ✕ Ver todas as categorias
              </Text>
            </TouchableOpacity>
          )}
        </RNView>

        {/* Tabela do Livro-Caixa */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Livro-Caixa ({transactions.length})</Text>
          <Text style={[styles.helperNotice, { color: theme.subtext }]}>
            Toque no ícone de lápis para alterar valor e data
          </Text>
        </View>

        <View style={[styles.registerList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {transactions.length === 0 ? (
            <RNView style={styles.emptyView}>
              <Ionicons name="receipt-outline" size={40} color={theme.subtext} />
              <Text style={[styles.emptyText, { color: theme.subtext }]}>
                {selectedCategory
                  ? `Nenhum lançamento encontrado para "${selectedCategory}".`
                  : 'Nenhum lançamento encontrado para esta conta.'}
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
                    {/* Botão de Status (Conciliação rápida P/C/R) */}
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
                    <TouchableOpacity
                      style={styles.txMain}
                      activeOpacity={0.7}
                      onPress={() => handleOpenEdit(tx)}
                    >
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
                      </Text>

                      {tx.notes && <Text style={[styles.txNotes, { color: theme.subtext }]}>{tx.notes}</Text>}
                    </TouchableOpacity>

                    {/* Valor e Ações (Editar e Excluir) */}
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

                      <RNView style={styles.actionsRow}>
                        {/* Botão de Edição (Opção de alterar valor e data) */}
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => handleOpenEdit(tx)}
                          accessibilityLabel="Editar lançamento"
                        >
                          <Ionicons name="pencil" size={16} color={theme.tint} />
                        </TouchableOpacity>

                        {/* Botão Excluir */}
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => handleDelete(tx.id)}
                          accessibilityLabel="Excluir lançamento"
                        >
                          <Ionicons name="trash-outline" size={16} color={theme.expense} />
                        </TouchableOpacity>
                      </RNView>
                    </RNView>
                  </RNView>

                  {/* Fatias da Transação Dividida (Splits) */}
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

      {/* MODAL DE EDIÇÃO DE VALOR E DATA */}
      <Modal
        visible={!!editingTx}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingTx(null)}
      >
        <RNView style={styles.modalOverlay}>
          <RNView style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Lançamento</Text>
              <TouchableOpacity onPress={() => setEditingTx(null)}>
                <Ionicons name="close-circle" size={24} color={theme.subtext} />
              </TouchableOpacity>
            </RNView>

            {/* Campo de Valor com máscara monetária da direita para a esquerda */}
            <Text style={[styles.inputLabel, { color: theme.subtext }]}>
              Valor
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor={theme.subtext}
              value={formatCurrencyInput(editAmountDigits).formatted}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '');
                setEditAmountDigits(digits);
              }}
            />

            {/* Campo de Data no padrão brasileiro DD-MM-AAAA */}
            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>
              Data (DD-MM-AAAA)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              keyboardType="numeric"
              placeholder="DD-MM-AAAA"
              placeholderTextColor={theme.subtext}
              maxLength={10}
              value={editDateBR}
              onChangeText={(text) => {
                const masked = formatDateInput(text);
                setEditDateBR(masked);
              }}
            />

            {/* Botões do Modal */}
            <RNView style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: theme.border }]}
                onPress={() => setEditingTx(null)}
              >
                <Text style={[styles.modalBtnTextCancel, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtnSave, { backgroundColor: theme.tint }]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.modalBtnTextSave}>Salvar Alterações</Text>
              </TouchableOpacity>
            </RNView>
          </RNView>
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
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  badgeText: {
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: '500',
  },
  currentBalance: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 12,
  },
  clearedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  clearedLabel: {
    fontSize: 13,
  },
  clearedVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  ccDetailsBox: {
    marginVertical: 10,
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
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  categoryFilterContainer: {
    marginBottom: 16,
  },
  filterNotice: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  statusChipsRow: {
    flexDirection: 'row',
  },
  statusFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  statusFilterText: {
    fontSize: 13,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  helperNotice: {
    fontSize: 11,
    marginTop: 2,
  },
  registerList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyView: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  txContainer: {
    padding: 14,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  txMain: {
    flex: 1,
    marginRight: 8,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
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
  splitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  splitBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    padding: 4,
  },
  splitsBreakdown: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
  splitBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  splitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  splitCatName: {
    fontSize: 12,
  },
  splitAmountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Modal de Edição
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalBtnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalBtnTextCancel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnSave: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalBtnTextSave: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
