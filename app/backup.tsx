import React, { useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View as RNView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { exportBackup, restoreBackup } from '@/utils/backupService';

export default function BackupScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);

  const handleExport = async () => {
    try {
      setLoadingExport(true);
      const msg = await exportBackup();
      Alert.alert('Backup Concluído', msg);
    } catch (e: any) {
      Alert.alert('Erro ao exportar', e.message || 'Falha ao gerar arquivo de backup.');
    } finally {
      setLoadingExport(false);
    }
  };

  const handleRestore = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      Alert.alert(
        'Atenção: Restaurar Backup',
        'Todos os dados atuais serão substituídos pelos dados do arquivo de backup. Tem certeza que deseja prosseguir?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sim, Restaurar',
            style: 'destructive',
            onPress: async () => {
              try {
                setLoadingRestore(true);
                let textContent = '';
                if (Platform.OS === 'web') {
                  const resp = await fetch(file.uri);
                  textContent = await resp.text();
                } else {
                  const FileSystem = require('expo-file-system/legacy') || require('expo-file-system');
                  textContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
                }

                await restoreBackup(textContent);
                Alert.alert('Sucesso!', 'Dados restaurados com êxito a partir do backup.');
              } catch (err: any) {
                Alert.alert('Erro ao restaurar', err.message || 'Arquivo inválido.');
              } finally {
                setLoadingRestore(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao ler arquivo de backup.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Seção de Exportação */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <RNView style={styles.cardHeader}>
          <RNView style={[styles.iconCircle, { backgroundColor: theme.tint + '20' }]}>
            <Ionicons name="cloud-upload-outline" size={24} color={theme.tint} />
          </RNView>
          <RNView style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Exportar Cópia de Segurança</Text>
            <Text style={[styles.cardDescription, { color: theme.subtext }]}>
              Gera um arquivo com todas as suas contas, lançamentos, orçamentos e categorias para guardar no Google Drive, e-mail ou computador.
            </Text>
          </RNView>
        </RNView>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.tint }]}
          onPress={handleExport}
          disabled={loadingExport}
        >
          {loadingExport ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Gerar e Salvar Backup</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Seção de Restauração */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 16 }]}>
        <RNView style={styles.cardHeader}>
          <RNView style={[styles.iconCircle, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="cloud-download-outline" size={24} color="#D97706" />
          </RNView>
          <RNView style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Restaurar Cópia de Segurança</Text>
            <Text style={[styles.cardDescription, { color: theme.subtext }]}>
              Restaura um backup previamente exportado em formato JSON.
            </Text>
          </RNView>
        </RNView>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
          onPress={handleRestore}
          disabled={loadingRestore}
        >
          {loadingRestore ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={20} color="#FFF" />
              <Text style={styles.actionBtnText}>Selecionar Arquivo de Backup</Text>
            </>
          )}
        </TouchableOpacity>
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
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

