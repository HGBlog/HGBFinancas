import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { CategorySpending, getCategorySpendingReport, getFinancialSummary } from '@/db/transactions';
import { FinancialSummary } from '@/types';
import {
  formatCurrency,
  getCurrentMonthISO,
  getMonthName,
} from '@/utils/formatters';
import { getReportSettings, ReportSettings } from '@/services/settingsService';

export default function ReportsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthISO());
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalBalance: 0,
    totalIncomeMonth: 0,
    totalExpenseMonth: 0,
    monthlyNet: 0,
    unclearedTotal: 0,
  });
  const [categoryData, setCategoryData] = useState<CategorySpending[]>([]);
  const [reportSettings, setReportSettings] = useState<ReportSettings>({
    includeUncleared: true,
    sortBy: 'VALUE',
    savingsTarget: 20,
  });

  const loadData = useCallback(async () => {
    try {
      const [sum, spending, rSettings] = await Promise.all([
        getFinancialSummary(currentMonth),
        getCategorySpendingReport(currentMonth),
        getReportSettings(),
      ]);
      setSummary(sum);
      setCategoryData(spending);
      setReportSettings(rSettings);
    } catch (e) {
      console.error('Erro ao carregar relatórios:', e);
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

  const savingsRate =
    summary.totalIncomeMonth > 0
      ? Math.max(0, Math.round((summary.monthlyNet / summary.totalIncomeMonth) * 100))
      : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Seletor de Mês */}
      <View style={[styles.monthSelector, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>

        <Text style={styles.monthText}>{getMonthName(currentMonth)}</Text>

        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Cartão de Balanço do Mês */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.subtext }]}>Fluxo de Caixa Mensal</Text>

        <RNView style={styles.flowRow}>
          <RNView style={styles.flowItem}>
            <Text style={[styles.flowLabel, { color: theme.subtext }]}>Entradas</Text>
            <Text style={[styles.flowVal, { color: theme.income }]}>
              +{formatCurrency(summary.totalIncomeMonth)}
            </Text>
          </RNView>

          <RNView style={styles.flowItem}>
            <Text style={[styles.flowLabel, { color: theme.subtext }]}>Saídas</Text>
            <Text style={[styles.flowVal, { color: theme.expense }]}>
              -{formatCurrency(summary.totalExpenseMonth)}
            </Text>
          </RNView>
        </RNView>

        {/* Barra de Taxa de Economia */}
        <RNView style={styles.savingsBox}>
          <RNView style={styles.savingsHeader}>
            <Text style={[styles.savingsLabel, { color: theme.subtext }]}>
              Taxa de Poupança / Economia (Meta: {reportSettings.savingsTarget}%)
            </Text>
            <Text
              style={[
                styles.savingsPercent,
                { color: summary.monthlyNet >= 0 ? theme.income : theme.expense },
              ]}
            >
              {savingsRate}%
            </Text>
          </RNView>
          <RNView style={[styles.progressBackground, { backgroundColor: theme.border }]}>
            <RNView
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, Math.max(0, savingsRate))}%`,
                  backgroundColor: summary.monthlyNet >= 0 ? theme.income : theme.expense,
                },
              ]}
            />
          </RNView>
        </RNView>
      </View>

      {/* Relatório de Despesas por Categoria */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 16 }]}>
        <Text style={[styles.cardTitle, { color: theme.subtext, marginBottom: 16 }]}>
          Despesas por Categoria {reportSettings.sortBy === 'NAME' ? '(Ordem Alfabética)' : '(Por Maior Gasto)'}
        </Text>

        {categoryData.length === 0 ? (
          <RNView style={styles.emptyView}>
            <Ionicons name="pie-chart-outline" size={40} color={theme.subtext} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              Nenhuma despesa registrada para este mês.
            </Text>
          </RNView>
        ) : (
          [...categoryData]
            .sort((a, b) =>
              reportSettings.sortBy === 'NAME'
                ? a.categoryName.localeCompare(b.categoryName)
                : b.totalSpent - a.totalSpent
            )
            .map((item, index) => (
            <RNView key={item.categoryId} style={[styles.catRow, index > 0 && { marginTop: 16 }]}>
              <RNView style={styles.catHeader}>
                <RNView style={styles.catLeft}>
                  <RNView
                    style={[
                      styles.catDot,
                      { backgroundColor: item.categoryColor || theme.tint },
                    ]}
                  />
                  <Text style={styles.catName}>{item.categoryName}</Text>
                </RNView>

                <RNView style={styles.catRight}>
                  <Text style={styles.catAmount}>{formatCurrency(item.totalSpent)}</Text>
                  <Text style={[styles.catPercent, { color: theme.subtext }]}>
                    ({item.percentage}%)
                  </Text>
                </RNView>
              </RNView>

              <RNView style={[styles.progressBackground, { backgroundColor: theme.border, marginTop: 8 }]}>
                <RNView
                  style={[
                    styles.progressFill,
                    {
                      width: `${item.percentage}%`,
                      backgroundColor: item.categoryColor || theme.tint,
                    },
                  ]}
                />
              </RNView>
            </RNView>
          ))
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
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  arrowBtn: {
    padding: 6,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  flowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 16,
  },
  flowItem: {
    flex: 1,
  },
  flowLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  flowVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  savingsBox: {
    marginTop: 8,
  },
  savingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  savingsLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  savingsPercent: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  emptyView: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
  },
  catRow: {
    width: '100%',
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
  },
  catRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  catPercent: {
    fontSize: 12,
  },
});

