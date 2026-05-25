import type { Metric } from './metricsRepository';
import type { NotionPage } from './notionClient';
import {
  filterNewNotionMetrics,
  mapNotionPagesToMetrics,
  normalizeNotionDatetime,
} from './notionMetricsSync';

describe('normalizeNotionDatetime', () => {
  test('Z 終端を剥がし、 ミリ秒を切る', () => {
    expect(normalizeNotionDatetime('2026-05-26T09:00:00.000Z')).toBe(
      '2026-05-26T09:00:00',
    );
  });

  test('Z なし入力でも 19 文字に切る', () => {
    expect(normalizeNotionDatetime('2026-05-26T09:00:00.123456')).toBe(
      '2026-05-26T09:00:00',
    );
  });
});

describe('mapNotionPagesToMetrics (Notion page → Metric)', () => {
  const buildPage = (
    id: string,
    createdTime: string,
    properties: Record<string, number>,
  ): NotionPage => ({
    id,
    createdTime,
    lastEditedTime: createdTime,
    numberProperties: properties,
  });

  test('METRIC_KINDS と一致する property だけ拾う (weight / exercise_minutes / sleep_hours)', () => {
    const pages: NotionPage[] = [
      buildPage('p1', '2026-05-26T09:00:00.000Z', {
        weight: 72.5,
        exercise_minutes: 30,
        sleep_hours: 7,
        // 未知の property はスキップ
        unknown_prop: 100,
      }),
    ];
    const result = mapNotionPagesToMetrics(pages);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.metricKey).sort()).toEqual([
      'exercise_minutes',
      'sleep_hours',
      'weight',
    ]);
    for (const r of result) {
      expect(r.recordedAt).toBe('2026-05-26T09:00:00');
      expect(r.source).toBe('notion');
    }
  });

  test('value が NaN / Infinity なら無視', () => {
    const pages: NotionPage[] = [
      buildPage('p1', '2026-05-26T09:00:00.000Z', {
        weight: NaN,
        exercise_minutes: Infinity,
        sleep_hours: 7,
      }),
    ];
    const result = mapNotionPagesToMetrics(pages);
    expect(result).toHaveLength(1);
    expect(result[0]?.metricKey).toBe('sleep_hours');
  });

  test('複数 page → 各 page の各 metric を個別 record として吐く', () => {
    const pages: NotionPage[] = [
      buildPage('p1', '2026-05-25T09:00:00.000Z', { weight: 72 }),
      buildPage('p2', '2026-05-26T09:00:00.000Z', { weight: 72.5 }),
    ];
    const result = mapNotionPagesToMetrics(pages);
    expect(result).toHaveLength(2);
    expect(result[0]?.value).toBe(72);
    expect(result[0]?.recordedAt).toBe('2026-05-25T09:00:00');
    expect(result[1]?.value).toBe(72.5);
  });

  test('properties 空 → 空配列', () => {
    const pages: NotionPage[] = [
      buildPage('p1', '2026-05-26T09:00:00.000Z', {}),
    ];
    expect(mapNotionPagesToMetrics(pages)).toEqual([]);
  });
});

describe('filterNewNotionMetrics (重複 skip)', () => {
  test('既存 notion record と (metricKey, recordedAt) が一致するものは skip', () => {
    const candidates: Omit<Metric, 'id'>[] = [
      {
        metricKey: 'weight',
        value: 72,
        recordedAt: '2026-05-25T09:00:00',
        source: 'notion',
      },
      {
        metricKey: 'weight',
        value: 72.5,
        recordedAt: '2026-05-26T09:00:00',
        source: 'notion',
      },
    ];
    const existing: Pick<Metric, 'metricKey' | 'recordedAt' | 'source'>[] = [
      {
        metricKey: 'weight',
        recordedAt: '2026-05-25T09:00:00',
        source: 'notion',
      },
    ];
    const fresh = filterNewNotionMetrics(candidates, existing);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.recordedAt).toBe('2026-05-26T09:00:00');
  });

  test('source=manual の既存 record は重複判定の対象外 (= Notion 側を別軸として扱う)', () => {
    const candidates: Omit<Metric, 'id'>[] = [
      {
        metricKey: 'weight',
        value: 72,
        recordedAt: '2026-05-26T09:00:00',
        source: 'notion',
      },
    ];
    const existing: Pick<Metric, 'metricKey' | 'recordedAt' | 'source'>[] = [
      {
        metricKey: 'weight',
        recordedAt: '2026-05-26T09:00:00',
        source: 'manual',
      },
    ];
    const fresh = filterNewNotionMetrics(candidates, existing);
    expect(fresh).toHaveLength(1); // manual 側があっても Notion 側は別軸で取り込み
  });

  test('既存と全 candidates が重複なら空配列', () => {
    const candidates: Omit<Metric, 'id'>[] = [
      {
        metricKey: 'weight',
        value: 72,
        recordedAt: '2026-05-26T09:00:00',
        source: 'notion',
      },
    ];
    const existing: Pick<Metric, 'metricKey' | 'recordedAt' | 'source'>[] = [
      {
        metricKey: 'weight',
        recordedAt: '2026-05-26T09:00:00',
        source: 'notion',
      },
    ];
    expect(filterNewNotionMetrics(candidates, existing)).toEqual([]);
  });

  test('既存が空配列なら全 candidates を返す', () => {
    const candidates: Omit<Metric, 'id'>[] = [
      {
        metricKey: 'weight',
        value: 72,
        recordedAt: '2026-05-26T09:00:00',
        source: 'notion',
      },
    ];
    expect(filterNewNotionMetrics(candidates, [])).toEqual(candidates);
  });
});
