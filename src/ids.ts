import * as Crypto from 'expo-crypto';

// 新規 chain / node / action / anchor の ID 生成。
// expo-crypto.randomUUID() は v4 UUID を返す (RFC 4122 準拠)。
// Expo SDK 同梱、Expo Go / Dev Build / standalone どこでも動く。
// id プレフィックスは type を識別しやすくするため (DB 単一テーブル PK だけだと
// テスト時の見づらさが増えるので、人間可読性を優先)。
export const newChainId = (): string => `chain-${Crypto.randomUUID()}`;
export const newNodeId = (): string => `node-${Crypto.randomUUID()}`;
export const newActionId = (): string => `action-${Crypto.randomUUID()}`;
export const newAnchorId = (): string => `anchor-${Crypto.randomUUID()}`;
export const newMetricId = (): string => `metric-${Crypto.randomUUID()}`;

// generic randomId (metric / 他 entity 用、 prefix なし)。
// PR-Z3a で metricsRepository.insertMetric が呼び出す。
export const randomId = (): string => Crypto.randomUUID();
