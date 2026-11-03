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
import { useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Category } from '@/types';
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/db/categories';

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
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
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

  const handleOpenCreate = (pId: number | null = null) => {
    setEditingCategory(null);
    setName('');
    setParentId(pId);
    if (pId) {
      const parentGroup = categories.find((c) => c.id === pId);
      setSelectedColor(parentGroup?.color || AVAILABLE_COLORS[0]);
    } else {
      setSelectedColor(AVAILABLE_COLORS[0]);
    }
    setSelectedIcon('folder');
    setModalVisible(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setParentId(cat.parent_id || null);
    if (cat.parent_id) {
      const parentGroup = categories.find((c) => c.id === cat.parent_id);
      setSelectedColor(parentGroup?.color || cat.color || AVAILABLE_COLORS[0]);
    } else {
      setSelectedColor(cat.color || AVAILABLE_COLORS[0]);
    }
    setSelectedIcon((cat.icon as any) || 'folder');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o nome da categoria.');
      return;
    }

    // Validação contra grupos duplicados (Não pode haver grupos duplicados)
    if (!parentId) {
      const isDuplicate = parentCategories.some((p) => {
        if (editingCategory && p.id === editingCategory.id) return false;
        return p.name.trim().toLowerCase() === trimmedName.toLowerCase();
      });

      if (isDuplicate) {
        Alert.alert(
          'Grupo duplicado',
          `Já existe um grupo principal cadastrado com o nome "${trimmedName}". Não é permitido cadastrar grupos duplicados.`
        );
        return;
      }
    }

    try {
      const parentGroup = parentId ? categories.find((c) => c.id === parentId) : null;
      // Cor do subgrupo obrigatoriamente segue a cor do grupo
      const finalColor = parentGroup ? parentGroup.color : selectedColor;

      if (editingCategory) {
        // Alterar categoria ou subcategoria existente (inclui ícone)
        await updateCategory(editingCategory.id, {
          name: trimmedName,
          color: finalColor,
          icon: selectedIcon,
        });
        Alert.alert('Sucesso', 'Alteração salva com sucesso!');
      } else {
        // Cadastrar nova categoria ou subcategoria (inclui ícone)
        await createCategory({
          name: trimmedName,
          parent_id: parentId,
          type: activeTab,
          color: finalColor,
          icon: selectedIcon,
        });
        Alert.alert('Sucesso', 'Cadastro realizado com sucesso!');
      }

      setModalVisible(false);
      setEditingCategory(null);
      setName('');
      await loadData();
    } catch (e) {
      console.error('Erro ao salvar categoria:', e);
      Alert.alert('Erro', 'Não foi possível salvar a categoria.');
    }
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

  // Agrupar categorias principais evitando duplicações visuais
  const rawParentCategories = categories.filter((c) => !c.parent_id);
  const seenParentNames = new Set<string>();
  const parentCategories: Category[] = [];
  const duplicateParentIdsMap = new Map<number, number>();

  for (const p of rawParentCategories) {
    const key = p.name.trim().toLowerCase();
    if (!seenParentNames.has(key)) {
      seenParentNames.add(key);
      parentCategories.push(p);
    } else {
      const primary = parentCategories.find((x) => x.name.trim().toLowerCase() === key);
      if (primary) {
        duplicateParentIdsMap.set(p.id, primary.id);
      }
    }
  }

  const getSubcategories = (pId: number) => {
    return categories.filter(
      (c) => c.parent_id === pId || (c.parent_id && duplicateParentIdsMap.get(c.parent_id) === pId)
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Categorias de Favorecido' }} />

      {/* Abas Despesas (Favorecido) vs Receitas */}
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
            Favorecidos / Despesas
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
            Receitas
          </Text>
        </TouchableOpacity>
      </RNView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <RNView style={styles.headerRow}>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {categories.length} categorias cadastradas
          </Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.tint }]}
            onPress={() => handleOpenCreate(null)}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>Nova Categoria</Text>
          </TouchableOpacity>
        </RNView>

        <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {parentCategories.length === 0 ? (
            <RNView style={{ padding: 30, alignItems: 'center' }}>
              <Ionicons name="folder-open-outline" size={36} color={theme.subtext} />
              <Text style={{ marginTop: 8, color: theme.subtext, fontSize: 13 }}>
                Nenhuma categoria cadastrada.
              </Text>
            </RNView>
          ) : (
            parentCategories.map((parent, pIndex) => {
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
                      {/* Botão Adicionar Subcategoria */}
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleOpenCreate(parent.id)}
                        accessibilityLabel="Adicionar subcategoria"
                      >
                        <Ionicons name="add-circle-outline" size={20} color={theme.tint} />
                      </TouchableOpacity>

                      {/* Botão Editar Categoria */}
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleOpenEdit(parent)}
                        accessibilityLabel="Editar categoria"
                      >
                        <Ionicons name="pencil" size={17} color={theme.tint} />
                      </TouchableOpacity>

                      {/* Botão Excluir */}
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleDelete(parent)}
                        accessibilityLabel="Excluir categoria"
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.expense} />
                      </TouchableOpacity>
                    </RNView>
                  </RNView>

                  {/* Subcategorias */}
                  {subs.map((sub) => (
                    <RNView key={sub.id} style={styles.subRow}>
                      <RNView style={styles.subTreeLine}>
                        <Ionicons name="return-down-forward" size={16} color={theme.subtext} />
                      </RNView>

                      {/* Ícone do subgrupo segue o mesmo padrão de cor do grupo */}
                      <RNView style={[styles.subIcon, { backgroundColor: parent.color + '20' }]}>
                        <Ionicons name={(sub.icon as any) || 'folder'} size={14} color={parent.color} />
                      </RNView>

                      <Text style={styles.subName}>{sub.name}</Text>

                      <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleOpenEdit(sub)}
                          accessibilityLabel="Editar subcategoria"
                        >
                          <Ionicons name="pencil" size={15} color={theme.tint} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDelete(sub)}
                          accessibilityLabel="Excluir subcategoria"
                        >
                          <Ionicons name="trash-outline" size={16} color={theme.expense} />
                        </TouchableOpacity>
                      </RNView>
                    </RNView>
                  ))}
                </RNView>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Modal Criar / Alterar Categoria */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <RNView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={styles.modalTitle}>
              {editingCategory
                ? 'Alterar Categoria'
                : parentId
                ? 'Nova Subcategoria'
                : 'Nova Categoria'}
            </Text>

            <Text style={[styles.inputLabel, { color: theme.subtext }]}>Nome da Categoria</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              placeholder="Ex: Veículo, Alimentos, Impostos, Farmácia..."
              placeholderTextColor={theme.subtext}
              value={name}
              onChangeText={setName}
            />

            {!parentId ? (
              <>
                <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 14 }]}>
                  Cor do Grupo
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
              </>
            ) : (
              <RNView
                style={[
                  styles.colorInheritNotice,
                  { backgroundColor: selectedColor + '18', borderColor: selectedColor + '40' },
                ]}
              >
                <RNView style={[styles.colorPreviewDot, { backgroundColor: selectedColor }]} />
                <Text style={[styles.colorInheritText, { color: theme.text }]}>
                  Cor herdada do grupo:{' '}
                  <Text style={{ fontWeight: '700', color: selectedColor }}>
                    {categories.find((c) => c.id === parentId)?.name || 'Grupo'}
                  </Text>
                </Text>
              </RNView>
            )}

            {/* Cadastro e alteração de ícone disponível para GRUPO e SUBGRUPO */}
            <Text style={[styles.inputLabel, { color: theme.subtext, marginTop: 14 }]}>
              Ícone {parentId ? 'do Subgrupo' : 'do Grupo'}
            </Text>
            <RNView style={styles.iconsGrid}>
              {AVAILABLE_ICONS.slice(0, 16).map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[
                    styles.iconBox,
                    { borderColor: theme.border },
                    selectedIcon === ic && {
                      backgroundColor: selectedColor,
                      borderColor: selectedColor,
                    },
                  ]}
                  onPress={() => setSelectedIcon(ic)}
                >
                  <Ionicons
                    name={ic}
                    size={20}
                    color={selectedIcon === ic ? '#FFF' : selectedColor}
                  />
                </TouchableOpacity>
              ))}
            </RNView>

            <RNView style={styles.modalBtnsRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: theme.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.modalBtnTextCancel, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtnSave, { backgroundColor: theme.tint }]}
                onPress={handleSave}
              >
                <Text style={styles.modalBtnTextSave}>
                  {editingCategory ? 'Salvar Alteração' : 'Criar Categoria'}
                </Text>
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
    fontSize: 14,
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
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  catGroup: {
    padding: 12,
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 6,
  },
  iconBtn: {
    padding: 6,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 24,
    marginTop: 4,
  },
  subTreeLine: {
    marginRight: 8,
  },
  subIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  subName: {
    flex: 1,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  colorsScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  colorCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 3,
  },
  iconsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  colorInheritNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 6,
    gap: 8,
  },
  colorPreviewDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  colorInheritText: {
    fontSize: 13,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
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
