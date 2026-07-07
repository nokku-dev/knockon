import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChainCard } from './ChainCard';
import { ChainDetail } from './ChainDetail';
import { NoteComposeModal } from './NoteComposeModal';
import type { NoteChainOption } from './useNotesData';
import { InAppNotificationToast } from './InAppNotificationToast';
import { OnboardingChecklistCard } from './OnboardingChecklistCard';
import {
  computeOnboardingChecklist,
  shouldShowOnboardingChecklist,
} from './onboardingChecklist';
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
  // ADR-0050 (2026-07-07): アプリ全体の定着ノード数。 見出し右に「定着 N 個」を出す
  // (旧「累計 N 個達成」を置換・ユーザー判断)。
  settledCount?: number;
  // #142 / #165: 立ち上げチェックリストのマイルストーン (first/ten-achievement) 用の実タップ
  // 通算 (今日より前)。 見出しには出さない。 今日の実達成は chains から合算して足す。
  achievedBeforeToday?: number;
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
  // #165 (ADR-0042 P1): 立ち上げチェックリスト用。onboarding 完了済みか、dismiss 時刻
  // (null = 未 dismiss)、閉じるハンドラ。マイルストーンの達成度は chains / achievedBeforeToday
  // からライブ算出する (= 楽観更新で即反映)。onDismissChecklist 未指定ならチェックリストは
  // 出さない (= 親が dismiss 動線を持つときのみ、 onEditChain と同型)。
  onboardingCompleted?: boolean;
  checklistDismissedAt?: string | null;
  checklistAddedAction?: boolean;
  onDismissChecklist?: () => void;
  // ADR-0044 (#181): Today アクション長押し → 手動メモ作成。 親 (index.tsx) が永続化を担う。
  // 未指定 → 長押しメモ動線は無効 (= ChainDetail の onNoteLongPress も渡さない)。
  onAddNote?: (nodeId: string | null, content: string) => void | Promise<void>;
  // ADR-0047: 定着ノードの長押しメニューから「定着を取り下げる」。 親 (index.tsx) が
  // retractSettlement を渡す。 未指定 → 取り下げ導線は無効 (定着ノードの長押しは従来どおり
  // 直接メモ作成)。
  onRetractSettlement?: (chainId: string, nodeId: string) => void;
};

