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
import { useFocusEffect, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { FinancialSummary, Transaction } from '@/types';
import { getCbDonationsSummary, CbDonationsSummary, recalculateAllAccountBalances } from '@/db/accounts';
import {
  getFinancialSummary,
  getMonthlyExpensesStatement,
  toggleTransactionStatus,
  deleteTransaction,
  updateTransaction,
  createTransaction,
  getAvailableRevenue,
} from '@/db/transactions';
import { getOrCreatePayee } from '@/db/payees';
import { scheduleExpenseReminderNotifications } from '@/services/notificationService';
import {
  formatCurrency,
  formatDateBR,
  getCurrentMonthISO,
  getMonthName,
  getOnlyMonthName,
  formatCurrencyInput,
  numericToCurrencyInput,
  formatDateInput,
  brDateToISO,
  isoToBRDate,
} from '@/utils/formatters';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [refreshing, setRefreshing] = useState(false);
  const defaultCurrentMonth = getCurrentMonthISO();
  const [selectedMonth, setSelectedMonth] = useState(defaultCurrentMonth);

  const [summary, setSummary] = useState<FinancialSummary>({
    totalBalance: 0,
    totalIncomeMonth: 0,
    totalExpenseMonth: 0,
    monthlyNet: 0,
    unclearedTotal: 0,
  });

  const [cbData, setCbData] = useState<CbDonationsSummary>({
    cbTotal: 0,
    coletasTotal: 0,
    outrosTotal: 0,
  });

  const [monthExpenses, setMonthExpenses] = useState<Transaction[]>([]);

  // Estados do Modal de Edição de Despesa
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmountDigits, setEditAmountDigits] = useState('');
  const [editDateBR, setEditDateBR] = useState('');

  const loadData = useCallback(async () => {
    try {
      await recalculateAllAccountBalances();
      const [sum, cbSummary, expensesList] = await Promise.all([
        getFinancialSummary(selectedMonth),
        getCbDonationsSummary(selectedMonth),
        getMonthlyExpensesStatement(selectedMonth),
      ]);

      setSummary(sum);
      setCbData(cbSummary);
      setMonthExpenses(expensesList);
    } catch (e) {
      console.error('Erro ao carregar dados do painel:', e);
    }
  }, [selectedMonth]);

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

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newYear}-${newMonth}`);
  };

  // Regra: Despesas de meses passados não podem ser alteradas
  const isPastMonth = selectedMonth < defaultCurrentMonth;
  const isCurrentMonthActive = selectedMonth === defaultCurrentMonth;

  // Abrir Modal de Edição de Despesa
  const handleOpenEdit = (tx: Transaction) => {
    if (isPastMonth) {
      Alert.alert(
        'Operação Não Permitida',
        'As despesas de meses passados não podem ser alteradas.'
      );
      return;
    }
    setEditingExpense(tx);
    const currTitle = tx.notes || tx.payee_name || 'Despesa';
    setEditTitle(currTitle);
    const curr = numericToCurrencyInput(tx.amount);
    setEditAmountDigits(curr.rawDigits);
    setEditDateBR(isoToBRDate(tx.date));
  };

  // Salvar Edição de Despesa
  const handleSaveEdit = async () => {
    if (!editingExpense) return;

    const titleTrimmed = editTitle.trim();
    if (!titleTrimmed) {
      Alert.alert('Título inválido', 'Informe o título da despesa.');
      return;
    }

    const { numericValue } = formatCurrencyInput(editAmountDigits);
    if (numericValue <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }

    const isoDate = brDateToISO(editDateBR);
    if (!isoDate || isoDate.length !== 10) {
      Alert.alert('Data inválida', 'Informe a data no padrão brasileiro DD-MM-AAAA.');
      return;
    }

    const isRecurring =
      editingExpense.expense_type === 'MENSAL' ||
      editingExpense.expense_type === 'ANUAL' ||
      editingExpense.expense_type === 'PERSONALIZAR';

    const origMonthISO = editingExpense.date.substring(0, 7);
    const selectedMonthISO = selectedMonth;
    const dueDay = parseInt(isoDate.split('-')[2], 10) || editingExpense.due_day || 1;

    try {
      const newPayeeId = await getOrCreatePayee(titleTrimmed);

      if (
        isRecurring &&
        origMonthISO < selectedMonthISO &&
        (editingExpense.status === 'CLEARED' || editingExpense.status === 'RECONCILED')
      ) {
        // Preserva o lançamento pago do mês anterior intacto:
        await createTransaction({
          account_id: editingExpense.account_id,
          category_id: editingExpense.category_id,
          payee_id: editingExpense.payee_id,
          amount: editingExpense.amount,
          type: 'EXPENSE',
          date: editingExpense.date,
          status: editingExpense.status,
          notes: editingExpense.notes,
          expense_type: 'UNICO',
        });

        // Atualiza a despesa recorrente para aplicar no mês atual e nos futuros:
        await updateTransaction(editingExpense.id, {
          payee_id: newPayeeId,
          notes: titleTrimmed,
          amount: numericValue,
          date: isoDate,
          due_day: dueDay,
          status: 'UNCLEARED',
        });
      } else {
        await updateTransaction(editingExpense.id, {
          payee_id: newPayeeId,
          notes: titleTrimmed,
          amount: numericValue,
          date: isoDate,
          due_day: dueDay,
        });
      }

      setEditingExpense(null);
      await loadData();
      scheduleExpenseReminderNotifications().catch(() => {});
      Alert.alert('Sucesso', 'Despesa atualizada com sucesso!');
    } catch (e) {
      console.error('Erro ao atualizar despesa:', e);
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    }
  };

  const handleToggleStatus = async (tx: Transaction) => {
    if (isPastMonth) {
      Alert.alert(
        'Operação Não Permitida',
        'As despesas de meses passados não podem ser alteradas.'
      );
      return;
    }

    const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
    if (!isPaid) {
      const available = await getAvailableRevenue(selectedMonth);
      if (available < tx.amount) {
        Alert.alert('Atenção', 'Receita insuficiente para pagamento');
        return;
      }
    }

    await toggleTransactionStatus(tx.id);
    await loadData();
    scheduleExpenseReminderNotifications().catch(() => {});
  };

  const handleDelete = (txId: number) => {
    if (isPastMonth) {
      Alert.alert(
        'Operação Não Permitida',
        'As despesas de meses passados não podem ser alteradas.'
      );
      return;
    }
    Alert.alert(
      'Excluir Despesa',
      'Tem certeza que deseja apagar este lançamento de despesa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(txId);
            await loadData();
            scheduleExpenseReminderNotifications().catch(() => {});
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 1. Seletor de Mês no Topo */}
      <View style={[styles.monthNavCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => changeMonth(-1)}
          style={styles.monthArrowBtn}
          accessibilityLabel="Mês anterior"
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>

        <RNView style={styles.monthCenterInfo}>
          <RNView style={styles.monthTitleRow}>
            <Ionicons name="calendar-outline" size={16} color={theme.tint} style={{ marginRight: 6 }} />
            <Text style={styles.monthDisplayTitle}>{getMonthName(selectedMonth)}</Text>
          </RNView>
          {!isCurrentMonthActive && (
            <TouchableOpacity onPress={() => setSelectedMonth(defaultCurrentMonth)}>
              <Text style={[styles.backToCurrentBtn, { color: theme.tint }]}>
                Voltar para o mês atual
              </Text>
            </TouchableOpacity>
          )}
        </RNView>

        <TouchableOpacity
          onPress={() => changeMonth(1)}
          style={styles.monthArrowBtn}
          accessibilityLabel="Próximo mês"
        >
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* 2. Header Card - Valor Total em Mãos */}
      <View style={[styles.mainCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.subTitle, { color: theme.subtext }]}>
          Valor total em mãos
        </Text>
        <Text
          style={[
            styles.totalAmount,
            { color: summary.totalBalance >= 0 ? theme.text : theme.expense },
          ]}
        >
          {formatCurrency(summary.totalBalance)}
        </Text>

        <Text style={[styles.monthReference, { color: theme.subtext }]}>
          Referência: {getMonthName(selectedMonth)}
        </Text>

        {/* 3 Valores abaixo do Valor Total em Mãos */}
        <RNView style={[styles.breakdownList, { borderTopColor: theme.border }]}>
          {/* Valor recebido no mês atual */}
          <RNView style={styles.breakdownItem}>
            <RNView style={[styles.iconBadge, { backgroundColor: theme.income + '18' }]}>
              <Ionicons name="arrow-down" size={16} color={theme.income} />
            </RNView>
            <RNView style={styles.breakdownDetails}>
              <Text style={[styles.breakdownLabel, { color: theme.subtext }]}>
                Valor recebido no mês atual
              </Text>
              <Text style={[styles.breakdownValue, { color: theme.income }]}>
                +{formatCurrency(summary.totalIncomeMonth)}
              </Text>
            </RNView>
          </RNView>

          {/* Despesas totais do mês atual */}
          <RNView style={styles.breakdownItem}>
            <RNView style={[styles.iconBadge, { backgroundColor: theme.expense + '18' }]}>
              <Ionicons name="arrow-up" size={16} color={theme.expense} />
            </RNView>
            <RNView style={styles.breakdownDetails}>
              <Text style={[styles.breakdownLabel, { color: theme.subtext }]}>
                Despesas totais do mês atual
              </Text>
              <Text style={[styles.breakdownValue, { color: theme.expense }]}>
                -{formatCurrency(summary.totalExpenseMonth)}
              </Text>
            </RNView>
          </RNView>

          {/* Valor que sobrou em mãos */}
          <RNView style={styles.breakdownItem}>
            <RNView
              style={[
                styles.iconBadge,
                {
                  backgroundColor:
                    (summary.monthlyNet >= 0 ? theme.income : theme.expense) + '18',
                },
              ]}
            >
              <Ionicons
                name="wallet-outline"
                size={16}
                color={summary.monthlyNet >= 0 ? theme.income : theme.expense}
              />
            </RNView>
            <RNView style={styles.breakdownDetails}>
              <Text style={[styles.breakdownLabel, { color: theme.subtext }]}>
                Valor que sobrou em mãos
              </Text>
              <Text
                style={[
                  styles.breakdownValue,
                  { color: summary.monthlyNet >= 0 ? theme.income : theme.expense },
                ]}
              >
                {summary.monthlyNet >= 0 ? '+' : ''}
                {formatCurrency(summary.monthlyNet)}
              </Text>
            </RNView>
          </RNView>
        </RNView>
      </View>

      {/* 3. Seção CB e Doações (Mostra SOMENTE receitas) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>CB e Doações</Text>
        <Text style={[styles.subNotice, { color: theme.subtext }]}>
          Toque para lançar nova receita
        </Text>
      </View>

      <View style={[styles.fundsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* CB - Valor total (Ao clicar, vai para + Novo Lançamento com Receita selecionada) */}
        <TouchableOpacity
          style={styles.fundRow}
          onPress={() =>
            router.push({
              pathname: '/new-transaction',
              params: { initialType: 'INCOME', initialReceiptType: 'CB' },
            })
          }
          activeOpacity={0.7}
        >
          <RNView style={[styles.fundIconCircle, { backgroundColor: '#0D948818' }]}>
            <Feather name="percent" size={20} color="#0D9488" />
          </RNView>
          <RNView style={styles.fundInfo}>
            <Text style={styles.fundTitle}>CB - Valor total</Text>
            <Text style={[styles.fundSub, { color: theme.subtext }]}>
              Total do mês de {getOnlyMonthName(selectedMonth)}
            </Text>
          </RNView>
          <RNView style={styles.fundValueWrap}>
            <Text style={[styles.fundAmount, { color: theme.income }]}>
              +{formatCurrency(cbData.cbTotal)}
            </Text>
            <Ionicons name="add-circle" size={18} color={theme.tint} />
          </RNView>
        </TouchableOpacity>

        <RNView style={[styles.fundDivider, { backgroundColor: theme.border }]} />

        {/* Coletas - Valor total */}
        <TouchableOpacity
          style={styles.fundRow}
          onPress={() =>
            router.push({
              pathname: '/new-transaction',
              params: { initialType: 'INCOME', initialReceiptType: 'Coletas' },
            })
          }
          activeOpacity={0.7}
        >
          <RNView style={[styles.fundIconCircle, { backgroundColor: '#10B98118' }]}>
            <Ionicons name="cash" size={22} color="#10B981" />
          </RNView>
          <RNView style={styles.fundInfo}>
            <Text style={styles.fundTitle}>Coletas - Valor total</Text>
            <Text style={[styles.fundSub, { color: theme.subtext }]}>
              Coletas extras das comunidades
            </Text>
          </RNView>
          <RNView style={styles.fundValueWrap}>
            <Text style={[styles.fundAmount, { color: theme.income }]}>
              +{formatCurrency(cbData.coletasTotal)}
            </Text>
            <Ionicons name="add-circle" size={18} color={theme.tint} />
          </RNView>
        </TouchableOpacity>

        <RNView style={[styles.fundDivider, { backgroundColor: theme.border }]} />

        {/* Outros Valores */}
        <TouchableOpacity
          style={styles.fundRow}
          onPress={() =>
            router.push({
              pathname: '/new-transaction',
              params: { initialType: 'INCOME', initialReceiptType: 'Outros V.' },
            })
          }
          activeOpacity={0.7}
        >
          <RNView style={[styles.fundIconCircle, { backgroundColor: '#10B98118' }]}>
            <Ionicons name="gift" size={22} color="#10B981" />
          </RNView>
          <RNView style={styles.fundInfo}>
            <Text style={styles.fundTitle}>Outros Valores</Text>
            <Text style={[styles.fundSub, { color: theme.subtext }]}>
              Outras Doações
            </Text>
          </RNView>
          <RNView style={styles.fundValueWrap}>
            <Text style={[styles.fundAmount, { color: theme.income }]}>
              +{formatCurrency(cbData.outrosTotal)}
            </Text>
            <Ionicons name="add-circle" size={18} color={theme.tint} />
          </RNView>
        </TouchableOpacity>
      </View>

      {/* 4. NOVA SEÇÃO: DESPESAS DO MÊS */}
      <View style={styles.sectionHeaderRow}>
        <RNView>
          <Text style={styles.sectionTitle}>Despesas do Mês</Text>
          <Text style={[styles.helperNotice, { color: theme.subtext }]}>
            {isPastMonth
              ? 'Meses passados (Somente leitura)'
              : 'Toque no lápis para alterar valor e data'}
          </Text>
        </RNView>

        {/* Botão Novo Lançamento para criar nova despesa */}
        <TouchableOpacity
          style={[styles.newExpBtn, { backgroundColor: theme.expense }]}
          onPress={() =>
            router.push({
              pathname: '/new-transaction',
              params: { initialType: 'EXPENSE' },
            })
          }
        >
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.newExpBtnText}>Novo Lançamento</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.billsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {monthExpenses.length === 0 ? (
          <RNView style={styles.emptyBillsView}>
            <Ionicons name="checkmark-circle-outline" size={36} color={theme.income} />
            <Text style={[styles.emptyBillsText, { color: theme.subtext }]}>
              Nenhuma despesa cadastrada para {getMonthName(selectedMonth)}.
            </Text>
          </RNView>
        ) : (
          monthExpenses.map((tx, index) => {
            const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
            const displayTitle = tx.notes || tx.payee_name || 'Despesa';
            return (
              <RNView
                key={`${tx.id}-${tx.date}`}
                style={[
                  styles.billRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                {/* Ícone de Status: X vermelho (não paga) ou Check verde (paga) */}
                <TouchableOpacity
                  style={styles.statusActionTouch}
                  onPress={() => handleToggleStatus(tx)}
                  activeOpacity={0.7}
                  accessibilityLabel={isPaid ? 'Despesa paga' : 'Despesa não paga'}
                >
                  {isPaid ? (
                    <Ionicons name="checkmark-circle" size={26} color="#10B981" />
                  ) : (
                    <Ionicons name="close-circle" size={26} color="#EF4444" />
                  )}
                </TouchableOpacity>

                {/* Informações da Despesa: Nome, Data */}
                <TouchableOpacity
                  style={[styles.billMain, isPaid && { opacity: 0.5 }]}
                  activeOpacity={isPastMonth ? 1 : 0.7}
                  onPress={() => handleOpenEdit(tx)}
                >
                  <RNView style={styles.billHeaderRow}>
                    <Text style={styles.billTitle}>
                      {displayTitle}
                    </Text>
                    {tx.expense_type && tx.expense_type !== 'UNICO' && (
                      <RNView style={[styles.typeBadge, { backgroundColor: theme.tint + '18' }]}>
                        <Text style={[styles.typeBadgeText, { color: theme.tint }]}>
                          {tx.expense_type}
                        </Text>
                      </RNView>
                    )}
                  </RNView>

                <Text style={[styles.billDueDateText, { color: theme.subtext }]}>
                  {formatDateBR(tx.date)}
                  {tx.category_name ? ` • ${tx.category_name}` : ''}
                </Text>
              </TouchableOpacity>

              {/* Valor e Ações de Edição */}
              <RNView style={styles.billRightAction}>
                <Text style={[styles.billAmountText, { color: theme.expense }]}>
                  -{formatCurrency(tx.amount)}
                </Text>

                <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* Se for mês atual ou futuro: permite editar */}
                  {!isPastMonth ? (
                    <>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleOpenEdit(tx)}
                        accessibilityLabel="Editar despesa"
                      >
                        <Ionicons name="pencil" size={16} color={theme.tint} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleDelete(tx.id)}
                        accessibilityLabel="Excluir despesa"
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.expense} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    /* Meses passados: ícone de cadeado / somente leitura */
                    <RNView style={styles.lockBadge}>
                      <Ionicons name="lock-closed-outline" size={14} color={theme.subtext} />
                    </RNView>
                  )}
                </RNView>
              </RNView>
            </RNView>
          );
        })
      )}
      </View>

      {/* MODAL DE EDIÇÃO DE DESPESA DO MÊS */}
      <Modal
        visible={!!editingExpense}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingExpense(null)}
      >
        <RNView style={styles.modalOverlay}>
          <RNView style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Despesa</Text>
              <TouchableOpacity onPress={() => setEditingExpense(null)}>
                <Ionicons name="close-circle" size={24} color={theme.subtext} />
              </TouchableOpacity>
            </RNView>

            {/* Campo Título */}
            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Título</Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Título da despesa..."
              placeholderTextColor={theme.subtext}
              value={editTitle}
              onChangeText={setEditTitle}
            />

            {/* Campo Valor */}
            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>Valor</Text>
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

            {/* Campo Data */}
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

            <RNView style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: theme.border }]}
                onPress={() => setEditingExpense(null)}
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
    gap: 18,
  },
  monthNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  monthArrowBtn: {
    padding: 8,
    borderRadius: 10,
  },
  monthCenterInfo: {
    alignItems: 'center',
  },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthDisplayTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  backToCurrentBtn: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  mainCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  totalAmount: {
    fontSize: 34,
    fontWeight: '900',
    marginTop: 6,
    marginBottom: 4,
  },
  monthReference: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 16,
  },
  breakdownList: {
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 14,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  breakdownDetails: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: -6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: -6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  subNotice: {
    fontSize: 11,
    fontWeight: '500',
  },
  helperNotice: {
    fontSize: 11,
    marginTop: 2,
  },
  newExpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  newExpBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fundsContainer: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  fundIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  fundInfo: {
    flex: 1,
  },
  fundTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fundSub: {
    fontSize: 12,
    marginTop: 2,
  },
  fundValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fundAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  fundDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  billsContainer: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  billRow: {
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
    marginRight: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusActionTouch: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  billMain: {
    flex: 1,
    marginRight: 8,
  },
  billHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  billTitle: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  billDueDateText: {
    fontSize: 12,
    marginTop: 3,
  },
  billRightAction: {
    alignItems: 'flex-end',
    gap: 4,
  },
  billAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  iconActionBtn: {
    padding: 4,
  },
  lockBadge: {
    padding: 4,
  },
  emptyBillsView: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyBillsText: {
    fontSize: 13,
    textAlign: 'center',
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
