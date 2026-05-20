import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Anchor } from './domain';
import type { CurrentPosition, LocationPermissionStatus } from './location';
import {
  COLOR_BG,
  COLOR_FG,
  COLOR_FG_FAINT,
  COLOR_FG_SOFT,
  COLOR_GROW,
  COLOR_LINE_BG,
  COLOR_SURFACE,
} from './tokens';

export type EditableAnchorState = Pick<
  Anchor,
  'kind' | 'time' | 'latitude' | 'longitude' | 'radiusMeters'
>;

export type AnchorKindOption = 'time' | 'place' | 'behavior';

export type AnchorEditorProps = {
  anchor: EditableAnchorState;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  onSetKind: (kind: AnchorKindOption) => void;
  onSetTime: (time: string) => void;
  onSetLocation: (latitude: number, longitude: number) => void;
  onSetRadius: (radiusMeters: number) => void;
  onFetchLocation: () => Promise<CurrentPosition | null>;
};

const RADIUS_OPTIONS = [50, 100, 200] as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const parseHM = (s: string): { hour: number; minute: number } | null => {
  const parts = s.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0]!, 10);
  const minute = parseInt(parts[1]!, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};
const clampToHour = (raw: string): string => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return '00';
  return pad2(Math.min(23, Math.max(0, n)));
};
const clampToMinute = (raw: string): string => {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return '00';
  return pad2(Math.min(59, Math.max(0, n)));
};

const initialTime = (anchor: EditableAnchorState): string =>
  parseHM(anchor.time ?? '') ? anchor.time! : '07:30';

const formatCoord = (n: number): string => n.toFixed(4);

