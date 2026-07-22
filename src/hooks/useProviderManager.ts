import { useRef } from 'react';
import { ProviderManager } from '../providers/ProviderManager';
import { useSettings } from '../contexts/SettingsContext';

/** One ProviderManager per app session, always reading the latest settings. */
export function useProviderManager(): ProviderManager {
  const { getSettingsRef } = useSettings();
  const managerRef = useRef<ProviderManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new ProviderManager(getSettingsRef);
  }
  return managerRef.current;
}
