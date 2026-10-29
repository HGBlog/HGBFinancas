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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Budget, Category, ScheduledBill } from '@/types';
import { getAccounts } from '@/db/accounts';
import { getCategories } from '@/db/categories';
import { getBudgetsForMonth, setBudget } from '@/db/budgets';
import { createScheduledBill, getScheduledBills, payScheduledBill } from '@/db/scheduled';
import {
  formatCurrency,
  formatDateBR,
  getCurrentMonthISO,
  getTodayISO,
} from '@/utils/formatters';

export default function PlanningScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [activeTab, setActiveTab] = useState<'BILLS' | 'BUDGET'>('BILLS');
  const [refreshing, setRefreshing] = useState(false);
  const [bills, setBills] = useState<ScheduledBill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Modais
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);

  // Form Agendamento
  const [billDesc, setBillDesc] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billType, setBillType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [billAccountId, setBillAccountId] = useState<number | null>(null);
  const [billCategoryId, setBillCategoryId] = useState<number | null>(null);
  const [billDueDate, setBillDueDate] = useState(getTodayISO());

  // Form Orçamento
  const [selectedBudgetCat, setSelectedBudgetCat] = useState<number | null>(null);
  const [budgetLimit, setBudgetLimit] = useState('');

  const currentMonth = getCurrentMonthISO();

  const loadData = useCallback(async () => {
    try {
      const [bList, bgList, accList, catList] = await Promise.all([
        getScheduledBills(),
        getBudgetsForMonth(currentMonth),
        getAccounts(),
        getCategories(),
      ]);

      setBills(bList);
      setBudgets(bgList);
      setAccounts(accList);
      setCategories(catList);

      if (accList.length > 0 && !billAccountId) {
        setBillAccountId(accList[0].id);
      }
      if (catList.length > 0 && !billCategoryId) {
        setBillCategoryId(catList[0].id);
      }
    } catch (e) {
      console.error('Erro ao carregar dados de planejamento:', e);
    }
  }, [currentMonth, billAccountId, billCategoryId]);

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

  const handleCreateBill = async () => {
    if (!billAccountId || !billAmount) return;
    const amountVal = parseFloat(billAmount.replace(',', '.')) || 0;
    if (amountVal <= 0) return;

    const dueDay = parseInt(billDueDate.split('-')[2], 10) || 1;

    await createScheduledBill({
      account_id: billAccountId,
      category_id: billCategoryId,
      amount: amountVal,
      type: billType,
      due_day: dueDay,
      frequency: 'MONTHLY',
      next_due_date: billDueDate,
      notes: billDesc.trim(),
    });

    setBillDesc('');
    setBillAmount('');
    setBillModalVisible(false);
    await loadData();
  };

  const handleSaveBudget = async () => {
    if (!selectedBudgetCat || !budgetLimit) return;
    const amountVal = parseFloat(budgetLimit.replace(',', '.')) || 0;
    if (amountVal <= 0) return;

    await setBudget(selectedBudgetCat, currentMonth, amountVal);
    setBudgetLimit('');
    setBudgetModalVisible(false);
    await loadData();
  };

  const handlePayBill = async (id: number) => {
    await payScheduledBill(id);
    await loadData();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Abas Superiores: Contas Agendadas vs Orçamento */}
      <RNView style={[styles.tabBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'BILLS' && { borderBottomColor: theme.tint, borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('BILLS')}
        >
          <Text
            style={[
              styles.tabTitle,
              { color: activeTab === 'BILLS' ? theme.tint : theme.subtext },
            ]}
          >
            Contas Agendadas ({bills.filter((b) => b.is_active === 1).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'BUDGET' && { borderBottomColor: theme.tint, borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('BUDGET')}
        >
          <Text
            style={[
              styles.tabTitle,
              { color: activeTab === 'BUDGET' ? theme.tint : theme.subtext },
            ]}
          >
            Orçamento Mensal ({budgets.length})
          </Text>
        </TouchableOpacity>
      </RNView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'BILLS' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Próximos Vencimentos</Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.tint }]}
                onPress={() => setBillModalVisible(true)}
              >
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Novo Agendamento</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {bills.length === 0 ? (
                <RNView style={styles.emptyView}>
                  <Ionicons name="calendar-outline" size={38} color={theme.subtext} />
                  <Text style={[styles.emptyText, { color: theme.subtext }]}>
                    Nenhuma conta recorrente agendada.
                  </Text>
                </RNView>
              ) : (
                bills.map((bill, index) => (
                  <RNView
                    key={bill.id}
                    style={[
                      styles.billRow,
                      index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                    ]}
                  >
                    <RNView style={styles.billDetails}>
                      <Text style={styles.billName}>
                        {bill.notes || bill.category_name || 'Conta Agendada'}
                      </Text>
                      <Text style={[styles.billMeta, { color: theme.subtext }]}>
                        Vence: {formatDateBR(bill.next_due_date)} • {bill.account_name} •{' '}
                        {bill.frequency === 'MONTHLY' ? 'Mensal' : 'Único'}
                      </Text>
                    </RNView>

                    <RNView style={styles.billActionArea}>
                      <Text
                        style={[
                          styles.billValue,
                          { color: bill.type === 'INCOME' ? theme.income : theme.expense },
                        ]}
                      >
                        {bill.type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(bill.amount)}
                      </Text>

                      {bill.is_active === 1 && (
                        <TouchableOpacity
                          style={[styles.payButton, { backgroundColor: theme.tint }]}
                          onPress={() => handlePayBill(bill.id)}
                        >
                          <Text style={styles.payButtonText}>Lançar</Text>
                        </TouchableOpacity>
                      )}
                    </RNView>
                  </RNView>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Metas e Limites</Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.tint }]}
                onPress={() => {
                  if (categories.length > 0 && !selectedBudgetCat) {
                    setSelectedBudgetCat(categories[0].id);
                  }
                  setBudgetModalVisible(true);
                }}
              >
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Definir Orçamento</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {budgets.length === 0 ? (
                <RNView style={styles.emptyView}>
                  <Ionicons name="calculator-outline" size={38} color={theme.subtext} />
                  <Text style={[styles.emptyText, { color: theme.subtext }]}>
                    Nenhum orçamento planejado para este mês.
                  </Text>
                </RNView>
              ) : (
                budgets.map((b, index) => {
                  const spent = b.spent_amount || 0;
                  const percent = Math.min(100, Math.round((spent / b.amount) * 100));
                  const isExceeded = spent > b.amount;

                  return (
                    <RNView
                      key={b.id}
                      style={[
                        styles.budgetRow,
                        index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                      ]}
                    >
                      <RNView style={styles.budgetHeader}>
                        <Text style={styles.budgetCatName}>{b.category_name}</Text>
                        <Text
                          style={[
                            styles.budgetStatus,
                            { color: isExceeded ? theme.expense : theme.income },
                          ]}
                        >
                          {formatCurrency(spent)} de {formatCurrency(b.amount)}
                        </Text>
                      </RNView>

                      {/* Barra de Progresso */}
                      <RNView style={[styles.budgetBarBg, { backgroundColor: theme.border }]}>
                        <RNView
                          style={[
                            styles.budgetBarFill,
                            {
                              width: `${percent}%`,
                              backgroundColor: isExceeded ? theme.expense : theme.tint,
                            },
                          ]}
                        />
                      </RNView>
                      <Text style={[styles.budgetRemaining, { color: theme.subtext }]}>
                        {isExceeded
                          ? `Limite estourado em ${formatCurrency(spent - b.amount)}!`
                          : `Resta gastar: ${formatCurrency(b.amount - spent)}`}
                      </Text>
                    </RNView>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal Novo Agendamento */}
      <Modal
        visible={billModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBillModalVisible(false)}
      >
        <RNView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={styles.modalTitle}>Agendar Conta</Text>

            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Descrição</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Ex: Aluguel, Internet, Salário..."
              placeholderTextColor={theme.subtext}
              value={billDesc}
              onChangeText={setBillDesc}
            />

            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 10 }]}>
              Valor (R$)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="0,00"
              placeholderTextColor={theme.subtext}
              keyboardType="numeric"
              value={billAmount}
              onChangeText={setBillAmount}
            />

            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 10 }]}>
              Data de Vencimento (AAAA-MM-DD)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.subtext}
              value={billDueDate}
              onChangeText={setBillDueDate}
            />

            <RNView style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setBillModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.tint }]}
                onPress={handleCreateBill}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Agendar</Text>
              </TouchableOpacity>
            </RNView>
          </View>
        </RNView>
      </Modal>

      {/* Modal Definir Orçamento */}
      <Modal
        visible={budgetModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBudgetModalVisible(false)}
      >
        <RNView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={styles.modalTitle}>Definir Limite de Categoria</Text>

            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Categoria</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator>
              {categories
                .filter((c) => c.type === 'EXPENSE')
                .map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catSelectItem,
                      selectedBudgetCat === cat.id && { backgroundColor: theme.tint + '20' },
                    ]}
                    onPress={() => setSelectedBudgetCat(cat.id)}
                  >
                    <Text
                      style={[
                        styles.catSelectText,
                        selectedBudgetCat === cat.id && { color: theme.tint, fontWeight: '700' },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 12 }]}>
              Limite Mensal (R$)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Ex: 1000,00"
              placeholderTextColor={theme.subtext}
              keyboardType="numeric"
              value={budgetLimit}
              onChangeText={setBudgetLimit}
            />

            <RNView style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setBudgetModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.tint }]}
                onPress={handleSaveBudget}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Salvar Limite</Text>
              </TouchableOpacity>
            </RNView>
          </View>
        </RNView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  billDetails: {
    flex: 1,
  },
  billName: {
    fontSize: 14,
    fontWeight: '600',
  },
  billMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  billActionArea: {
    alignItems: 'flex-end',
    gap: 6,
  },
  billValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  payButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  payButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  budgetRow: {
    padding: 14,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetCatName: {
    fontSize: 14,
    fontWeight: '600',
  },
  budgetStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  budgetBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  budgetBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetRemaining: {
    fontSize: 11,
    marginTop: 6,
  },
  emptyView: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
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
  catSelectItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  catSelectText: {
    fontSize: 14,
  },
});

