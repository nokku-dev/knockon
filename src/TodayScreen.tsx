import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChainCard } from './ChainCard';
import { ChainDetail } from './ChainDetail';
import { countAchievedInMap } from './domain';
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
  // #142: アプリ全体の「今日より前の累計達成ノード数」(SQL COUNT のベース)。 見出し右に
  // 「累計 N 回 (+今日)」を出すため。 今日の達成数は chains の achievements から合算する。
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
  // Issue #166 (ADR-0042 採択): 採用チェーンがちょうど 1 本のときだけ Today 下部に
  // 出す「もう一本テンプレートから足す」ナッジのタップハンドラ。 親 route 側で
  // router.push('/discover') を配線する。 未指定ならナッジは出さない (発見性 =
  // 親が動線を持つときのみ、 PR-AA 編集ボタンと同型)。
  onOpenDiscovery?: () => void;
  // #165 (ADR-0042 P1): 立ち上げチェックリスト用。onboarding 完了済みか、dismiss 時刻
  // (null = 未 dismiss)、閉じるハンドラ。マイルストーンの達成度は chains / achievedBeforeToday
  // からライブ算出する (= 楽観更新で即反映)。onDismissChecklist 未指定ならチェックリストは
  // 出さない (= 親が dismiss 動線を持つときのみ、 onEditChain / onOpenDiscovery と同型)。
  onboardingCompleted?: boolean;
  checklistDismissedAt?: string | null;
  checklistAddedAction?: boolean;
  onDismissChecklist?: () => void;
};

export const TodayScreen = ({
  chains,
  achievedBeforeToday = 0,
  onToggleNode,
  initialOpenChainId = null,
  onEditChain,
  onMarkNodeAchieved,
  onOpenDiscovery,
  onboardingCompleted = false,
  checklistDismissedAt = null,
  checklistAddedAction = false,
  onDismissChecklist,
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

  // #142: アプリ全体の累計達成ノード数「累計 N 回 (+今日)」。 今日の達成数は全チェーンの
  // achievements を合算 (countAchievedInMap) し、 base (今日より前の累計) と足す。 今日分を
  // base と分離しているので、 タップでの楽観更新 (achievements 変化) が即座に両方へ反映される。
  const todayAchievedCount = useMemo(
    () => chains.reduce((acc, c) => acc + countAchievedInMap(c.achievements), 0),
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
          {/* #142 (ADR-0041): 見出し右横にアプリ全体の累計達成ノード数。 cumulativeTotal=0
              (= まだ一度も達成なし) は非表示で、 最初の 1 回から現れる。 単位は「個達成」
              (Taku 指定 2026-06-17、 「回」だとノード単位の回数と混線するため)。 控えめな
              トーンで前進感だけを出す (Celebrate 主 / DESIGN-SYSTEM §0)。 */}
          {cumulativeTotal > 0 && (
            <Text
              testID="today-cumulative-total"
              style={styles.cumulativeTotal}
              accessibilityLabel={`累計 ${cumulativeTotal} 個達成、 うち今日 ${todayAchievedCount} 個`}
            >
              累計 {cumulativeTotal.toLocaleString()} 個達成 (+{todayAchievedCount})
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
        {/* Issue #166 (ADR-0042 採択): 採用チェーンがちょうど 1 本のときだけ、
            Today 下部に「もう一本、テンプレートから足す」discovery ナッジを出す。
            SPEC §5 step5 (「もう一方も?」opt-in) と同型の Augmentation 原則ナッジ
            (= 完成形のプレビュー、 K-031 と整合)。 0 本は empty 表示と排他、
            2 本以上は「もう一本」訴求の役目が終わっているため非表示。 トーンは
            controll (LINE_BG 背景 / FG_SOFT テキスト) で控えめに置く (DESIGN-SYSTEM
            §0 Celebrate 主 / マイナスを指差さない)。 親 route が onOpenDiscovery
            を渡したときだけ表示 (発見性 = 親が動線を持つときのみ、 PR-AA 編集ボタン
            と同型)。 */}
        {onOpenDiscovery && chains.length === 1 && (
          <Pressable
            onPress={onOpenDiscovery}
            accessibilityRole="button"
            accessibilityLabel="もう一本、テンプレートから足す"
            style={styles.discoveryNudge}
          >
            <Text style={styles.discoveryNudgeTitle}>もう一本、テンプレートから足す</Text>
            <Text style={styles.discoveryNudgeBody}>
              朝・夜の片方が動き出したら、 もう片方も。
            </Text>
          </Pressable>
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
                nodeRecentCells={openChain.nodeRecentCells}
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
  // Issue #166: 控えめなトーン (LINE_BG 背景 / FG_SOFT テキスト) で「もう一本」
  // ナッジを置く。 角丸はカード系と揃え (DESIGN-SYSTEM §3 / `--r`=14)、 上方向に
  // margin を取って ChainCard と一定の距離を作る (押し込み感を出さない)。
  discoveryNudge: {
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: COLOR_LINE_BG,
    gap: 4,
  },
  discoveryNudgeTitle: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '700',
  },
  discoveryNudgeBody: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    lineHeight: 18,
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
