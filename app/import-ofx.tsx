import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View as RNView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Account, Category } from '@/types';
import { getAccounts } from '@/db/accounts';
import { getCategories } from '@/db/categories';
import { getOrCreatePayee } from '@/db/payees';
import { createTransaction } from '@/db/transactions';
import { parseOFX, OfxTransaction } from '@/utils/ofxParser';
import { formatCurrency, formatDateBR } from '@/utils/formatters';

export default function ImportOfxScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const params = useLocalSearchParams<{ accountId?: string }>();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    params.accountId ? parseInt(params.accountId, 10) : null
  );
  const [transactions, setTransactions] = useState<(OfxTransaction & { selected: boolean; categoryId?: number | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    async function init() {
      const [accs, cats] = await Promise.all([getAccounts(), getCategories('EXPENSE')]);
      setAccounts(accs);
      setCategories(cats);
      if (!selectedAccountId && accs.length > 0) {
        setSelectedAccountId(accs[0].id);
      }
    }
    init();
  }, []);

  const handlePickFile = async () => {
    try {
      setLoading(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        setLoading(false);
        return;
      }

      const file = res.assets[0];
      setFileName(file.name);

      let textContent = '';
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        textContent = await response.text();
      } else {
        const FileSystem = require('expo-file-system/legacy') || require('expo-file-system');
        textContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
      }

      const parsed = parseOFX(textContent);
      if (parsed.length === 0) {
        Alert.alert('Aviso', 'Nenhuma transação encontrada no arquivo OFX.');
      }

      setTransactions(parsed.map((t) => ({ ...t, selected: true })));
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro ao ler arquivo', e.message || 'Falha ao processar arquivo OFX.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    setTransactions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleImport = async () => {
    if (!selectedAccountId) {
      Alert.alert('Selecione uma conta', 'Escolha a conta bancária para importar o extrato.');
      return;
    }

    const selectedTxs = transactions.filter((t) => t.selected);
    if (selectedTxs.length === 0) {
      Alert.alert('Nenhuma transação', 'Marque pelo menos uma transação para importar.');
      return;
    }

    setLoading(true);
    try {
      for (const t of selectedTxs) {
        const payeeId = await getOrCreatePayee(t.memo);
        await createTransaction({
          account_id: selectedAccountId,
          amount: t.amount,
          type: t.type,
          date: t.date,
          status: 'CLEARED', // Extrato bancário importado já é compensado
          payee_id: payeeId,
          check_number: t.checkNumber || null,
          notes: `Importado de ${fileName}`,
        });
      }

      Alert.alert(
        'Sucesso!',
        `${selectedTxs.length} lançamentos foram importados e compensados com sucesso!`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('Erro na importação', e.message || 'Falha ao gravar transações.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Seleção de Conta */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.subtext }]}>
            Importar para qual conta?
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountChip,
                  { borderColor: theme.border },
                  selectedAccountId === acc.id && {
                    backgroundColor: theme.tint,
                    borderColor: theme.tint,
                  },
                ]}
                onPress={() => setSelectedAccountId(acc.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selectedAccountId === acc.id ? '#FFF' : theme.text },
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Botão de Selecionar Arquivo OFX */}
        <TouchableOpacity
          style={[styles.pickBtn, { backgroundColor: theme.tint }]}
          onPress={handlePickFile}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="document-attach-outline" size={24} color="#FFF" />
              <Text style={styles.pickBtnText}>
                {fileName ? `Trocar Arquivo (${fileName})` : 'Selecionar Arquivo de Extrato (.OFX)'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Lista de Transações Pré-visualizadas */}
        {transactions.length > 0 && (
          <View style={[styles.previewSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <RNView style={styles.previewHeader}>
              <Text style={styles.previewTitle}>
                Transações Encontradas ({transactions.filter((t) => t.selected).length}/{transactions.length})
              </Text>
            </RNView>

            {transactions.map((t, idx) => (
              <TouchableOpacity
                key={t.fitid + idx}
                style={[
                  styles.txRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  !t.selected && { opacity: 0.4 },
                ]}
                onPress={() => toggleSelect(idx)}
              >
                <Ionicons
                  name={t.selected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={t.selected ? theme.tint : theme.subtext}
                  style={{ marginRight: 10 }}
                />

                <RNView style={styles.txInfo}>
                  <Text style={styles.txMemo} numberOfLines={1}>
                    {t.memo}
                  </Text>
                  <Text style={[styles.txDate, { color: theme.subtext }]}>
                    {formatDateBR(t.date)}
                    {t.checkNumber ? ` • Doc #${t.checkNumber}` : ''}
                  </Text>
                </RNView>

                <Text
                  style={[
                    styles.txAmount,
                    { color: t.type === 'INCOME' ? theme.income : theme.expense },
                  ]}
                >
                  {t.type === 'INCOME' ? '+' : '-'}
                  {formatCurrency(t.amount)}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.importConfirmBtn, { backgroundColor: theme.tint }]}
              onPress={handleImport}
              disabled={loading}
            >
              <Text style={styles.importConfirmText}>
                Importar {transactions.filter((t) => t.selected).length} Lançamentos Selecionados
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  accountsRow: {
    flexDirection: 'row',
  },
  accountChip: {
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
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 10,
  },
  pickBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  previewSection: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  txInfo: {
    flex: 1,
  },
  txMemo: {
    fontSize: 14,
    fontWeight: '600',
  },
  txDate: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  importConfirmBtn: {
    padding: 16,
    alignItems: 'center',
  },
  importConfirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

