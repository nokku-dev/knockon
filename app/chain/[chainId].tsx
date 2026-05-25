import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChainEditScreen } from '../../src/ChainEditScreen';
import type { Action } from '../../src/domain';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_SURFACE,
} from '../../src/tokens';
import { useChainEdit } from '../../src/useChainEdit';

export default function EditChainRoute() {
  const { chainId } = useLocalSearchParams<{ chainId: string }>();
  const router = useRouter();
  const {
    draft,
    availableActions,
    error,
    loading,
    saving,
    setTitle,
    setStatus,
    setAnchorKind,
    setAnchorTime,
    setAnchorLocation,
    setAnchorRadius,
    locationPermission,
    locating,
    fetchCurrentLocation,
    addNodeFromExistingAction,
    addNodeFromNewAction,
    addNodesFromTemplate,
    removeNode,
    reorderNodes,
    save,
    deleteChain,
    deleteAction,
    updateAction,
  } = useChainEdit(chainId ?? null);

  const handleSave = async () => {
    const ok = await save();
    if (ok) router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      'チェーンを削除',
      'このチェーンと関連する達成記録もすべて削除されます。元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteChain();
            if (ok) router.back();
          },
        },
      ],
    );
  };

  const handleDeleteAction = (action: Action) => {
    Alert.alert(
      'アクションを削除',
      `「${action.title}」を削除します。他のチェーンで使用中の場合は削除できません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteAction(action.id);
            if (!result.ok) {
              Alert.alert('削除できません', result.error);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : !draft ? (
        <Text style={styles.error}>{error ?? 'チェーンが見つかりません'}</Text>
      ) : (
        <View style={styles.body}>
          <ChainEditScreen
            draft={draft}
            availableActions={availableActions}
            saving={saving}
            locationPermission={locationPermission}
            locating={locating}
            onSetTitle={setTitle}
            onSetStatus={setStatus}
            onSetAnchorKind={setAnchorKind}
            onSetAnchorTime={setAnchorTime}
            onSetAnchorLocation={setAnchorLocation}
            onSetAnchorRadius={setAnchorRadius}
            onFetchLocation={fetchCurrentLocation}
            onAddExistingAction={addNodeFromExistingAction}
            onAddNewAction={addNodeFromNewAction}
            onAddNodesFromTemplate={addNodesFromTemplate}
            onRemoveNode={removeNode}
            onReorderNodes={reorderNodes}
            onCancel={() => router.back()}
            onSave={handleSave}
            onDelete={handleDelete}
            onDeleteAction={handleDeleteAction}
            onSaveAction={updateAction}
          />
          {error && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: COLOR_ACCENT, padding: 24 },
  banner: {
    backgroundColor: COLOR_SURFACE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_ACCENT,
  },
  bannerText: { color: COLOR_ACCENT, fontSize: 12 },
});
