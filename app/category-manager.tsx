import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  View as RNView,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Category } from '@/types';
import { getCategories, createCategory, deleteCategory } from '@/db/categories';

const AVAILABLE_COLORS = [
  '#3B82F6', '#0284C7', '#0D9488', '#10B981', '#059669',
  '#F59E0B', '#EA580C', '#EF4444', '#DC2626', '#8B5CF6',
  '#6366F1', '#EC4899', '#64748B', '#334155',
];

const AVAILABLE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'folder', 'cart', 'restaurant', 'fast-food', 'cafe',
  'home', 'flash', 'water', 'wifi', 'car',
  'speedometer', 'construct', 'bus', 'medkit', 'pulse',
  'airplane', 'school', 'shirt', 'receipt', 'gift',
  'fitness', 'game-controller', 'cash', 'trending-up',
];

export default function CategoryManagerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [activeTab, setActiveTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>('folder');

  const loadData = useCallback(async () => {
    try {
      const list = await getCategories(activeTab);
      setCategories(list);
    } catch (e) {
      console.error('Erro ao carregar categorias:', e);
    }
  }, [activeTab]);

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

  const handleCreate = async () => {
    if (!name.trim()) return;

    await createCategory({
      name: name.trim(),
      parent_id: parentId,
      type: activeTab,
      color: selectedColor,
      icon: selectedIcon,
    });

    setName('');
    setParentId(null);
    setModalVisible(false);
    await loadData();
  };

  const handleDelete = (cat: Category) => {
    Alert.alert(
      'Excluir Categoria',
      `Tem certeza que deseja excluir "${cat.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(cat.id);
            await loadData();
          },
        },
      ]
    );
  };

  // Agrupar categorias principais e subcategorias
  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (pId: number) => categories.filter((c) => c.parent_id === pId);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Abas Despesas vs Receitas */}
      <RNView style={[styles.tabBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'EXPENSE' && { borderBottomColor: theme.expense, borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('EXPENSE')}
        >
          <Text
            style={[
              styles.tabTitle,
              { color: activeTab === 'EXPENSE' ? theme.expense : theme.subtext },
            ]}
          >
            Categorias de Despesa
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'INCOME' && { borderBottomColor: theme.income, borderBottomWidth: 3 },
          ]}
          onPress={() => setActiveTab('INCOME')}
        >
          <Text
            style={[
              styles.tabTitle,
              { color: activeTab === 'INCOME' ? theme.income : theme.subtext },
            ]}
          >
            Categorias de Receita
          </Text>
        </TouchableOpacity>
      </RNView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <RNView style={styles.headerRow}>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {categories.length} categorias e subcategorias
          </Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.tint }]}
            onPress={() => {
              setName('');
              setParentId(null);
              setModalVisible(true);
            }}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>Nova Categoria</Text>
          </TouchableOpacity>
        </RNView>

        <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {parentCategories.map((parent, pIndex) => {
            const subs = getSubcategories(parent.id);
            return (
              <RNView
                key={parent.id}
                style={[
                  styles.catGroup,
                  pIndex > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}
              >
                {/* Categoria Pai */}
                <RNView style={styles.parentRow}>
                  <RNView style={[styles.iconCircle, { backgroundColor: parent.color + '20' }]}>
                    <Ionicons name={(parent.icon as any) || 'folder'} size={18} color={parent.color} />
                  </RNView>

                  <RNView style={styles.catInfo}>
                    <Text style={styles.parentName}>{parent.name}</Text>
                    {subs.length > 0 && (
                      <Text style={[styles.subCount, { color: theme.subtext }]}>
                        {subs.length} subcategorias
                      </Text>
                    )}
                  </RNView>

                  <RNView style={styles.actionBtns}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => {
                        setParentId(parent.id);
                        setName('');
                        setSelectedColor(parent.color);
                        setModalVisible(true);
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={theme.tint} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(parent)}>
                      <Ionicons name="trash-outline" size={18} color={theme.subtext} />
                    </TouchableOpacity>
                  </RNView>
                </RNView>

                {/* Subcategorias */}
                {subs.map((sub) => (
                  <RNView key={sub.id} style={styles.subRow}>
                    <RNView style={styles.subTreeLine}>
                      <Ionicons name="return-down-forward" size={16} color={theme.subtext} />
                    </RNView>

                    <RNView style={[styles.subIcon, { backgroundColor: sub.color + '20' }]}>
                      <Ionicons name={(sub.icon as any) || 'folder'} size={14} color={sub.color} />
                    </RNView>

                    <Text style={styles.subName}>{sub.name}</Text>

                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(sub)}>
                      <Ionicons name="trash-outline" size={16} color={theme.subtext} />
                    </TouchableOpacity>
                  </RNView>
                ))}
              </RNView>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal Criar Categoria / Subcategoria */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <RNView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={styles.modalTitle}>
              {parentId ? 'Nova Subcategoria' : 'Nova Categoria'}
            </Text>

            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Nome</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Ex: Farmácia, Aluguel, Salário..."
              placeholderTextColor={theme.subtext}
              value={name}
              onChangeText={setName}
            />

            {!parentId && (
              <>
                <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 14 }]}>
                  Cor
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorsScroll}>
                  {AVAILABLE_COLORS.map((col) => (
                    <TouchableOpacity
                      key={col}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: col },
                        selectedColor === col && styles.colorSelected,
                      ]}
                      onPress={() => setSelectedColor(col)}
                    />
                  ))}
                </ScrollView>

                <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 14 }]}>
                  Ícone
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconsScroll}>
                  {AVAILABLE_ICONS.map((ic) => (
                    <TouchableOpacity
                      key={ic}
                      style={[
                        styles.iconOption,
                        { borderColor: theme.border },
                        selectedIcon === ic && { borderColor: theme.tint, backgroundColor: theme.tint + '20' },
                      ]}
                      onPress={() => setSelectedIcon(ic)}
                    >
                      <Ionicons
                        name={ic}
                        size={20}
                        color={selectedIcon === ic ? theme.tint : theme.text}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <RNView style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.tint }]}
                onPress={handleCreate}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Salvar</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
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
  catGroup: {
    paddingVertical: 4,
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  catInfo: {
    flex: 1,
  },
  parentName: {
    fontSize: 15,
    fontWeight: '700',
  },
  subCount: {
    fontSize: 11,
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingLeft: 36,
  },
  subTreeLine: {
    marginRight: 8,
  },
  subIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  subName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
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
  colorsScroll: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
  },
  iconsScroll: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  iconOption: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
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
});

