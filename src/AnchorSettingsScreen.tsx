import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Anchor, Chain } from './domain';
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

export type AnchorKindOption = 'time' | 'place';

export type AnchorSettingsScreenProps = {
  chain: Chain;
  anchor: Anchor;
  saving: boolean;
  locationPermission: LocationPermissionStatus;
  locating: boolean;
  onCancel: () => void;
  onSaveTime: (time: string) => void;
  onSavePlace: (payload: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }) => void;
  onFetchLocation: () => Promise<CurrentPosition | null>;
};

const RADIUS_OPTIONS = [50, 100, 200] as const;
type RadiusOption = (typeof RADIUS_OPTIONS)[number];

const pad2 = (n: number): string => String(n).padStart(2, '0');
const parseHM = (
  s: string,
): { hour: number; minute: number } | null => {
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

const defaultTimeFromAnchor = (anchor: Anchor): string =>
  parseHM(anchor.time ?? '') ? anchor.time! : '07:30';

const initialKind = (anchor: Anchor): AnchorKindOption =>
  anchor.kind === 'place' ? 'place' : 'time';

const formatCoord = (n: number): string => n.toFixed(4);

export const AnchorSettingsScreen = ({
  chain,
  anchor,
  saving,
  locationPermission,
  locating,
  onCancel,
  onSaveTime,
  onSavePlace,
  onFetchLocation,
}: AnchorSettingsScreenProps) => {
  const [kind, setKind] = useState<AnchorKindOption>(initialKind(anchor));

  // 時刻フォーム
  const initialTime = defaultTimeFromAnchor(anchor);
  const initialParts = parseHM(initialTime)!;
  const [hour, setHour] = useState(pad2(initialParts.hour));
  const [minute, setMinute] = useState(pad2(initialParts.minute));
  const composedTime = `${hour}:${minute}`;
  const timeValid = parseHM(composedTime) !== null;

  // 場所フォーム。kind に関係なく lat/lng が保存されていれば初期値に使う
  // (kind 切替時に前回値を保持するため。useAnchorSettings.save* で他 kind の
  // フィールドを上書きしない設計と整合)。
  const [position, setPosition] = useState<CurrentPosition | null>(
    anchor.latitude != null && anchor.longitude != null
      ? {
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          accuracyMeters: null,
        }
      : null,
  );
  const [radius, setRadius] = useState<RadiusOption>(
    (anchor.radiusMeters as RadiusOption | null) &&
      RADIUS_OPTIONS.includes(anchor.radiusMeters as RadiusOption)
      ? (anchor.radiusMeters as RadiusOption)
      : 100,
  );

  const placeValid = position !== null;
  const canSave = kind === 'time' ? timeValid : placeValid;

  const handleSave = () => {
    if (!canSave || saving) return;
    if (kind === 'time') {
      onSaveTime(composedTime);
    } else if (position) {
      onSavePlace({
        latitude: position.latitude,
        longitude: position.longitude,
        radiusMeters: radius,
      });
    }
  };

  const handleFetch = async () => {
    const next = await onFetchLocation();
    if (next) setPosition(next);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.topbar}>
        <Pressable onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          起点アンカーを{kind === 'time' ? '時刻' : '場所'}に設定
        </Text>
        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave || saving }}
        >
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>
            {saving ? '保存中…' : '保存'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.kindToggle}>
        {(['time', 'place'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            accessibilityRole="button"
            accessibilityLabel={k === 'time' ? '時刻' : '場所'}
            accessibilityState={{ selected: kind === k }}
            style={[
              styles.kindToggleChip,
              kind === k && styles.kindToggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.kindToggleText,
                kind === k && styles.kindToggleTextActive,
              ]}
            >
              {k === 'time' ? '時刻' : '場所'}
            </Text>
          </Pressable>
        ))}
      </View>

      {kind === 'time' ? (
        <View style={styles.sectionTime}>
          <Text style={styles.sectionLabel}>発火時刻</Text>
          <View style={styles.timeRow}>
            <TextInput
              value={hour}
              onChangeText={setHour}
              onBlur={() => setHour(clampToHour(hour))}
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
              onBlur={() => setMinute(clampToMinute(minute))}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.timeInput}
              accessibilityLabel="分"
              selectTextOnFocus
            />
          </View>
          <Text style={styles.timeHint}>
            {chain.title} を毎日この時刻に発火扱いします
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionPlace}>
            <Text style={styles.sectionLabel}>現在地</Text>
            {position ? (
              <Text style={styles.placeCoord}>
                {formatCoord(position.latitude)}, {formatCoord(position.longitude)}
              </Text>
            ) : (
              <Text style={styles.placeCoordMissing}>未取得</Text>
            )}
            {position?.accuracyMeters != null && (
              <Text style={styles.placeMeta}>
                精度 ±{Math.round(position.accuracyMeters)}m
              </Text>
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
                  {position ? '現在地を再取得' : '現在地を取得'}
                </Text>
              )}
            </Pressable>
            {locationPermission === 'denied' && (
              <Text style={styles.placePermissionWarning}>
                位置情報の権限が拒否されています。手動発火は引き続き使えます。
              </Text>
            )}
          </View>

          <View style={styles.sectionRadius}>
            <Text style={styles.sectionLabel}>発火半径</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRadius(r)}
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

      <View style={styles.sectionFallback}>
        <Text style={styles.fallbackTitle}>自動発火は便利化レイヤー</Text>
        <Text style={styles.fallbackBody}>
          {kind === 'time'
            ? 'v1 では時刻に達すると Today の起点アンカー横に「発火中」ピルが出ます。OS のローカル通知は Dev Build 移行後に追加します (Phase 1.5b)。'
            : 'v1 では Today を開いたときに現在地と比較してピル表示します。OS のジオフェンス常時監視は Dev Build 移行後に追加します (Phase 1.6b)。'}
          {' '}Today からの手動チェックは常に可能なので運用は止まりません。
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    gap: 16,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  cancel: {
    color: COLOR_FG_SOFT,
    fontSize: 14,
  },
  title: {
    color: COLOR_FG,
    fontSize: 14,
    fontWeight: '600',
  },
  save: {
    color: COLOR_GROW,
    fontSize: 14,
    fontWeight: '600',
  },
  saveDisabled: {
    color: COLOR_FG_FAINT,
  },
  kindToggle: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    backgroundColor: COLOR_SURFACE,
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
  sectionTime: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 20,
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
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -2,
    minWidth: 80,
    textAlign: 'center',
    backgroundColor: COLOR_BG,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeColon: {
    color: COLOR_FG_FAINT,
    fontSize: 56,
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
  placeMeta: {
    color: COLOR_FG_FAINT,
    fontSize: 11,
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
  sectionFallback: {
    backgroundColor: COLOR_SURFACE,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  fallbackTitle: {
    color: COLOR_FG,
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackBody: {
    color: COLOR_FG_SOFT,
    fontSize: 12,
    lineHeight: 18,
  },
});
