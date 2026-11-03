import React, { useState, useEffect, useMemo } from 'react';
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

interface CalendarPickerModalProps {
  visible: boolean;
  initialDateBR?: string; // DD-MM-AAAA ou DD/MM/AAAA
  onSelect: (dateBR: string) => void;
  onClose: () => void;
  title?: string;
  minDate?: Date;
  maxDate?: Date;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarPickerModal({
  visible,
  initialDateBR,
  onSelect,
  onClose,
  title = 'Selecionar Data',
  minDate,
  maxDate,
}: CalendarPickerModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  // Parse inicial da data DD-MM-AAAA ou DD/MM/AAAA
  const parseBRDate = (val?: string): { day: number; month: number; year: number } => {
    if (val) {
      const parts = val.replace(/\//g, '-').split('-');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
          return { day: d, month: m, year: y };
        }
      }
    }
    const today = new Date();
    return {
      day: today.getDate(),
      month: today.getMonth() + 1,
      year: today.getFullYear(),
    };
  };

  const parsed = useMemo(() => parseBRDate(initialDateBR), [initialDateBR]);

  const [currentYear, setCurrentYear] = useState<number>(parsed.year);
  const [currentMonth, setCurrentMonth] = useState<number>(parsed.month); // 1-12
  const [selectedDay, setSelectedDay] = useState<number>(parsed.day);

  useEffect(() => {
    if (visible) {
      const p = parseBRDate(initialDateBR);
      setCurrentYear(p.year);
      setCurrentMonth(p.month);
      setSelectedDay(p.day);
    }
  }, [visible, initialDateBR]);

  // Dias no mês selecionado
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  // Primeiro dia da semana (0 = Domingo)
  const firstDayOfWeek = useMemo(() => {
    return new Date(currentYear, currentMonth - 1, 1).getDay();
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(currentMonth).padStart(2, '0');
    const result = `${dayStr}-${monthStr}-${currentYear}`;
    onSelect(result);
    onClose();
  };

  const handleSetToday = () => {
    const today = new Date();
    const d = today.getDate();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDay(d);
    const result = `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
    onSelect(result);
    onClose();
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() + 1 &&
    currentYear === today.getFullYear();

  const isSelected = (day: number) =>
    day === selectedDay &&
    currentMonth === parsed.month &&
    currentYear === parsed.year;

  // Grade de dias (células vazias + dias do mês)
  const daysArray = useMemo(() => {
    const list: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      list.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(d);
    }
    return list;
  }, [firstDayOfWeek, daysInMonth]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <RNView style={styles.modalOverlay}>
        <RNView style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Cabeçalho */}
          <RNView style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={theme.subtext} />
            </TouchableOpacity>
          </RNView>

          {/* Navegação de Mês e Ano */}
          <RNView style={[styles.monthNavRow, { borderColor: theme.border }]}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn}>
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.monthNavText, { color: theme.text }]}>
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </Text>

            <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn}>
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </TouchableOpacity>
          </RNView>

          {/* Dias da Semana */}
          <RNView style={styles.weekDaysRow}>
            {WEEK_DAYS.map((wd, idx) => (
              <Text
                key={wd}
                style={[
                  styles.weekDayText,
                  { color: idx === 0 || idx === 6 ? theme.subtext : theme.text },
                ]}
              >
                {wd}
              </Text>
            ))}
          </RNView>

          {/* Grid de Dias */}
          <RNView style={styles.daysGrid}>
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <RNView key={`empty-${idx}`} style={styles.dayCell} />;
              }

              const selected = isSelected(day);
              const todayFlag = isToday(day);

              return (
                <TouchableOpacity
                  key={`day-${day}`}
                  style={[
                    styles.dayCell,
                    todayFlag && { borderWidth: 1, borderColor: theme.tint },
                    selected && { backgroundColor: theme.tint, borderRadius: 20 },
                  ]}
                  onPress={() => handleSelectDay(day)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: selected ? '#FFF' : theme.text },
                      todayFlag && !selected && { color: theme.tint, fontWeight: '700' },
                      selected && { fontWeight: '700' },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </RNView>

          {/* Ações inferiores */}
          <RNView style={[styles.footerRow, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.todayBtn, { borderColor: theme.border }]}
              onPress={handleSetToday}
            >
              <Ionicons name="today-outline" size={16} color={theme.tint} />
              <Text style={[styles.todayBtnText, { color: theme.tint }]}>Hoje</Text>
            </TouchableOpacity>

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
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  navArrowBtn: {
    padding: 6,
    borderRadius: 8,
  },
  monthNavText: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 14,
  },
  dayCell: {
    width: '14.28%',
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 19,
  },
  dayText: {
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
