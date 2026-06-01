import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChainEditScreen } from '../../src/ChainEditScreen';
import {
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_FG,
  COLOR_SURFACE,
} from '../../src/tokens';
import { useChainEdit } from '../../src/useChainEdit';

export default function NewChainRoute() {
  const router = useRouter();
  const {
    draft,
    availableActions,
    modules,
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
    toggleNodeActive,
    reorderNodes,
    save,
    updateAction,
  } = useChainEdit(null);

  const handleSave = async () => {
    const ok = await save();
    if (ok) router.back();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLOR_FG} />
        </View>
      ) : !draft ? (
        <Text style={styles.error}>{error ?? '初期化失敗'}</Text>
      ) : (
        <View style={styles.body}>
          <ChainEditScreen
            draft={draft}
            availableActions={availableActions}
            modules={modules}
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
            onToggleNodeActive={toggleNodeActive}
            onReorderNodes={reorderNodes}
            onCancel={() => router.back()}
            onSave={handleSave}
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
