import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  View as RNView,
  Alert,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Category, Payee, TransactionType, ExpenseRecurrenceType } from '@/types';
import { getAccounts } from '@/db/accounts';
import { getCategories } from '@/db/categories';
import { getPayees, getOrCreatePayee } from '@/db/payees';
import { createTransaction } from '@/db/transactions';
import { scheduleExpenseReminderNotifications } from '@/services/notificationService';
import {
  formatCurrency,
  formatCurrencyInput,
  formatDateInput,
  brDateToISO,
  getTodayBR,
  MONTH_NAMES_LIST,
} from '@/utils/formatters';

const EXPENSE_TYPES: { type: ExpenseRecurrenceType; label: string; desc: string }[] = [
  { type: 'UNICO', label: 'Único', desc: 'Aparece até o pagamento ser realizado' },
  { type: 'MENSAL', label: 'Mensal', desc: 'Aparece todo mês no mesmo dia com valor atualizado' },
  { type: 'ANUAL', label: 'Anual', desc: 'Aparece todo ano no mesmo dia e mês' },
  { type: 'PERSONALIZAR', label: 'Personalizar', desc: 'Defina o mês de início e término' },
];

const RECEIPT_TYPES = ['CB', 'Coletas', 'Outros V.'] as const;
type ReceiptType = typeof RECEIPT_TYPES[number];

const INCOME_CATEGORIES = [
  'Dinheiro(Din)',
  'C.Itau (CIT)',
  'C.Bradesco(CBr)',
  'C.PagBank(CPb)',
] as const;

type IncomeCategoryType = typeof INCOME_CATEGORIES[number];

interface NoteCounts {
  q1: string;
  q2: string;
  q5: string;
  q10: string;
  q20: string;
  q50: string;
  q100: string;
  q200: string;
}

