import { createHash } from 'node:crypto';

export const FORMULA_VERSION = '1.1.0';

export function accountFingerprint(token) {
  if (!String(token ?? '').trim()) throw new Error('Для истории нужен токен финансового кабинета');
  return createHash('sha256').update(String(token).trim()).digest('hex');
}

export function historyEntry(token, period, analysis) {
  return {
    accountKey: accountFingerprint(token),
    formulaVersion: analysis.formulaVersion ?? FORMULA_VERSION,
    generatedAt: analysis.generatedAt,
    period,
    summary: analysis.summary,
    products: analysis.products,
    alerts: analysis.alerts?.length ?? 0,
  };
}

export function historyForAccount(entries, token) {
  const accountKey = accountFingerprint(token);
  return entries.filter((entry) => entry.accountKey === accountKey).map(({ accountKey: _, products: __, ...safe }) => safe);
}