export const AnchorEditor = ({
  anchor,
  locationPermission,
  locating,
  onSetKind,
  onSetTime,
  onSetLocation,
  onSetRadius,
  onFetchLocation,
}: AnchorEditorProps) => {
  // 時刻入力用のローカルタイピング状態 (commit on blur)。
  const initParts = parseHM(initialTime(anchor))!;
  const [hour, setHour] = useState(pad2(initParts.hour));
  const [minute, setMinute] = useState(pad2(initParts.minute));

  // anchor.time が外部から更新された場合 (例: 別の編集ソースで kind=time に切替) に
  // ローカル state も同期する。
  useEffect(() => {
    const p = parseHM(initialTime(anchor));
    if (p) {
      setHour(pad2(p.hour));
      setMinute(pad2(p.minute));
    }
  }, [anchor.time]);

  const commitTime = (h: string, m: string) => {
    const ph = parseHM(`${h}:${m}`);
    if (ph) onSetTime(`${pad2(ph.hour)}:${pad2(ph.minute)}`);
  };

  const handleHourBlur = () => {
    const c = clampToHour(hour);
    setHour(c);
    commitTime(c, minute);
  };
  const handleMinuteBlur = () => {
    const c = clampToMinute(minute);
    setMinute(c);
    commitTime(hour, c);
  };

  const handleFetch = async () => {
    const pos = await onFetchLocation();
    if (pos) onSetLocation(pos.latitude, pos.longitude);
  };

  // kind は 3 通り: 'behavior' (=なし、手動トリガーのみ) / 'time' / 'place'
  // ADR-0003 §「手動発火が中核 / 自動発火は便利化レイヤー」と整合。新規作成時の
  // デフォルトは 'behavior' で、必要に応じて time / place を選ぶ。
  const activeKind: AnchorKindOption = anchor.kind;
  const hasLocation = anchor.latitude != null && anchor.longitude != null;
  const radius: number =
    anchor.radiusMeters != null &&
    (RADIUS_OPTIONS as readonly number[]).includes(anchor.radiusMeters)
      ? anchor.radiusMeters
      : 100;

  const kindLabel = (k: AnchorKindOption): string =>
    k === 'time' ? '時刻' : k === 'place' ? '場所' : 'なし';

  return (
    <View style={styles.root}>
      <View style={styles.kindToggle}>
        {(['behavior', 'time', 'place'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => onSetKind(k)}
            accessibilityRole="button"
            accessibilityLabel={kindLabel(k)}
            accessibilityState={{ selected: activeKind === k }}
            style={[
              styles.kindToggleChip,
              activeKind === k && styles.kindToggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.kindToggleText,
                activeKind === k && styles.kindToggleTextActive,
              ]}
            >
              {kindLabel(k)}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeKind === 'behavior' ? (
        <View style={styles.sectionBehavior}>
          <Text style={styles.behaviorTitle}>手動トリガーのみ</Text>
          <Text style={styles.behaviorBody}>
            時刻 / 場所による自動発火はなし。Today で手動でチェックして連鎖を実行します。
          </Text>
        </View>
      ) : activeKind === 'time' ? (
        <View style={styles.sectionTime}>
          <Text style={styles.sectionLabel}>発火時刻</Text>
          <View style={styles.timeRow}>
            <TextInput
              value={hour}
              onChangeText={setHour}
              onBlur={handleHourBlur}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.timeInput}
              accessibilityLabel="時"
              selectTextOnFocus
            />
            <Text style={styles.timeColon}>:</Text>
            <TextInput
              value={minute}
              onChangeText={setMinute}
              onBlur={handleMinuteBlur}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.timeInput}
              accessibilityLabel="分"
              selectTextOnFocus
            />
          </View>
          <Text style={styles.timeHint}>毎日この時刻に発火扱いします</Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionPlace}>
            <Text style={styles.sectionLabel}>現在地</Text>
            {hasLocation ? (
              <Text style={styles.placeCoord}>
                {formatCoord(anchor.latitude!)}, {formatCoord(anchor.longitude!)}
              </Text>
            ) : (
              <Text style={styles.placeCoordMissing}>未取得</Text>
            )}
            <Pressable
              onPress={handleFetch}
              accessibilityRole="button"
              accessibilityLabel="現在地を取得"
              accessibilityState={{ disabled: locating }}
              style={[styles.placeFetchBtn, locating && styles.placeFetchBtnDisabled]}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator color={COLOR_FG} size="small" />
              ) : (
                <Text style={styles.placeFetchBtnText}>
                  {hasLocation ? '現在地を再取得' : '現在地を取得'}
                </Text>
              )}
            </Pressable>
            {locationPermission === 'denied' && (
              <Text style={styles.placePermissionWarning}>
                位置情報の権限が拒否されています。手動チェックは引き続き使えます。
              </Text>
            )}
          </View>

          <View style={styles.sectionRadius}>
            <Text style={styles.sectionLabel}>発火半径</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => onSetRadius(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r}m`}
                  accessibilityState={{ selected: radius === r }}
                  style={[
                    styles.radiusChip,
                    radius === r && styles.radiusChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.radiusChipText,
                      radius === r && styles.radiusChipTextActive,
                    ]}
                  >
                    {r}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  kindToggle: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    backgroundColor: COLOR_BG,
    borderRadius: 999,
  },
  kindToggleChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 999,
  },
  kindToggleChipActive: {
    backgroundColor: COLOR_LINE_BG,
  },
  kindToggleText: {
    color: COLOR_FG_FAINT,
    fontSize: 13,
    fontWeight: '600',
  },
  kindToggleTextActive: {
    color: COLOR_FG,
  },
  sectionBehavior: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  behaviorTitle: {
    color: COLOR_FG,
    fontSize: 13,
    fontWeight: '600',
  },
  behaviorBody: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTime: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeInput: {
    color: COLOR_FG,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
    minWidth: 72,
    textAlign: 'center',
    backgroundColor: COLOR_BG,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeColon: {
    color: COLOR_FG_FAINT,
    fontSize: 48,
    fontWeight: '700',
  },
  timeHint: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
  },
  sectionPlace: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  placeCoord: {
    color: COLOR_FG,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  placeCoordMissing: {
    color: COLOR_FG_FAINT,
    fontSize: 16,
  },
  placeFetchBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
    minWidth: 140,
    alignItems: 'center',
  },
  placeFetchBtnDisabled: {
    opacity: 0.5,
  },
  placeFetchBtnText: {
    color: COLOR_FG,
    fontSize: 13,
    fontWeight: '600',
  },
  placePermissionWarning: {
    color: COLOR_FG_SOFT,
    fontSize: 11,
    lineHeight: 16,
  },
  sectionRadius: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  radiusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radiusChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: COLOR_LINE_BG,
  },
  radiusChipActive: {
    backgroundColor: COLOR_GROW,
  },
  radiusChipText: {
    color: COLOR_FG_SOFT,
    fontSize: 13,
    fontWeight: '600',
  },
  radiusChipTextActive: {
    color: COLOR_BG,
  },
});
