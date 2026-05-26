import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChainCard } from './ChainCard';
import { ChainDetail } from './ChainDetail';
import { TimerScreen } from './TimerScreen';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';
import type { TodayChainData } from './useTodayData';

// PR-X (ADR-0021): Today はチェーンカード一覧 (折りたたみ) + Bottom Sheet (個別展開)。
// 旧 TodayScreen の中身 (スパイン / ノードリスト) は ChainDetail.tsx に移動。
export type TodayScreenProps = {
  chains: readonly TodayChainData[];
  onToggleNode: (chainId: string, nodeId: string) => void;
  // PR-1.5b-3: 通知タップから遷移してきたとき、 自動で開きたい chainId。
  // 変化のたびに対応するチェーンの Bottom Sheet を expand する。
  initialOpenChainId?: string | null;
  // PR-AA: 「編集」ボタンタップ → チェーン編集画面へ遷移。
  // 親 (app/(tabs)/index.tsx) で router.push('/chain/[chainId]') を呼ぶ。
  // Sheet を閉じてから push したいので、 onEditChain 経由で親に責務委譲。
  onEditChain?: (chainId: string) => void;
  // PR-BB (ADR-0025): タイマー完了で「必ず達成」(force set)。 onToggleNode の
  // bool 反転 semantics と区別 (K-027 同型のミスマッチ防止)。
  onMarkNodeAchieved?: (chainId: string, nodeId: string, achieved: boolean) => void;
};

export const TodayScreen = ({
  chains,
  onToggleNode,
  initialOpenChainId = null,
  onEditChain,
  onMarkNodeAchieved,
}: TodayScreenProps) => {
  const [openChainId, setOpenChainId] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  // PR-BB (ADR-0025): タイマー Modal の状態。 起動中の chainId / nodeId / 設定時間を保持。
  const [timerState, setTimerState] = useState<{
    chainId: string;
    nodeId: string;
    durationSeconds: number;
    actionTitle: string;
  } | null>(null);

  // initialOpenChainId が変化したら該当チェーンの sheet を開く。
  // 通知タップ → URL param 経由で発火する経路 (PR-1.5b-3)。
  //
  // consume パターン (useRef): 同じ chainId は 1 回だけ open する。
  // タブ切替 → Today 再 focus で initialOpenChainId が再評価される際に毎回
  // open しないよう、 「最後に処理した chainId」を ref で覚えておく
  // (PR-1.5b-3 実機検証 2 回目で観測した「Today に戻るたびに Sheet が開く」対応)。
  //
  // sheetRef.current?.snapToIndex(0) は mount 完了を待つために rAF 経由で呼ぶ。
  const lastProcessedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialOpenChainId) return;
    if (lastProcessedRef.current === initialOpenChainId) return;
    const exists = chains.find((c) => c.chain.id === initialOpenChainId);
    if (!exists) return;
    lastProcessedRef.current = initialOpenChainId;
    setOpenChainId(initialOpenChainId);
    const raf = requestAnimationFrame(() => {
      sheetRef.current?.snapToIndex(0);
    });
    return () => cancelAnimationFrame(raf);
  }, [initialOpenChainId, chains]);

  const openChain = useMemo(
    () => chains.find((c) => c.chain.id === openChainId) ?? null,
    [chains, openChainId],
  );

  const handleOpen = useCallback((chainId: string) => {
    setOpenChainId(chainId);
    sheetRef.current?.snapToIndex(0);
  }, []);

  const handleClose = useCallback((idx: number) => {
    if (idx === -1) setOpenChainId(null);
  }, []);

  const snapPoints = useMemo(() => ['85%'], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Today</Text>
        {chains.length === 0 ? (
          <Text style={styles.empty}>
            アクティブなチェーンがありません。 {'\n'}
            チェーンタブから新規作成してください。
          </Text>
        ) : (
          chains.map((c) => {
            const fireNodes = c.nodes.filter((n) => n.kind === 'fire');
            const fireCompleted = fireNodes.filter(
              (n) => c.achievements[n.node.id] === true,
            ).length;
            return (
              <ChainCard
                key={c.chain.id}
                chain={c.chain}
                anchor={c.anchor}
                fireTotal={fireNodes.length}
                fireCompleted={fireCompleted}
                anchorFiredToday={c.anchorFiredToday}
                onPress={() => handleOpen(c.chain.id)}
              />
            );
          })
        )}
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={handleClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {openChain && (
            <>
              {onEditChain && (
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderSpacer} />
                  <Pressable
                    onPress={() => {
                      const id = openChain.chain.id;
                      // Sheet を閉じてから push (アニメ衝突回避、 K-013 同型の race 防止)
                      sheetRef.current?.close();
                      onEditChain(id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="このチェーンを編集"
                    style={styles.editBtn}
                  >
                    <Text style={styles.editBtnText}>編集</Text>
                  </Pressable>
                </View>
              )}
              <ChainDetail
                chain={openChain.chain}
                anchor={openChain.anchor}
                nodes={openChain.nodes}
                achievements={openChain.achievements}
                anchorFiredToday={openChain.anchorFiredToday}
                nodeIdsEstablished={openChain.nodeIdsEstablished}
                onToggleNode={(nodeId) => onToggleNode(openChain.chain.id, nodeId)}
                onStartTimer={(nodeId, durationSeconds, actionTitle) => {
                  setTimerState({
                    chainId: openChain.chain.id,
                    nodeId,
                    durationSeconds,
                    actionTitle,
                  });
                }}
              />
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* PR-BB (ADR-0025): タイマー Modal。 timerState=null なら非表示。
          完了で onToggleNode (= 自動達成、 ADR-0025 案 X) + Modal 閉じる。
          キャンセル時は達成記録なしで閉じる。 */}
      <TimerScreen
        visible={timerState != null}
        durationSeconds={timerState?.durationSeconds ?? 0}
        actionTitle={timerState?.actionTitle ?? ''}
        onCancel={() => setTimerState(null)}
        onComplete={() => {
          // 「force set true」で達成記録。 onToggleNode (反転) ではなく
          // onMarkNodeAchieved を使うのは K-027 同型 (既達成 → 未達成に戻るバグ防止)。
          if (timerState && onMarkNodeAchieved) {
            onMarkNodeAchieved(timerState.chainId, timerState.nodeId, true);
          }
          setTimerState(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  scroll: { padding: 24 },
  heading: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  empty: {
    color: COLOR_FG_FAINT,
    fontSize: 14,
    lineHeight: 22,
  },
  sheetBg: { backgroundColor: COLOR_SURFACE },
  sheetHandle: { backgroundColor: COLOR_LINE_BG, width: 40 },
  sheetContent: { paddingBottom: 32 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  sheetHeaderSpacer: { flex: 1 },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  editBtnText: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
  },
});
