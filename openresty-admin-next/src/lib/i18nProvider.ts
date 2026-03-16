import messages from '@/i18n/en';

export function t(key: string): string {
  const keys = key.split('.');
  let result: any = messages;
  for (const k of keys) {
    result = result?.[k];
    if (result === undefined) return key;
  }
  return typeof result === 'string' ? result : key;
}

export default messages;