export const TodayScreen = ({
  chains,
  settledCount = 0,
  achievedBeforeToday = 0,
  onToggleNode,
  initialOpenChainId = null,
  onEditChain,
  onMarkNodeAchieved,
  onboardingCompleted = false,
  checklistDismissedAt = null,
  checklistAddedAction = false,
  onDismissChecklist,
  onAddNote,
  onRetractSettlement,
}: TodayScreenProps) => {
  const [openChainId, setOpenChainId] = useState<string | null>(null);
  // ADR-0044 (#181): アクション長押しで開くメモ作成 Modal。 対象ノードを保持。
  const [noteTargetNodeId, setNoteTargetNodeId] = useState<string | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  // メモ作成 Modal のセレクタ候補。 Today に並ぶ active チェーンから派生 (skip ノードは除く)。
  // 長押し起点は対象が選択済みで開くが、 Modal 内で対象変更も可能なので候補を渡す。
  const noteChainOptions = useMemo<NoteChainOption[]>(
    () =>
      chains.map((c) => ({
        chainId: c.chain.id,
        chainTitle: c.chain.title,
        nodes: c.nodes
          .filter((n) => n.kind !== 'skip')
          .map((n) => ({ nodeId: n.node.id, actionTitle: n.label })),
      })),
    [chains],
  );
  const sheetRef = useRef<BottomSheet>(null);
  // PR-BB (ADR-0025): タイマー Modal の状態。 起動中の chainId / nodeId / 設定時間を保持。
  const [timerState, setTimerState] = useState<{
    chainId: string;
    nodeId: string;
    durationSeconds: number;
    actionTitle: string;
  } | null>(null);
  // Issue #102: タイマー自動完了時にユーザーへ feedback トーストを出す。
  // 旧挙動 = Modal が無音で閉じるだけで、 特に background → foreground 復帰時に
  // 「完了したのか、 キャンセルされたのか、 何が起きたのか」が判別できなかった。
  // 完了時は actionTitle を含めたトーストを表示し、 cancel 時は表示しない
  // (= ユーザー起点の操作は意図が明示的なので feedback 不要)。
  const [timerCompletionToast, setTimerCompletionToast] = useState<{
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

  // #165 立ち上げチェックリストのマイルストーン用の実タップ通算 (first/ten-achievement)。
  // ADR-0050 で見出しは「定着 N 個」に置換したため、 累計 (実タップ通算) は見出しに出さず
  // チェックリスト判定にのみ使う。 今日の実達成 (全 active チェーン合算・休む日除外) + base。
  const todayAchievedCount = useMemo(
    () =>
      chains.reduce(
        (acc, c) =>
          acc +
          c.nodes.filter(
            (n) => n.kind !== 'skip' && (c.achievements[n.node.id] ?? false),
          ).length,
        0,
      ),
    [chains],
  );
  const cumulativeTotal = achievedBeforeToday + todayAchievedCount;

  // #165 (ADR-0042 P1): 立ち上げチェックリストのライブ算出。
  //   - activeChainCount = 表示中の active チェーン本数
  //   - totalAchievedCount = アプリ全体の通算達成数 (= 累計表示と同じ cumulativeTotal)
  //   - addedAction = 「アクションを 1 つ追加した」フラグ (app_settings 由来、props)
  // チェーン数・通算達成は chains からライブ計算するので、 ノード達成タップで即座に
  // マイルストーンが ✓ になる (snapshot を loadToday に固定しない理由)。addedAction は
  // 編集保存時に永続化され、 Today への focus 復帰で再 load される。
  const checklistInput = useMemo(
    () => ({
      onboardingCompleted,
      activeChainCount: chains.length,
      totalAchievedCount: cumulativeTotal,
      addedAction: checklistAddedAction,
    }),
    [onboardingCompleted, chains.length, cumulativeTotal, checklistAddedAction],
  );
  const checklistVisible =
    onDismissChecklist != null &&
    shouldShowOnboardingChecklist(checklistInput, checklistDismissedAt != null);
  const checklistItems = useMemo(
    () => computeOnboardingChecklist(checklistInput),
    [checklistInput],
  );

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
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Today</Text>
          {/* ADR-0050 (2026-07-07): 見出し右横にアプリ全体の定着ノード数「定着 N 個」を出す
              (旧「累計 N 個達成」を置換・ユーザー判断)。 定着数は latch で単調増加 (+)、
              「定着に変わっていく様」を主役にする。 settledCount=0 は非表示 (最初の定着から
              現れる)。 控えめなトーンで前進感を出す (Celebrate 主 / DESIGN-SYSTEM §0)。 */}
          {settledCount > 0 && (
            <Text
              testID="today-settled-count"
              style={styles.cumulativeTotal}
              accessibilityLabel={`定着 ${settledCount} 個`}
            >
              定着 {settledCount.toLocaleString()} 個
            </Text>
          )}
        </View>
        {/* #165 (ADR-0042 P1): 立ち上げチェックリスト。onboarding 完了直後の Today 最上部
            (チェーンリストより上) に 5 マイルストーン。全達成 or dismiss で非表示
            (shouldShowOnboardingChecklist が判定)。失われない指標のみで構成し Celebrate 主
            と整合 (ADR-0036 +/- 判定基準)。親が onDismissChecklist を渡したときだけ出す。 */}
        {checklistVisible && onDismissChecklist && (
          <OnboardingChecklistCard
            items={checklistItems}
            onDismiss={onDismissChecklist}
          />
        )}
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
                nodeIdsSettled={openChain.nodeIdsSettled}
                onToggleNode={(nodeId) => onToggleNode(openChain.chain.id, nodeId)}
                onNoteLongPress={
                  onAddNote
                    ? (nodeId) => {
                        setNoteTargetNodeId(nodeId);
                        setNoteModalOpen(true);
                      }
                    : undefined
                }
                onRetractSettlement={
                  onRetractSettlement
                    ? (nodeId) =>
                        onRetractSettlement(openChain.chain.id, nodeId)
                    : undefined
                }
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
          Issue #116: 完了 (満了 or 早期完了) でも Modal は閉じず、 TimerScreen 内部で
          「完了表示」に遷移する。 onComplete = 達成記録 (force set true) + トースト state
          のみで setTimerState(null) は呼ばない。 Modal を閉じるのは onCancel
          (= ユーザー明示の「閉じる / キャンセル」操作) のみ。 */}
      <TimerScreen
        visible={timerState != null}
        durationSeconds={timerState?.durationSeconds ?? 0}
        actionTitle={timerState?.actionTitle ?? ''}
        onCancel={() => setTimerState(null)}
        onComplete={() => {
          // 「force set true」で達成記録。 onToggleNode (反転) ではなく
          // onMarkNodeAchieved を使うのは K-027 同型 (既達成 → 未達成に戻るバグ防止)。
          if (timerState) {
            if (onMarkNodeAchieved) {
              onMarkNodeAchieved(timerState.chainId, timerState.nodeId, true);
            }
            // Issue #102: 完了 feedback トーストを表示。 Issue #116 で Modal は閉じない
            // ようにしたため、 Modal の上にトーストは描画されない (RN Modal は別 window)
            // が、 ユーザーが「閉じる」を押して Modal を抜けた後に背景の Today で表示される。
            setTimerCompletionToast({ actionTitle: timerState.actionTitle });
          }
        }}
      />

      {/* ADR-0044 (#181): アクション長押し起点の手動メモ作成 Modal。
          onAddNote 未指定なら描画しない (= 親がメモ永続化を提供するときのみ)。 */}
      {onAddNote && (
        <NoteComposeModal
          open={noteModalOpen}
          chainOptions={noteChainOptions}
          initialNodeId={noteTargetNodeId}
          onCancel={() => setNoteModalOpen(false)}
          onSubmit={(nodeId, content) => onAddNote(nodeId, content)}
        />
      )}

      {/* Issue #102: タイマー完了トースト。 background 中に OS タイマーで完了 →
          foreground 復帰で TimerScreen が自動 onComplete → ここに表示される。
          foreground 中に通常完了した場合も同じトーストで「達成記録された」を明示。
          tap / auto-dismiss (4 秒) のどちらでも消える。 */}
      {timerCompletionToast && (
        <InAppNotificationToast
          title="タイマー完了"
          body={timerCompletionToast.actionTitle}
          onPress={() => setTimerCompletionToast(null)}
          onDismiss={() => setTimerCompletionToast(null)}
          autoDismissMs={4000}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR_BG },
  scroll: { padding: 24 },
  // #142: 見出し「Today」と累計表示を同じ行に並べる。 baseline 揃えで大見出しの
  // ベースラインに小さい累計テキストを乗せる。 marginBottom は行側に移動。
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heading: {
    color: COLOR_FG,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  // #142: 控えめなトーン (COLOR_FG_FAINT / tabular-nums)。 定着星や達成マーカーより
  // 目立たせない (DESIGN-SYSTEM §0 / §4.2)。 数字が伸びても揃うよう tabular-nums。
  cumulativeTotal: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginLeft: 12,
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
