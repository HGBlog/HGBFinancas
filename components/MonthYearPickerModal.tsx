import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View as RNView,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

interface MonthYearPickerModalProps {
  visible: boolean;
  title: string;
  selectedMonth: number; // 1-12
  selectedYear: number;
  minYear?: number;
  minMonth?: number; // 1-12 (se o ano for igual a minYear, meses anteriores a minMonth ficam desabilitados)
  onSelect: (month: number, year: number, formattedLabel: string, isoValue: string) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function MonthYearPickerModal({
  visible,
  title,
  selectedMonth,
  selectedYear,
  minYear,
  minMonth,
  onSelect,
  onClose,
}: MonthYearPickerModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [viewYear, setViewYear] = useState<number>(selectedYear || new Date().getFullYear());

  useEffect(() => {
    if (visible) {
      setViewYear(selectedYear || new Date().getFullYear());
    }
  }, [visible, selectedYear]);

  const canGoPrevYear = minYear === undefined || viewYear > minYear;

  const handlePrevYear = () => {
    if (canGoPrevYear) {
      setViewYear((y) => y - 1);
    }
  };

  const handleNextYear = () => {
    setViewYear((y) => y + 1);
  };

  const isMonthDisabled = (m: number): boolean => {
    if (minYear !== undefined && viewYear < minYear) {
      return true;
    }
    if (minYear !== undefined && viewYear === minYear && minMonth !== undefined) {
      return m < minMonth;
    }
    return false;
  };

  const handleSelectMonth = (m: number) => {
    if (isMonthDisabled(m)) return;
    const mStr = String(m).padStart(2, '0');
    const formatted = `${MONTH_NAMES[m - 1]}/${viewYear}`;
    const iso = `${viewYear}-${mStr}`;
    onSelect(m, viewYear, formatted, iso);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <RNView style={styles.modalOverlay}>
        <RNView style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header */}
          <RNView style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={theme.subtext} />
            </TouchableOpacity>
          </RNView>

          {/* Navegação de Ano */}
          <RNView style={[styles.yearNavRow, { borderColor: theme.border }]}>
            <TouchableOpacity
              onPress={handlePrevYear}
              disabled={!canGoPrevYear}
              style={[styles.navArrowBtn, !canGoPrevYear && { opacity: 0.3 }]}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.yearNavText, { color: theme.text }]}>
              {viewYear}
            </Text>

            <TouchableOpacity onPress={handleNextYear} style={styles.navArrowBtn}>
              <Ionicons name="chevron-forward" size={22} color={theme.text} />
            </TouchableOpacity>
          </RNView>

          {/* Grid de Meses (3 colunas x 4 linhas) */}
          <RNView style={styles.monthsGrid}>
            {MONTH_NAMES.map((name, idx) => {
              const monthNum = idx + 1;
              const disabled = isMonthDisabled(monthNum);
              const isSelected =
                monthNum === selectedMonth && viewYear === selectedYear;

              return (
                <TouchableOpacity
                  key={name}
                  disabled={disabled}
                  style={[
                    styles.monthButton,
                    { borderColor: theme.border, backgroundColor: theme.background },
                    disabled && { opacity: 0.3, backgroundColor: 'transparent' },
                    isSelected && { backgroundColor: theme.tint, borderColor: theme.tint },
                  ]}
                  onPress={() => handleSelectMonth(monthNum)}
                >
                  <Text
                    style={[
                      styles.monthButtonText,
                      { color: isSelected ? '#FFF' : disabled ? theme.subtext : theme.text },
                      isSelected && { fontWeight: '700' },
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RNView>

          {/* Rodapé com botão Fechar */}
          <RNView style={[styles.footerRow, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: theme.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelBtnText, { color: theme.subtext }]}>Cancelar</Text>
            </TouchableOpacity>
          </RNView>
        </RNView>
      </RNView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  navArrowBtn: {
    padding: 6,
    borderRadius: 8,
  },
  yearNavText: {
    fontSize: 17,
    fontWeight: '800',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthButton: {
    width: '31%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

