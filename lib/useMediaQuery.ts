// ============================================================================
// DineroYa — Media query reactiva
// useSyncExternalStore evita el estado obsoleto cuando el viewport cambia antes
// de que el listener se registre: siempre se lee el valor actual de matchMedia.
// ============================================================================
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    onChange => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      // Respaldo: algunos navegadores difieren el evento de la media query.
      window.addEventListener('resize', onChange);
      return () => {
        mql.removeEventListener('change', onChange);
        window.removeEventListener('resize', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
