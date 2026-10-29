import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  View as RNView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Category, Payee, TransactionStatus, TransactionType } from '@/types';
import { getAccounts } from '@/db/accounts';
import { getCategories } from '@/db/categories';
import { getPayees, getOrCreatePayee } from '@/db/payees';
import { createTransaction } from '@/db/transactions';
import { formatCurrency, getTodayISO } from '@/utils/formatters';

interface SplitRow {
  categoryId: number;
  amount: string;
  memo: string;
}

export default function NewTransactionScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const params = useLocalSearchParams<{ initialType?: TransactionType; initialAccountId?: string }>();

  const [type, setType] = useState<TransactionType>(params.initialType || 'EXPENSE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [accountId, setAccountId] = useState<number | null>(
    params.initialAccountId ? parseInt(params.initialAccountId, 10) : null
  );
  const [destAccountId, setDestAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('CLEARED');
  const [notes, setNotes] = useState('');
  const [checkNumber, setCheckNumber] = useState('');

  // Modo Split (Divisão clássica do MS Money)
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);

  useEffect(() => {
    async function loadFormSources() {
      const [accs, cats, pays] = await Promise.all([
        getAccounts(),
        getCategories(),
        getPayees(),
      ]);

      setAccounts(accs);
      setCategories(cats);
      setPayees(pays);

      if (!accountId && accs.length > 0) {
        setAccountId(accs[0].id);
      }
      if (accs.length > 1) {
        setDestAccountId(accs[1].id);
      }
      if (cats.length > 0) {
        setCategoryId(cats[0].id);
      }
    }
    loadFormSources();
  }, []);

  const totalNumeric = parseFloat(amount.replace(',', '.')) || 0;
  const currentSplitsTotal = splits.reduce(
    (sum, s) => sum + (parseFloat(s.amount.replace(',', '.')) || 0),
    0
  );
  const remainingSplit = totalNumeric - currentSplitsTotal;

  const handleAddSplitRow = () => {
    if (categories.length === 0) return;
    const defaultCat = categories[0].id;
    const autoAmount = remainingSplit > 0 ? remainingSplit.toFixed(2) : '';
    setSplits([...splits, { categoryId: defaultCat, amount: autoAmount, memo: '' }]);
  };

  const handleRemoveSplitRow = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const handleUpdateSplit = (index: number, field: keyof SplitRow, value: any) => {
    const updated = [...splits];
    updated[index] = { ...updated[index], [field]: value };
    setSplits(updated);
  };

  const handleSave = async () => {
    if (!totalNumeric || totalNumeric <= 0) {
      Alert.alert('Valor inválido', 'Por favor insira um valor positivo.');
      return;
    }
    if (!accountId) {
      Alert.alert('Conta obrigatória', 'Selecione uma conta.');
      return;
    }
    if (type === 'TRANSFER' && (!destAccountId || destAccountId === accountId)) {
      Alert.alert('Transferência', 'Selecione uma conta de destino diferente da origem.');
      return;
    }

    if (isSplitMode && splits.length > 0) {
      if (Math.abs(remainingSplit) > 0.01) {
        Alert.alert(
          'Divisão incompleta',
          `A soma das fatias (R$ ${currentSplitsTotal.toFixed(2)}) deve ser igual ao valor total (R$ ${totalNumeric.toFixed(2)}). Falta distribuir: R$ ${remainingSplit.toFixed(2)}`
        );
        return;
      }
    }

    let resolvedPayeeId: number | null = null;
    if (payeeName.trim()) {
      resolvedPayeeId = await getOrCreatePayee(payeeName.trim());
    }

    const formattedSplits = isSplitMode
      ? splits.map((s) => ({
          category_id: s.categoryId,
          amount: parseFloat(s.amount.replace(',', '.')) || 0,
          memo: s.memo,
        }))
      : undefined;

    await createTransaction({
      account_id: accountId,
      destination_account_id: type === 'TRANSFER' ? destAccountId : null,
      category_id: type === 'TRANSFER' || isSplitMode ? null : categoryId,
      payee_id: type === 'TRANSFER' ? null : resolvedPayeeId,
      amount: totalNumeric,
      type,
      date,
      status,
      notes: notes.trim() || null,
      check_number: checkNumber.trim() || null,
      splits: formattedSplits,
    });

    router.back();
  };

  const filteredCategories = categories.filter((c) =>
    type === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 1. Tipo de Transação */}
      <RNView style={styles.typeSelector}>
        <TouchableOpacity
          style={[
            styles.typeButton,
            type === 'EXPENSE' && { backgroundColor: theme.expense },
          ]}
          onPress={() => setType('EXPENSE')}
        >
          <Text
            style={[
              styles.typeButtonText,
              { color: type === 'EXPENSE' ? '#FFF' : theme.text },
            ]}
          >
            Despesa
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeButton,
            type === 'INCOME' && { backgroundColor: theme.income },
          ]}
          onPress={() => setType('INCOME')}
        >
          <Text
            style={[
              styles.typeButtonText,
              { color: type === 'INCOME' ? '#FFF' : theme.text },
            ]}
          >
            Receita
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.typeButton,
            type === 'TRANSFER' && { backgroundColor: theme.transfer },
          ]}
          onPress={() => setType('TRANSFER')}
        >
          <Text
            style={[
              styles.typeButtonText,
              { color: type === 'TRANSFER' ? '#FFF' : theme.text },
            ]}
          >
            Transferência
          </Text>
        </TouchableOpacity>
      </RNView>

      {/* 2. Campo de Valor com Destaque */}
      <View style={[styles.amountCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.amountLabel, { color: theme.subtext }]}>Valor</Text>
        <RNView style={styles.amountInputRow}>
          <Text style={[styles.currencyPrefix, { color: theme.tint }]}>R$</Text>
          <TextInput
            style={[styles.amountInput, { color: theme.text }]}
            placeholder="0,00"
            placeholderTextColor={theme.subtext}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
        </RNView>
      </View>

      {/* 3. Seleção de Contas */}
      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardHeader, { color: theme.subtext }]}>
          {type === 'TRANSFER' ? 'Conta de Origem' : 'Conta'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              style={[
                styles.chip,
                { borderColor: theme.border },
                accountId === acc.id && { backgroundColor: theme.tint, borderColor: theme.tint },
              ]}
              onPress={() => setAccountId(acc.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: accountId === acc.id ? '#FFF' : theme.text },
                ]}
              >
                {acc.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {type === 'TRANSFER' && (
          <>
            <Text style={[styles.cardHeader, { color: theme.subtext, marginTop: 16 }]}>
              Conta de Destino
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  disabled={acc.id === accountId}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    destAccountId === acc.id && { backgroundColor: theme.transfer, borderColor: theme.transfer },
                    acc.id === accountId && { opacity: 0.3 },
                  ]}
                  onPress={() => setDestAccountId(acc.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: destAccountId === acc.id ? '#FFF' : theme.text },
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>

      {/* 4. Favorecido (Payee) e Categorias */}
      {type !== 'TRANSFER' && (
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardHeader, { color: theme.subtext }]}>
            {type === 'EXPENSE' ? 'Favorecido (Onde você gastou)' : 'Fonte Pagadora'}
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
            placeholder="Ex: Supermercado Guanabara, Posto Ipiranga..."
            placeholderTextColor={theme.subtext}
            value={payeeName}
            onChangeText={setPayeeName}
          />

          {/* Sugestões de favorecidos recentes */}
          {payees.length > 0 && !payeeName && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {payees.slice(0, 6).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.smallChip, { borderColor: theme.border }]}
                  onPress={() => setPayeeName(p.name)}
                >
                  <Text style={[styles.smallChipText, { color: theme.subtext }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Divisão de Transação (Split) - Recurso Clássico MS Money */}
          <RNView style={styles.splitToggleRow}>
            <Text style={[styles.cardHeader, { color: theme.subtext, marginBottom: 0 }]}>
              {isSplitMode ? 'Divisão de Categorias (Split)' : 'Categoria'}
            </Text>
            <TouchableOpacity
              style={[
                styles.splitToggleBtn,
                isSplitMode && { backgroundColor: theme.tint },
              ]}
              onPress={() => {
                if (!isSplitMode && splits.length === 0 && totalNumeric > 0) {
                  setSplits([
                    { categoryId: categoryId || categories[0]?.id || 1, amount: totalNumeric.toFixed(2), memo: '' },
                  ]);
                }
                setIsSplitMode(!isSplitMode);
              }}
            >
              <Ionicons
                name="cut-outline"
                size={16}
                color={isSplitMode ? '#FFF' : theme.tint}
              />
              <Text style={[styles.splitToggleText, { color: isSplitMode ? '#FFF' : theme.tint }]}>
                {isSplitMode ? 'Modo Dividido Ativo' : 'Dividir Transação'}
              </Text>
            </TouchableOpacity>
          </RNView>

          {!isSplitMode ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {filteredCategories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.chip,
                      { borderColor: theme.border },
                      categoryId === c.id && { backgroundColor: c.color || theme.tint, borderColor: c.color || theme.tint },
                    ]}
                    onPress={() => setCategoryId(c.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: categoryId === c.id ? '#FFF' : theme.text },
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Link href="/category-manager" asChild>
                <TouchableOpacity style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 12, color: theme.tint, fontWeight: '600' }}>
                    + Gerenciar / Criar Categorias
                  </Text>
                </TouchableOpacity>
              </Link>
            </>
          ) : (
            /* Formulário de Múltiplos Splits */
            <RNView style={styles.splitsContainer}>
              <RNView style={styles.splitsSummary}>
                <Text style={styles.splitsSummaryText}>
                  Distribuído: {formatCurrency(currentSplitsTotal)} de {formatCurrency(totalNumeric)}
                </Text>
                <Text
                  style={[
                    styles.splitsRemainingText,
                    { color: Math.abs(remainingSplit) < 0.01 ? theme.income : theme.expense },
                  ]}
                >
                  {Math.abs(remainingSplit) < 0.01
                    ? 'Total 100% distribuído!'
                    : `Restante: ${formatCurrency(remainingSplit)}`}
                </Text>
              </RNView>

              {splits.map((s, idx) => (
                <RNView key={idx} style={[styles.splitCard, { borderColor: theme.border }]}>
                  <RNView style={styles.splitRowHeader}>
                    <Text style={[styles.splitIndex, { color: theme.subtext }]}>Fatia #{idx + 1}</Text>
                    {splits.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveSplitRow(idx)}>
                        <Ionicons name="trash-outline" size={16} color={theme.expense} />
                      </TouchableOpacity>
                    )}
                  </RNView>

                  {/* Seleção de Categoria */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {filteredCategories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.smallChip,
                          { borderColor: theme.border },
                          s.categoryId === c.id && { backgroundColor: c.color, borderColor: c.color },
                        ]}
                        onPress={() => handleUpdateSplit(idx, 'categoryId', c.id)}
                      >
                        <Text
                          style={[
                            styles.smallChipText,
                            { color: s.categoryId === c.id ? '#FFF' : theme.text },
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <RNView style={styles.splitInputsRow}>
                    <TextInput
                      style={[
                        styles.input,
                        { flex: 1, color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      placeholder="Valor (R$)"
                      placeholderTextColor={theme.subtext}
                      keyboardType="decimal-pad"
                      value={s.amount}
                      onChangeText={(val) => handleUpdateSplit(idx, 'amount', val)}
                    />
                    <TextInput
                      style={[
                        styles.input,
                        { flex: 2, color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                      placeholder="Descrição / Item"
                      placeholderTextColor={theme.subtext}
                      value={s.memo}
                      onChangeText={(val) => handleUpdateSplit(idx, 'memo', val)}
                    />
                  </RNView>
                </RNView>
              ))}

              <TouchableOpacity
                style={[styles.addSplitBtn, { borderColor: theme.tint }]}
                onPress={handleAddSplitRow}
              >
                <Ionicons name="add" size={16} color={theme.tint} />
                <Text style={[styles.addSplitText, { color: theme.tint }]}>
                  Adicionar Outra Categoria
                </Text>
              </TouchableOpacity>
            </RNView>
          )}
        </View>
      )}

      {/* 5. Detalhes Clássicos do MS Money */}
      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardHeader, { color: theme.subtext }]}>Data (AAAA-MM-DD)</Text>
        <TextInput
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          ]}
          value={date}
          onChangeText={setDate}
        />

        <Text style={[styles.cardHeader, { color: theme.subtext, marginTop: 14 }]}>
          Status no Extrato
        </Text>
        <RNView style={styles.statusRow}>
          <TouchableOpacity
            style={[
              styles.statusBtn,
              { borderColor: theme.border },
              status === 'UNCLEARED' && { backgroundColor: theme.uncleared + '30', borderColor: theme.uncleared },
            ]}
            onPress={() => setStatus('UNCLEARED')}
          >
            <Text style={[styles.statusBtnText, { color: theme.uncleared }]}>
              Pendente (P)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusBtn,
              { borderColor: theme.border },
              status === 'CLEARED' && { backgroundColor: theme.cleared + '30', borderColor: theme.cleared },
            ]}
            onPress={() => setStatus('CLEARED')}
          >
            <Text style={[styles.statusBtnText, { color: theme.cleared }]}>
              Compensado (C)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusBtn,
              { borderColor: theme.border },
              status === 'RECONCILED' && { backgroundColor: theme.reconciled + '30', borderColor: theme.reconciled },
            ]}
            onPress={() => setStatus('RECONCILED')}
          >
            <Text style={[styles.statusBtnText, { color: theme.reconciled }]}>
              Conciliado (R)
            </Text>
          </TouchableOpacity>
        </RNView>

        <Text style={[styles.cardHeader, { color: theme.subtext, marginTop: 14 }]}>
          Nº do Documento / Cheque (Opcional)
        </Text>
        <TextInput
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
          ]}
          placeholder="Ex: 10423"
          placeholderTextColor={theme.subtext}
          value={checkNumber}
          onChangeText={setCheckNumber}
        />

        <Text style={[styles.cardHeader, { color: theme.subtext, marginTop: 14 }]}>
          Observações / Memorando
        </Text>
        <TextInput
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, height: 65 },
          ]}
          placeholder="Detalhes adicionais..."
          placeholderTextColor={theme.subtext}
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {/* 6. Botão Salvar Lançamento */}
      <TouchableOpacity
        style={[styles.saveButton, { backgroundColor: theme.tint }]}
        onPress={handleSave}
      >
        <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" />
        <Text style={styles.saveButtonText}>Salvar Lançamento</Text>
      </TouchableOpacity>
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
  typeSelector: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    padding: 4,
    gap: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  currencyPrefix: {
    fontSize: 26,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 34,
    fontWeight: '800',
    minWidth: 120,
    textAlign: 'center',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  splitToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  splitToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0D9488',
    gap: 4,
  },
  splitToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  splitsContainer: {
    gap: 10,
  },
  splitsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  splitsSummaryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  splitsRemainingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  splitCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  splitRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitIndex: {
    fontSize: 11,
    fontWeight: '700',
  },
  splitInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 4,
  },
  addSplitText: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
