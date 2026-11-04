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
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Transaction, RecurrenceEditScope } from '@/types';
import {
  getMonthlyExpensesStatement,
  toggleTransactionStatus,
  deleteTransaction,
  updateTransaction,
  createTransaction,
  getAvailableRevenue,
  updateRecurringExpense,
} from '@/db/transactions';
import { getOrCreatePayee } from '@/db/payees';
import { scheduleExpenseReminderNotifications } from '@/services/notificationService';
import { CalendarPickerModal } from '@/components/CalendarPickerModal';
import {
  formatCurrency,
  formatDateBR,
  getCurrentMonthISO,
  getMonthName,
  formatCurrencyInput,
  numericToCurrencyInput,
  formatDateInput,
  brDateToISO,
  isoToBRDate,
} from '@/utils/formatters';

export default function ExpensesScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthISO());
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expandedSplits, setExpandedSplits] = useState<Record<number, boolean>>({});

  // Estados do Modal de Edição de Despesa (Título, Valor, Data e Escopo de Recorrência)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmountDigits, setEditAmountDigits] = useState('');
  const [editDateBR, setEditDateBR] = useState('');
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [editScope, setEditScope] = useState<RecurrenceEditScope>('CURRENT');

  const loadData = useCallback(async () => {
    try {
      const list = await getMonthlyExpensesStatement(currentMonth);
      setTransactions(list);
    } catch (e) {
      console.error('Erro ao carregar despesas do mês:', e);
    }
  }, [currentMonth]);

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
    const [y, m] = currentMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${newYear}-${newMonth}`);
  };

  const handleToggleStatus = async (tx: Transaction) => {
    const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
    if (!isPaid) {
      const available = await getAvailableRevenue(currentMonth);
      if (available < tx.amount) {
        Alert.alert('Atenção', 'Receita insuficiente para pagamento');
        return;
      }
    }
    await toggleTransactionStatus(tx, currentMonth);
    await loadData();
    scheduleExpenseReminderNotifications().catch(() => {});
  };

  const toggleExpandSplits = (txId: number) => {
    setExpandedSplits((prev) => ({ ...prev, [txId]: !prev[txId] }));
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    const currTitle = tx.notes || tx.payee_name || 'Despesa';
    setEditTitle(currTitle);
    const curr = numericToCurrencyInput(tx.amount);
    setEditAmountDigits(curr.rawDigits);
    setEditDateBR(isoToBRDate(tx.date));
    setEditScope('CURRENT');
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;

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
      Alert.alert('Data inválida', 'Informe a data no formato DD-MM-AAAA.');
      return;
    }

    const isRecurring =
      editingTx.expense_type === 'MENSAL' ||
      editingTx.expense_type === 'ANUAL' ||
      editingTx.expense_type === 'PERSONALIZAR' ||
      (editingTx.recurrence_id != null && editingTx.recurrence_id > 0);

    const dueDay = parseInt(isoDate.split('-')[2], 10) || editingTx.due_day || 1;

    try {
      if (isRecurring) {
        await updateRecurringExpense({
          tx: editingTx,
          currentMonthISO: currentMonth,
          newTitle: titleTrimmed,
          newAmount: numericValue,
          newDateISO: isoDate,
          scope: editScope,
        });
      } else {
        const newPayeeId = await getOrCreatePayee(titleTrimmed);
        await updateTransaction(editingTx.id, {
          payee_id: newPayeeId,
          notes: titleTrimmed,
          amount: numericValue,
          date: isoDate,
          due_day: dueDay,
        });
      }

      setEditingTx(null);
      await loadData();
      scheduleExpenseReminderNotifications().catch(() => {});
      Alert.alert('Sucesso', 'Despesa atualizada com sucesso!');
    } catch (e) {
      console.error('Erro ao atualizar despesa:', e);
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    }
  };

  const handleDelete = (txId: number) => {
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

  const totalExpense = transactions.reduce((sum, t) => sum + t.amount, 0);

  const isEditingRecurring = editingTx
    ? editingTx.expense_type === 'MENSAL' ||
      editingTx.expense_type === 'ANUAL' ||
      editingTx.expense_type === 'PERSONALIZAR' ||
      (editingTx.recurrence_id != null && editingTx.recurrence_id > 0)
    : false;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 1. Seletor de Mês (Navegação de Fatura) */}
      <View style={[styles.monthSelector, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>

        <RNView style={styles.monthTitleWrap}>
          <Ionicons name="calendar-outline" size={16} color={theme.tint} style={{ marginRight: 6 }} />
          <Text style={styles.monthText}>{getMonthName(currentMonth)}</Text>
        </RNView>

        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* 2. Card Estilo Fatura Mensal de Despesas */}
      <View style={[styles.faturaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.faturaHeader}>
          <RNView>
            <Text style={[styles.faturaLabel, { color: theme.subtext }]}>
              Despesa do Mês
            </Text>
            <Text style={[styles.faturaTotal, { color: theme.expense }]}>
              -{formatCurrency(totalExpense)}
            </Text>
          </RNView>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.expense }]}
            onPress={() => router.push({ pathname: '/new-transaction', params: { initialType: 'EXPENSE' } })}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>Nova Despesa</Text>
          </TouchableOpacity>
        </RNView>

        <RNView style={[styles.faturaFooter, { borderTopColor: theme.border }]}>
          <RNView style={styles.footerItem}>
            <Text style={[styles.footerItemLabel, { color: theme.subtext }]}>Qtd. Despesas</Text>
            <Text style={styles.footerItemVal}>{transactions.length}</Text>
          </RNView>
          <RNView style={styles.footerItem}>
            <Text style={[styles.footerItemLabel, { color: theme.subtext }]}>Pagas</Text>
            <Text style={[styles.footerItemVal, { color: theme.cleared }]}>
              {transactions.filter((t) => t.status === 'CLEARED' || t.status === 'RECONCILED').length}
            </Text>
          </RNView>
          <RNView style={styles.footerItem}>
            <Text style={[styles.footerItemLabel, { color: theme.subtext }]}>A pagar</Text>
            <Text style={[styles.footerItemVal, { color: theme.uncleared }]}>
              {transactions.filter((t) => t.status === 'UNCLEARED').length}
            </Text>
          </RNView>
        </RNView>
      </View>

      {/* 3. Lista de Lançamentos da Fatura */}
      <View style={styles.sectionHeaderRow}>
        <RNView>
          <Text style={styles.sectionTitle}>Lançamentos</Text>
          <Text style={[styles.helperNotice, { color: theme.subtext }]}>
            Toque no lápis para editar valor e data • Marque a caixa para indicar despesa paga
          </Text>
        </RNView>
      </View>

      <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {transactions.length === 0 ? (
          <RNView style={styles.emptyView}>
            <Ionicons name="receipt-outline" size={48} color={theme.subtext} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma despesa para este mês
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
              Toque no botão "Nova Despesa" acima para lançar sua primeira fatura.
            </Text>
          </RNView>
        ) : (
          transactions.map((tx, index) => {
            const hasSplits = tx.is_split === 1 && tx.splits && tx.splits.length > 0;
            const isExpanded = !!expandedSplits[tx.id];
            const isPaid = tx.status === 'CLEARED' || tx.status === 'RECONCILED';
            const displayTitle = tx.notes || tx.payee_name || 'Despesa';

            return (
              <RNView
                key={`${tx.id}-${tx.date}`}
                style={[
                  styles.txContainer,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                <RNView style={styles.txRow}>
                  {/* Checkbox de Pagamento da Despesa */}
                  <TouchableOpacity
                    style={styles.checkboxTouch}
                    onPress={() => handleToggleStatus(tx)}
                    activeOpacity={0.7}
                    accessibilityLabel={isPaid ? 'Despesa paga' : 'Despesa não paga'}
                  >
                    <Ionicons
                      name={isPaid ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={isPaid ? '#10B981' : theme.subtext}
                    />
                  </TouchableOpacity>

                  {/* Informações da Despesa */}
                  <TouchableOpacity
                    style={[styles.txMain, isPaid && { opacity: 0.45 }]}
                    activeOpacity={0.7}
                    onPress={() => handleOpenEdit(tx)}
                  >
                    <RNView style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.txTitle}>
                        {displayTitle}
                      </Text>
                      {tx.expense_type && tx.expense_type !== 'UNICO' && (
                        <RNView style={[styles.typeBadge, { backgroundColor: theme.tint + '18' }]}>
                          <Text style={[styles.typeBadgeText, { color: theme.tint }]}>
                            {tx.expense_type}
                          </Text>
                        </RNView>
                      )}
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
                      {formatDateBR(tx.date)} • {tx.category_name || 'Geral'}
                    </Text>

                    {tx.notes && tx.notes !== displayTitle && !tx.notes.startsWith('Desconto automático') && (
                      <Text style={[styles.txNotes, { color: theme.subtext }]}>
                        {tx.notes}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Valor e Ações */}
                  <RNView style={[styles.txRight, isPaid && { opacity: 0.45 }]}>
                    <Text style={[styles.txAmount, { color: theme.expense }]}>
                      -{formatCurrency(tx.amount)}
                    </Text>

                    <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleOpenEdit(tx)}
                        accessibilityLabel="Editar despesa"
                      >
                        <Ionicons name="pencil" size={16} color={theme.tint} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleDelete(tx.id)}
                        accessibilityLabel="Excluir despesa"
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.expense} />
                      </TouchableOpacity>
                    </RNView>
                  </RNView>
                </RNView>

                {/* Fatias divididas */}
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
              <Text style={styles.modalTitle}>Editar Despesa</Text>
              <TouchableOpacity onPress={() => setEditingTx(null)}>
                <Ionicons name="close-circle" size={24} color={theme.subtext} />
              </TouchableOpacity>
            </RNView>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Campo Título da Despesa */}
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

              {/* Campo Valor com máscara monetária da direita para a esquerda */}
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

              {/* Campo Data no padrão brasileiro com máscara de calendário */}
              <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>
                Data (DD-MM-AAAA)
              </Text>
              <TouchableOpacity
                style={[
                  styles.modalInput,
                  styles.datePickerBtn,
                  { borderColor: theme.border, backgroundColor: theme.background },
                ]}
                onPress={() => setCalendarPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={{ color: editDateBR ? theme.text : theme.subtext, fontSize: 15 }}>
                  {editDateBR || 'DD-MM-AAAA'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={theme.tint} />
              </TouchableOpacity>

              {/* Opções de Escopo de Recorrência (quando despesa for mensal, anual ou personalizar) */}
              {isEditingRecurring && (
                <RNView style={styles.recurrenceScopeSection}>
                  <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 14, marginBottom: 8 }]}>
                    Aplicar alteração:
                  </Text>

                  {/* 1. Mudar somente essa despesa */}
                  <TouchableOpacity
                    style={[
                      styles.scopeOptionCard,
                      {
                        borderColor: editScope === 'CURRENT' ? theme.tint : theme.border,
                        backgroundColor: editScope === 'CURRENT' ? `${theme.tint}14` : theme.background,
                      },
                    ]}
                    onPress={() => setEditScope('CURRENT')}
                    activeOpacity={0.7}
                  >
                    <RNView style={styles.scopeRadioRow}>
                      <Ionicons
                        name={editScope === 'CURRENT' ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={editScope === 'CURRENT' ? theme.tint : theme.subtext}
                      />
                      <RNView style={styles.scopeTexts}>
                        <Text
                          style={[
                            styles.scopeTitle,
                            { color: editScope === 'CURRENT' ? theme.tint : theme.text },
                          ]}
                        >
                          Mudar somente essa despesa
                        </Text>
                        <Text style={[styles.scopeSubtitle, { color: theme.subtext }]}>
                          A alteração será somente da despesa do mês vigente
                        </Text>
                      </RNView>
                    </RNView>
                  </TouchableOpacity>

                  {/* 2. Mudar todas as despesas */}
                  <TouchableOpacity
                    style={[
                      styles.scopeOptionCard,
                      {
                        borderColor: editScope === 'ALL' ? theme.tint : theme.border,
                        backgroundColor: editScope === 'ALL' ? `${theme.tint}14` : theme.background,
                      },
                    ]}
                    onPress={() => setEditScope('ALL')}
                    activeOpacity={0.7}
                  >
                    <RNView style={styles.scopeRadioRow}>
                      <Ionicons
                        name={editScope === 'ALL' ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={editScope === 'ALL' ? theme.tint : theme.subtext}
                      />
                      <RNView style={styles.scopeTexts}>
                        <Text
                          style={[
                            styles.scopeTitle,
                            { color: editScope === 'ALL' ? theme.tint : theme.text },
                          ]}
                        >
                          Mudar todas as despesas (passadas, presente e futuras)
                        </Text>
                        <Text style={[styles.scopeSubtitle, { color: theme.subtext }]}>
                          A alteração será de todas as despesas relacionadas
                        </Text>
                      </RNView>
                    </RNView>
                  </TouchableOpacity>

                  {/* 3. Mudar somente as despesas do presente e do futuro */}
                  <TouchableOpacity
                    style={[
                      styles.scopeOptionCard,
                      {
                        borderColor: editScope === 'FUTURE' ? theme.tint : theme.border,
                        backgroundColor: editScope === 'FUTURE' ? `${theme.tint}14` : theme.background,
                      },
                    ]}
                    onPress={() => setEditScope('FUTURE')}
                    activeOpacity={0.7}
                  >
                    <RNView style={styles.scopeRadioRow}>
                      <Ionicons
                        name={editScope === 'FUTURE' ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={editScope === 'FUTURE' ? theme.tint : theme.subtext}
                      />
                      <RNView style={styles.scopeTexts}>
                        <Text
                          style={[
                            styles.scopeTitle,
                            { color: editScope === 'FUTURE' ? theme.tint : theme.text },
                          ]}
                        >
                          Mudar somente as despesas do presente e do futuro
                        </Text>
                        <Text style={[styles.scopeSubtitle, { color: theme.subtext }]}>
                          A alteração será somente da despesa do mês vigente e dos meses futuros
                        </Text>
                      </RNView>
                    </RNView>
                  </TouchableOpacity>
                </RNView>
              )}

              <CalendarPickerModal
                visible={calendarPickerVisible}
                initialDateBR={editDateBR}
                onSelect={(d) => setEditDateBR(d)}
                onClose={() => setCalendarPickerVisible(false)}
              />

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
            </ScrollView>
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
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  arrowBtn: {
    padding: 6,
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
  },
  faturaCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  faturaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  faturaLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  faturaTotal: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  faturaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  footerItem: {
    alignItems: 'center',
  },
  footerItemLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  footerItemVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    marginBottom: 10,
  },
  helperNotice: {
    fontSize: 11,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  listCard: {
    borderRadius: 16,
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
  checkboxTouch: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txMain: {
    flex: 1,
  },
  txTitle: {
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
    fontSize: 10,
    fontWeight: '700',
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
    fontWeight: '800',
  },
  actionBtn: {
    padding: 4,
  },
  splitsBreakdown: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
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
    maxHeight: '90%',
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
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recurrenceScopeSection: {
    marginTop: 6,
    marginBottom: 4,
  },
  scopeOptionCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  scopeRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scopeTexts: {
    flex: 1,
  },
  scopeTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  scopeSubtitle: {
    fontSize: 12,
    lineHeight: 16,
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