export default function NewTransactionScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const params = useLocalSearchParams<{
    initialType?: TransactionType;
    initialAccountId?: string;
    initialReceiptType?: ReceiptType;
  }>();

  // Tipo principal: Despesa ou Receita
  const [type, setType] = useState<TransactionType>(
    params.initialType === 'INCOME' ? 'INCOME' : 'EXPENSE'
  );

  // Contas e Categorias do banco de dados
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    params.initialAccountId ? parseInt(params.initialAccountId, 10) : null
  );

  // -------------------------------------------------------------
  // ESTADOS PARA DESPESA
  // -------------------------------------------------------------
  const [expenseName, setExpenseName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [expenseAmountDigits, setExpenseAmountDigits] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseRecurrenceType>('UNICO');
  const [startMonth, setStartMonth] = useState<string>('Janeiro');
  const [endMonth, setEndMonth] = useState<string>('Dezembro');
  const [monthModalTarget, setMonthModalTarget] = useState<'START' | 'END' | null>(null);

  const [expenseDateBR, setExpenseDateBR] = useState(getTodayBR());
  const [expenseNotes, setExpenseNotes] = useState('');

  // -------------------------------------------------------------
  // ESTADOS PARA RECEITA
  // -------------------------------------------------------------
  const rawReceiptType = params.initialReceiptType as string | undefined;
  const initialReceipt: ReceiptType =
    rawReceiptType === 'Outros Valores' || rawReceiptType === 'Outros V.'
      ? 'Outros V.'
      : rawReceiptType === 'Coletas'
      ? 'Coletas'
      : 'CB';

  const [receiptType, setReceiptType] = useState<ReceiptType>(initialReceipt);
  const [incomeDateBR, setIncomeDateBR] = useState(getTodayBR());
  const [incomeCategory, setIncomeCategory] = useState<IncomeCategoryType>('Dinheiro(Din)');
  const [bankAmountDigits, setBankAmountDigits] = useState('');

  // Contagem de Notas para Dinheiro(Din)
  const [noteCounts, setNoteCounts] = useState<NoteCounts>({
    q1: '',
    q2: '',
    q5: '',
    q10: '',
    q20: '',
    q50: '',
    q100: '',
    q200: '',
  });

  const loadFormSources = useCallback(async () => {
    const [accs, cats, pays] = await Promise.all([
      getAccounts(),
      getCategories(),
      getPayees(),
    ]);

    setAccounts(accs);
    setCategories(cats);
    setPayees(pays);

    // Se ainda não escolheu categoria de favorecido para despesa, selecionar a primeira disponível
    const expenseCats = cats.filter((c) => c.type === 'EXPENSE');
    if (!selectedCategoryId && expenseCats.length > 0) {
      setSelectedCategoryId(expenseCats[0].id);
    }

    if (!selectedAccountId && accs.length > 0) {
      const found = accs.find((a) =>
        a.name.toUpperCase().includes(receiptType.toUpperCase()) ||
        (receiptType === 'Outros V.' && a.name.toUpperCase().includes('OUTRO'))
      );
      setSelectedAccountId(found ? found.id : accs[0].id);
    }
  }, [selectedCategoryId, selectedAccountId, receiptType]);

  useFocusEffect(
    useCallback(() => {
      loadFormSources();
    }, [loadFormSources])
  );

  // Atualizar conta padrão quando o usuário trocar o Tipo de Receita
  const handleSelectReceiptType = (rt: ReceiptType) => {
    setReceiptType(rt);
    const found = accounts.find((a) =>
      a.name.toUpperCase().includes(rt.toUpperCase()) ||
      (rt === 'Outros V.' && a.name.toUpperCase().includes('OUTRO'))
    );
    if (found) {
      setSelectedAccountId(found.id);
    }
  };

  // Categorias de despesa disponíveis para a sessão Favorecido
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');

  // Cálculo da Contagem de Notas para Receita em Dinheiro
  const totalCashCount =
    (parseInt(noteCounts.q1, 10) || 0) * 1 +
    (parseInt(noteCounts.q2, 10) || 0) * 2 +
    (parseInt(noteCounts.q5, 10) || 0) * 5 +
    (parseInt(noteCounts.q10, 10) || 0) * 10 +
    (parseInt(noteCounts.q20, 10) || 0) * 20 +
    (parseInt(noteCounts.q50, 10) || 0) * 50 +
    (parseInt(noteCounts.q100, 10) || 0) * 100 +
    (parseInt(noteCounts.q200, 10) || 0) * 200;

  // Valor atual da Receita (seja em dinheiro ou banco)
  const currentIncomeValue =
    incomeCategory === 'Dinheiro(Din)'
      ? totalCashCount
      : formatCurrencyInput(bankAmountDigits).numericValue;

  // Desconto de 10% referente ao CB Mensal
  const cbMonthlyDiscount = currentIncomeValue * 0.1;

  // Atualização segura de notas
  const handleUpdateNoteCount = (field: keyof NoteCounts, val: string) => {
    const digitsOnly = val.replace(/\D/g, '');
    setNoteCounts((prev) => ({ ...prev, [field]: digitsOnly }));
  };

  // Salvar Despesa ou Receita
  const handleSave = async () => {
    const fallbackAccountId = selectedAccountId || accounts[0]?.id || 1;

    if (type === 'EXPENSE') {
      // 1. Validação de Despesa: Nome da Despesa é OBRIGATÓRIO
      if (!expenseName.trim()) {
        Alert.alert('Campo Obrigatório', 'Por favor, informe o Nome da Despesa.');
        return;
      }

      // Validação do Favorecido (Categoria)
      if (!selectedCategoryId) {
        Alert.alert('Favorecido Obrigatório', 'Por favor, selecione uma categoria em Favorecido.');
        return;
      }

      const { numericValue } = formatCurrencyInput(expenseAmountDigits);
      if (numericValue <= 0) {
        Alert.alert('Valor inválido', 'Por favor, informe o valor da despesa.');
        return;
      }

      const isoDate = brDateToISO(expenseDateBR);
      if (!isoDate || isoDate.length !== 10) {
        Alert.alert('Data inválida', 'Informe a data no padrão brasileiro DD-MM-AAAA.');
        return;
      }

      // Salva o Nome da Despesa em Payee e nas notas, e a categoria em category_id
      const resolvedPayeeId = await getOrCreatePayee(expenseName.trim());

      const dueDay = parseInt(isoDate.split('-')[2], 10) || 1;

      // Junta Nome da Despesa com eventuais observações
      const finalExpenseDescription = expenseNotes.trim()
        ? `${expenseName.trim()} (${expenseNotes.trim()})`
        : expenseName.trim();

      try {
        await createTransaction({
          account_id: fallbackAccountId,
          category_id: selectedCategoryId,
          payee_id: resolvedPayeeId,
          amount: numericValue,
          type: 'EXPENSE',
          date: isoDate,
          status: 'UNCLEARED', // Despesa acumulativa até ser paga
          notes: finalExpenseDescription,
          expense_type: expenseType,
          start_month: expenseType === 'PERSONALIZAR' ? startMonth : null,
          end_month: expenseType === 'PERSONALIZAR' ? endMonth : null,
          due_day: dueDay,
        });

        scheduleExpenseReminderNotifications().catch(() => {});

        Alert.alert('Sucesso', 'Despesa cadastrada com sucesso!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch (err) {
        console.error('Erro ao salvar despesa:', err);
        Alert.alert('Erro', 'Não foi possível cadastrar a despesa.');
      }
    } else {
      // 2. Validação e Salvamento de Receita
      const isoDate = brDateToISO(incomeDateBR);
      if (!isoDate || isoDate.length !== 10) {
        Alert.alert('Data inválida', 'Informe a data no padrão brasileiro DD-MM-AAAA.');
        return;
      }

      let finalAmount = 0;
      let notesSummary = '';

      if (incomeCategory === 'Dinheiro(Din)') {
        finalAmount = totalCashCount;
        if (finalAmount <= 0) {
          Alert.alert(
            'Contagem zerada',
            'Informe a quantidade de pelo menos uma nota ou moeda na Contagem de Notas.'
          );
          return;
        }

        // Resumo detalhado da contagem gravado em notas
        const parts: string[] = [];
        if (parseInt(noteCounts.q200, 10)) parts.push(`${noteCounts.q200}x R$200`);
        if (parseInt(noteCounts.q100, 10)) parts.push(`${noteCounts.q100}x R$100`);
        if (parseInt(noteCounts.q50, 10)) parts.push(`${noteCounts.q50}x R$50`);
        if (parseInt(noteCounts.q20, 10)) parts.push(`${noteCounts.q20}x R$20`);
        if (parseInt(noteCounts.q10, 10)) parts.push(`${noteCounts.q10}x R$10`);
        if (parseInt(noteCounts.q5, 10)) parts.push(`${noteCounts.q5}x R$5`);
        if (parseInt(noteCounts.q2, 10)) parts.push(`${noteCounts.q2}x R$2`);
        if (parseInt(noteCounts.q1, 10)) parts.push(`${noteCounts.q1}x R$1`);
        notesSummary = `Receita [${receiptType}] via Dinheiro (${parts.join(', ')})`;
      } else {
        const { numericValue } = formatCurrencyInput(bankAmountDigits);
        finalAmount = numericValue;
        if (finalAmount <= 0) {
          Alert.alert('Valor inválido', 'Por favor, informe o valor recebido.');
          return;
        }
        notesSummary = `Receita [${receiptType}] via ${incomeCategory}`;
      }

      // Encontrar ID da categoria de destino
      const matchedCategory = categories.find(
        (c) => c.name.toLowerCase() === incomeCategory.toLowerCase()
      );

      // Encontrar ID da conta do tipo de receita
      const targetAcc = accounts.find((a) =>
        a.name.toUpperCase().includes(receiptType.toUpperCase()) ||
        (receiptType === 'Outros V.' && a.name.toUpperCase().includes('OUTRO'))
      );
      const receiptAccountId = targetAcc?.id || fallbackAccountId;

      try {
        // 1. Criar a Receita
        await createTransaction({
          account_id: receiptAccountId,
          category_id: matchedCategory?.id || null,
          amount: finalAmount,
          type: 'INCOME',
          date: isoDate,
          status: 'CLEARED',
          notes: notesSummary,
        });

        // 2. Criar automaticamente a nova despesa única de 10% do CB Mensal
        const discountAmount = Math.round(finalAmount * 0.1 * 100) / 100;
        if (discountAmount > 0) {
          const expenseTitle = `CB Mensal - ${receiptType}`;
          const cbPayeeId = await getOrCreatePayee(expenseTitle);

          await createTransaction({
            account_id: receiptAccountId,
            payee_id: cbPayeeId,
            amount: discountAmount,
            type: 'EXPENSE',
            expense_type: 'UNICO',
            date: isoDate,
            status: 'UNCLEARED',
            notes: `Desconto automático de 10% referente ao CB Mensal da receita (${receiptType})`,
          });
          scheduleExpenseReminderNotifications().catch(() => {});
        }

        Alert.alert(
          'Sucesso',
          `Receita de ${formatCurrency(finalAmount)} registrada com sucesso!\n\nFoi gerada automaticamente a despesa "CB Mensal - ${receiptType}" de ${formatCurrency(discountAmount)}.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } catch (err) {
        console.error('Erro ao salvar receita:', err);
        Alert.alert('Erro', 'Não foi possível cadastrar a receita.');
      }
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* 1. SELETOR PRINCIPAL: DESPESA OU RECEITA */}
      <View style={[styles.typeSelectorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.typeTab,
            type === 'EXPENSE' && { backgroundColor: theme.expense, borderColor: theme.expense },
          ]}
          onPress={() => setType('EXPENSE')}
        >
          <Ionicons
            name="arrow-up-circle"
            size={18}
            color={type === 'EXPENSE' ? '#FFF' : theme.expense}
          />
          <Text
            style={[
              styles.typeTabText,
              { color: type === 'EXPENSE' ? '#FFF' : theme.text },
            ]}
          >
            Despesa
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeTab,
            type === 'INCOME' && { backgroundColor: theme.income, borderColor: theme.income },
          ]}
          onPress={() => setType('INCOME')}
        >
          <Ionicons
            name="arrow-down-circle"
            size={18}
            color={type === 'INCOME' ? '#FFF' : theme.income}
          />
          <Text
            style={[
              styles.typeTabText,
              { color: type === 'INCOME' ? '#FFF' : theme.text },
            ]}
          >
            Receita
          </Text>
        </TouchableOpacity>
      </View>

      {/* ============================================================== */}
      {/* FLUXO 1: SE A ESCOLHA DO USUÁRIO FOR DESPESA                    */}
      {/* ============================================================== */}
      {type === 'EXPENSE' && (
        <>
          {/* 1ª Sessão: Nome da Despesa (Campo de Texto Obrigatório) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.headerWithRequired}>
              <Text style={[styles.cardHeader, { color: theme.subtext, marginBottom: 0 }]}>
                Nome da Despesa
              </Text>
              <Text style={styles.requiredBadge}>* Obrigatório</Text>
            </RNView>
            <Text style={[styles.sectionDescText, { color: theme.subtext }]}>
              Escreva o nome ou identificação que deseja dar a esta despesa:
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Ex: Troca de óleo, Conta de luz, Pão francês, Gasolina..."
              placeholderTextColor={theme.subtext}
              value={expenseName}
              onChangeText={setExpenseName}
            />
          </View>

          {/* 2ª Sessão: Favorecido (Categoria onde a despesa se encaixa) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.headerWithRequired}>
              <Text style={[styles.cardHeader, { color: theme.subtext, marginBottom: 0 }]}>
                Favorecido
              </Text>
              <Text style={styles.requiredBadge}>* Obrigatório</Text>
            </RNView>
            <Text style={[styles.sectionDescText, { color: theme.subtext }]}>
              Selecione a categoria de favorecido em que a despesa se encaixa:
            </Text>

            {/* Chips de categorias de Favorecido */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.favorecidoScroll}>
              {expenseCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.favorecidoChip,
                      { borderColor: theme.border },
                      isSelected && { backgroundColor: cat.color || theme.tint, borderColor: cat.color || theme.tint },
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Ionicons
                      name={(cat.icon as any) || 'pricetag'}
                      size={15}
                      color={isSelected ? '#FFF' : cat.color || theme.tint}
                    />
                    <Text
                      style={[
                        styles.favorecidoChipText,
                        { color: isSelected ? '#FFF' : theme.text, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Link para criar e alterar categorias de favorecido */}
            <TouchableOpacity
              style={styles.categoryManagerLinkRow}
              onPress={() => router.push('/category-manager')}
            >
              <Ionicons name="add-circle-outline" size={17} color={theme.tint} />
              <Text style={[styles.categoryManagerLinkText, { color: theme.tint }]}>
                Criar novas categoria de favorecido
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.tint} />
            </TouchableOpacity>
          </View>

          {/* 3ª Sessão: Valor (Máscara da direita para a esquerda com centavos) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Valor</Text>
            <TextInput
              style={[
                styles.largeValueInput,
                { color: theme.expense, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="R$ 0,00"
              placeholderTextColor={theme.subtext}
              keyboardType="numeric"
              value={formatCurrencyInput(expenseAmountDigits).formatted}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '');
                setExpenseAmountDigits(digits);
              }}
            />
            <Text style={[styles.fieldHint, { color: theme.subtext }]}>
              Preenchido da direita para a esquerda com centavos
            </Text>
          </View>

          {/* 4ª Sessão: Tipo de Despesa (Único, Mensal, Anual, Personalizar) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Tipo de Despesa</Text>
            <RNView style={styles.grid2x2}>
              {EXPENSE_TYPES.map((item) => {
                const isSelected = expenseType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    style={[
                      styles.expenseTypeOption,
                      { borderColor: theme.border },
                      isSelected && { backgroundColor: theme.tint, borderColor: theme.tint },
                    ]}
                    onPress={() => setExpenseType(item.type)}
                  >
                    <Text
                      style={[
                        styles.expenseTypeTitle,
                        { color: isSelected ? '#FFF' : theme.text },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.expenseTypeSub,
                        { color: isSelected ? '#E2E8F0' : theme.subtext },
                      ]}
                      numberOfLines={2}
                    >
                      {item.desc}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </RNView>

            {/* Campos extras se o usuário escolher "Personalizar" */}
            {expenseType === 'PERSONALIZAR' && (
              <RNView style={[styles.personalizarBox, { borderTopColor: theme.border }]}>
                <Text style={[styles.personalizarHeading, { color: theme.text }]}>
                  Período da Despesa Personalizada:
                </Text>

                <RNView style={styles.startEndRow}>
                  {/* Campo Início */}
                  <RNView style={styles.pickerCol}>
                    <Text style={[styles.smallLabel, { color: theme.subtext }]}>Início</Text>
                    <TouchableOpacity
                      style={[
                        styles.selectButton,
                        { backgroundColor: theme.background, borderColor: theme.border },
                      ]}
                      onPress={() => setMonthModalTarget('START')}
                    >
                      <Ionicons name="calendar-outline" size={16} color={theme.tint} />
                      <Text style={[styles.selectButtonText, { color: theme.text }]}>
                        {startMonth}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={theme.subtext} />
                    </TouchableOpacity>
                  </RNView>

                  {/* Campo Término */}
                  <RNView style={styles.pickerCol}>
                    <Text style={[styles.smallLabel, { color: theme.subtext }]}>Término</Text>
                    <TouchableOpacity
                      style={[
                        styles.selectButton,
                        { backgroundColor: theme.background, borderColor: theme.border },
                      ]}
                      onPress={() => setMonthModalTarget('END')}
                    >
                      <Ionicons name="calendar-outline" size={16} color={theme.tint} />
                      <Text style={[styles.selectButtonText, { color: theme.text }]}>
                        {endMonth}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={theme.subtext} />
                    </TouchableOpacity>
                  </RNView>
                </RNView>
              </RNView>
            )}
          </View>

          {/* 5ª Sessão: Data (Padrão DD-MM-AAAA com máscara automática) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Data (DD-MM-AAAA)</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              keyboardType="numeric"
              placeholder="DD-MM-AAAA"
              placeholderTextColor={theme.subtext}
              maxLength={10}
              value={expenseDateBR}
              onChangeText={(text) => {
                const masked = formatDateInput(text);
                setExpenseDateBR(masked);
              }}
            />
            <Text style={[styles.fieldHint, { color: theme.subtext }]}>
              Formato dia-mês-ano com máscara automática
            </Text>
          </View>

          {/* 6ª Sessão: Observações / Descrição Opcional */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Observações (Opcional)</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, height: 60 },
              ]}
              placeholder="Detalhes ou anotações adicionais..."
              placeholderTextColor={theme.subtext}
              multiline
              value={expenseNotes}
              onChangeText={setExpenseNotes}
            />
          </View>
        </>
      )}

      {/* ============================================================== */}
      {/* FLUXO 2: SENÃO, SE A ESCOLHA DO USUÁRIO FOR RECEITA             */}
      {/* ============================================================== */}
      {type === 'INCOME' && (
        <>
          {/* 1ª Sessão: Tipo de receita (Select Obrigatório: CB, Coletas ou Outros Valores) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.headerWithRequired}>
              <Text style={[styles.cardHeader, { color: theme.subtext, marginBottom: 0 }]}>
                Tipo de Receita
              </Text>
              <Text style={styles.requiredBadge}>* Obrigatório</Text>
            </RNView>

            <RNView style={styles.receiptTypeRow}>
              {RECEIPT_TYPES.map((rt) => {
                const isSelected = receiptType === rt;
                return (
                  <TouchableOpacity
                    key={rt}
                    style={[
                      styles.receiptTypeChip,
                      { borderColor: theme.border },
                      isSelected && { backgroundColor: theme.tint, borderColor: theme.tint },
                    ]}
                    onPress={() => handleSelectReceiptType(rt)}
                  >
                    <Ionicons
                      name={
                        rt === 'CB'
                          ? 'shield-checkmark'
                          : rt === 'Coletas'
                          ? 'cash'
                          : 'gift'
                      }
                      size={18}
                      color={isSelected ? '#FFF' : theme.tint}
                    />
                    <Text
                      style={[
                        styles.receiptTypeChipText,
                        { color: isSelected ? '#FFF' : theme.text },
                      ]}
                    >
                      {rt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </RNView>
          </View>

          {/* 2ª Sessão: Data (Padrão DD-MM-AAAA) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Data (DD-MM-AAAA)</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              keyboardType="numeric"
              placeholder="DD-MM-AAAA"
              placeholderTextColor={theme.subtext}
              maxLength={10}
              value={incomeDateBR}
              onChangeText={(text) => {
                const masked = formatDateInput(text);
                setIncomeDateBR(masked);
              }}
            />
          </View>

          {/* 3ª Sessão: Categorias (Dinheiro, CIT, CBr, CPb) */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Categorias</Text>
            <RNView style={styles.categoriesGrid}>
              {INCOME_CATEGORIES.map((cat) => {
                const isSelected = incomeCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryCardBtn,
                      { borderColor: theme.border },
                      isSelected && { backgroundColor: theme.tint, borderColor: theme.tint },
                    ]}
                    onPress={() => setIncomeCategory(cat)}
                  >
                    <Ionicons
                      name={cat.includes('Dinheiro') ? 'cash-outline' : 'card-outline'}
                      size={20}
                      color={isSelected ? '#FFF' : theme.tint}
                    />
                    <Text
                      style={[
                        styles.categoryCardText,
                        { color: isSelected ? '#FFF' : theme.text },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </RNView>

            {/* SE O USUÁRIO ESCOLHER "Dinheiro(Din)": Abre Contagem de Notas */}
            {incomeCategory === 'Dinheiro(Din)' && (
              <RNView style={[styles.cashCountingContainer, { borderTopColor: theme.border }]}>
                <RNView style={styles.cashCountingHeader}>
                  <Ionicons name="calculator-outline" size={18} color={theme.income} />
                  <Text style={[styles.cashCountingTitle, { color: theme.text }]}>
                    Contagem de Notas
                  </Text>
                </RNView>
                <Text style={[styles.cashCountingSub, { color: theme.subtext }]}>
                  Informe a quantidade de cada nota ou moeda (campos vazios valem 0):
                </Text>

                <RNView style={styles.notesGrid}>
                  {/* R$ 1,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 1,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q1}
                      onChangeText={(val) => handleUpdateNoteCount('q1', val)}
                    />
                  </RNView>

                  {/* R$ 2,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 2,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q2}
                      onChangeText={(val) => handleUpdateNoteCount('q2', val)}
                    />
                  </RNView>

                  {/* R$ 5,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 5,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q5}
                      onChangeText={(val) => handleUpdateNoteCount('q5', val)}
                    />
                  </RNView>

                  {/* R$ 10,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 10,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q10}
                      onChangeText={(val) => handleUpdateNoteCount('q10', val)}
                    />
                  </RNView>

                  {/* R$ 20,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 20,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q20}
                      onChangeText={(val) => handleUpdateNoteCount('q20', val)}
                    />
                  </RNView>

                  {/* R$ 50,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 50,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q50}
                      onChangeText={(val) => handleUpdateNoteCount('q50', val)}
                    />
                  </RNView>

                  {/* R$ 100,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 100,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q100}
                      onChangeText={(val) => handleUpdateNoteCount('q100', val)}
                    />
                  </RNView>

                  {/* R$ 200,00 */}
                  <RNView style={styles.noteField}>
                    <Text style={[styles.noteName, { color: theme.text }]}>R$ 200,00</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.subtext}
                      value={noteCounts.q200}
                      onChangeText={(val) => handleUpdateNoteCount('q200', val)}
                    />
                  </RNView>
                </RNView>
              </RNView>
            )}
          </View>

          {/* 4ª Sessão: Valor */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardHeader, { color: theme.subtext }]}>Valor</Text>

            {incomeCategory === 'Dinheiro(Din)' ? (
              /* Valor preenchido automaticamente com a soma da Contagem de Notas */
              <RNView
                style={[
                  styles.autoCalculatedValueCard,
                  { backgroundColor: theme.income + '12', borderColor: theme.income + '40' },
                ]}
              >
                <Text style={[styles.autoCalculatedValueText, { color: theme.income }]}>
                  {formatCurrency(totalCashCount)}
                </Text>
                <Text style={[styles.autoCalculatedSubtitle, { color: theme.subtext }]}>
                  Soma total automática da Contagem de Notas
                </Text>
              </RNView>
            ) : (
              /* Campo digitável com máscara da direita para a esquerda */
              <>
                <TextInput
                  style={[
                    styles.largeValueInput,
                    { color: theme.income, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                  placeholder="R$ 0,00"
                  placeholderTextColor={theme.subtext}
                  keyboardType="numeric"
                  value={formatCurrencyInput(bankAmountDigits).formatted}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, '');
                    setBankAmountDigits(digits);
                  }}
                />
                <Text style={[styles.fieldHint, { color: theme.subtext }]}>
                  Preenchido da direita para a esquerda com centavos
                </Text>
              </>
            )}
          </View>

          {/* 5ª Sessão: Desconto de CB Mensal (10% da sessão Valor) */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.card, borderColor: '#0D948840' },
            ]}
          >
            <RNView style={styles.discountHeaderRow}>
              <RNView style={styles.discountIconCircle}>
                <Ionicons name="trending-down" size={16} color="#0D9488" />
              </RNView>
              <RNView style={{ flex: 1 }}>
                <Text style={[styles.discountCardTitle, { color: theme.text }]}>
                  Desconto de CB Mensal (10%)
                </Text>
                <Text style={[styles.discountCardSub, { color: theme.subtext }]}>
                  Calculado automaticamente sobre o valor da receita
                </Text>
              </RNView>
            </RNView>

            <RNView style={styles.discountAmountBox}>
              <Text style={styles.discountAmountText}>
                {formatCurrency(cbMonthlyDiscount)}
              </Text>
              <Text style={[styles.discountExplainer, { color: theme.subtext }]}>
                Ao salvar, será criada automaticamente a despesa:
                {'\n'}
                <Text style={{ fontWeight: '700', color: theme.expense }}>
                  CB Mensal - {receiptType}
                </Text>{' '}
                no valor de {formatCurrency(cbMonthlyDiscount)}.
              </Text>
            </RNView>
          </View>
        </>
      )}

      {/* BOTÃO PRINCIPAL DE SALVAR */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          { backgroundColor: type === 'EXPENSE' ? theme.expense : theme.income },
        ]}
        onPress={handleSave}
      >
        <Ionicons name="checkmark-circle" size={24} color="#FFF" />
        <Text style={styles.saveButtonText}>
          {type === 'EXPENSE' ? 'Salvar Despesa' : 'Salvar Receita'}
        </Text>
      </TouchableOpacity>

      {/* MODAL DE ESCOLHA DE MÊS (INÍCIO / TÉRMINO) */}
      <Modal
        visible={monthModalTarget !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setMonthModalTarget(null)}
      >
        <RNView style={styles.modalBackdrop}>
          <RNView style={[styles.monthModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={styles.monthModalTitle}>
              {monthModalTarget === 'START' ? 'Escolha o Mês de Início' : 'Escolha o Mês de Término'}
            </Text>

            <RNView style={styles.monthsGrid}>
              {MONTH_NAMES_LIST.map((m) => {
                const isCurrent =
                  monthModalTarget === 'START' ? startMonth === m : endMonth === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.monthGridBtn,
                      { borderColor: theme.border },
                      isCurrent && { backgroundColor: theme.tint, borderColor: theme.tint },
                    ]}
                    onPress={() => {
                      if (monthModalTarget === 'START') {
                        setStartMonth(m);
                      } else {
                        setEndMonth(m);
                      }
                      setMonthModalTarget(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.monthGridBtnText,
                        { color: isCurrent ? '#FFF' : theme.text },
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </RNView>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { borderColor: theme.border }]}
              onPress={() => setMonthModalTarget(null)}
            >
              <Text style={[styles.modalCloseText, { color: theme.text }]}>Fechar</Text>
            </TouchableOpacity>
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
    paddingBottom: 50,
  },
  typeSelectorCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
    marginBottom: 16,
    gap: 8,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  typeTabText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  headerWithRequired: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionDescText: {
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requiredBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  favorecidoScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  favorecidoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  favorecidoChipText: {
    fontSize: 13,
  },
  categoryManagerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    gap: 6,
  },
  categoryManagerLinkText: {
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  largeValueInput: {
    fontSize: 26,
    fontWeight: '800',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  expenseTypeOption: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  expenseTypeTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  expenseTypeSub: {
    fontSize: 11,
    lineHeight: 14,
  },
  personalizarBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  personalizarHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  startEndRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerCol: {
    flex: 1,
  },
  smallLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  receiptTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptTypeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  receiptTypeChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryCardBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
  },
  categoryCardText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  cashCountingContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  cashCountingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cashCountingTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cashCountingSub: {
    fontSize: 12,
    marginBottom: 12,
  },
  notesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  noteField: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  noteName: {
    fontSize: 13,
    fontWeight: '600',
  },
  noteInput: {
    width: 65,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  autoCalculatedValueCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoCalculatedValueText: {
    fontSize: 32,
    fontWeight: '900',
  },
  autoCalculatedSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  discountHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  discountIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0D948820',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  discountCardSub: {
    fontSize: 11,
  },
  discountAmountBox: {
    backgroundColor: '#0D948810',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  discountAmountText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0D9488',
    marginBottom: 4,
  },
  discountExplainer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  // Modal de Meses
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  monthModalCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  monthModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  monthGridBtn: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  monthGridBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalCloseBtn: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
