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
import { Transaction } from '@/types';
import {
  getTransactions,
  toggleTransactionStatus,
  deleteTransaction,
  updateTransaction,
} from '@/db/transactions';
import { getOrCreatePayee } from '@/db/payees';
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

export default function IncomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthISO());
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Estados do Modal de Edição de Receita (Título, Valor e Data)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmountDigits, setEditAmountDigits] = useState('');
  const [editDateBR, setEditDateBR] = useState('');
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const list = await getTransactions({
        type: 'INCOME',
        monthPrefix: currentMonth,
      });
      setTransactions(list);
    } catch (e) {
      console.error('Erro ao carregar receitas do mês:', e);
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

  const handleToggleStatus = async (txId: number) => {
    await toggleTransactionStatus(txId);
    await loadData();
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    const currTitle = tx.payee_name || tx.notes || 'Receita';
    setEditTitle(currTitle);
    const curr = numericToCurrencyInput(tx.amount);
    setEditAmountDigits(curr.rawDigits);
    setEditDateBR(isoToBRDate(tx.date));
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;

    const titleTrimmed = editTitle.trim();
    if (!titleTrimmed) {
      Alert.alert('Título inválido', 'Informe o título da receita.');
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

    try {
      const resolvedPayeeId = await getOrCreatePayee(titleTrimmed);
      await updateTransaction(editingTx.id, {
        payee_id: resolvedPayeeId,
        notes: titleTrimmed,
        amount: numericValue,
        date: isoDate,
      });

      setEditingTx(null);
      await loadData();
      Alert.alert('Sucesso', 'Receita atualizada com sucesso!');
    } catch (e) {
      console.error('Erro ao atualizar receita:', e);
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    }
  };

  const handleDelete = (txId: number) => {
    Alert.alert(
      'Excluir Receita',
      'Tem certeza que deseja apagar este lançamento de receita?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(txId);
            await loadData();
          },
        },
      ]
    );
  };

  const totalIncome = transactions.reduce((sum, t) => sum + t.amount, 0);

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

      {/* 2. Card Estilo Fatura Mensal de Receitas */}
      <View style={[styles.faturaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.faturaHeader}>
          <RNView>
            <Text style={[styles.faturaLabel, { color: theme.subtext }]}>
              Fatura Mensal de Receitas
            </Text>
            <Text style={[styles.faturaTotal, { color: theme.income }]}>
              +{formatCurrency(totalIncome)}
            </Text>
          </RNView>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push({ pathname: '/new-transaction', params: { initialType: 'INCOME' } })}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>Nova Receita</Text>
          </TouchableOpacity>
        </RNView>

        <RNView style={[styles.metaRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.metaText, { color: theme.subtext }]}>
            Total de {transactions.length} lançamentos neste mês
          </Text>
          <Text style={[styles.metaText, { color: theme.cleared, fontWeight: '700' }]}>
            Compensados: {formatCurrency(totalIncome)}
          </Text>
        </RNView>
      </View>

      {/* 3. Lista de Lançamentos de Receita */}
      <View style={styles.sectionHeader}>
        <RNView>
          <Text style={styles.sectionTitle}>Lançamentos de Receita</Text>
          <Text style={[styles.helperNotice, { color: theme.subtext }]}>
            Toque no lápis para editar título, valor e data
          </Text>
        </RNView>
      </View>

      <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {transactions.length === 0 ? (
          <RNView style={styles.emptyView}>
            <Ionicons name="cash-outline" size={48} color={theme.subtext} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma receita para este mês
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
              Toque no botão "+ Nova Receita" acima para registrar entradas.
            </Text>
          </RNView>
        ) : (
          transactions.map((tx, index) => {
            const displayTitle = tx.payee_name || tx.notes || 'Receita';
            return (
              <RNView
                key={tx.id}
                style={[
                  styles.txRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                {/* Informações da Receita */}
                <TouchableOpacity
                  style={styles.txMain}
                  activeOpacity={0.7}
                  onPress={() => handleOpenEdit(tx)}
                >
                  <Text style={styles.txTitle}>
                    {displayTitle}
                  </Text>
                  <Text style={[styles.txMeta, { color: theme.subtext }]}>
                    {formatDateBR(tx.date)} • {tx.category_name || 'Geral'}
                  </Text>
                  {tx.notes && tx.notes !== displayTitle && (
                    <Text style={[styles.txNotes, { color: theme.subtext }]}>
                      {tx.notes}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Valor e Ações */}
                <RNView style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: theme.income }]}>
                    +{formatCurrency(tx.amount)}
                  </Text>

                  <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleOpenEdit(tx)}
                      accessibilityLabel="Editar receita"
                    >
                      <Ionicons name="pencil" size={16} color={theme.tint} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(tx.id)}
                      accessibilityLabel="Excluir receita"
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.expense} />
                    </TouchableOpacity>
                  </RNView>
                </RNView>
              </RNView>
            );
          })
        )}
      </View>

      {/* MODAL DE EDIÇÃO DE TÍTULO, VALOR E DATA */}
      <Modal
        visible={!!editingTx}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingTx(null)}
      >
        <RNView style={styles.modalOverlay}>
          <RNView style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Receita</Text>
              <TouchableOpacity onPress={() => setEditingTx(null)}>
                <Ionicons name="close-circle" size={24} color={theme.subtext} />
              </TouchableOpacity>
            </RNView>

            {/* Campo Título da Receita */}
            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Título</Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Título da receita..."
              placeholderTextColor={theme.subtext}
              value={editTitle}
              onChangeText={setEditTitle}
            />

            {/* Campo Valor com máscara da direita para a esquerda */}
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

            {/* Campo Data DD-MM-AAAA com máscara de calendário */}
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
    gap: 16,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowBtn: {
    padding: 6,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
  },
  faturaCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  faturaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  faturaLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  faturaTotal: {
    fontSize: 28,
    fontWeight: '900',
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 14,
    borderTopWidth: 1,
  },
  metaText: {
    fontSize: 11,
  },
  sectionHeader: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  helperNotice: {
    fontSize: 11,
    marginTop: 2,
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
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
