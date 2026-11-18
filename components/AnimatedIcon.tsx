// ============================================================================
// DineroYa — Icono animado
// Envuelve cualquier icono y le da vida: hover, tap y estado activo.
// La campana reacciona al contador de no leídas y el engranaje gira.
// ============================================================================
import React, { useEffect, useRef } from 'react';
import { iconActive, iconHover, iconTap, iconWiggle } from '../lib/motion';

export type IconMotionKind = 'default' | 'bell' | 'gear';

export interface AnimatedIconProps {
  icon: React.ElementType;
  active?: boolean;
  kind?: IconMotionKind;
  /** Cambia este valor para disparar el balanceo de la campana. */
  badge?: number;
  className?: string;
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  icon: Icon,
  active = false,
  kind = 'default',
  badge,
  className = 'w-5 h-5',
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const lastBadge = useRef<number | undefined>(badge);

  // Estado activo: el engranaje gira, el resto hace un pulso elástico.
  useEffect(() => {
    if (!active) return;
    iconActive(ref.current, kind === 'gear');
  }, [active, kind]);

  // Campana: solo se mueve cuando el número de pendientes cambia de verdad.
  useEffect(() => {
    if (kind !== 'bell') return;
    const previous = lastBadge.current;
    lastBadge.current = badge;
    if ((badge ?? 0) > 0 && previous !== badge) iconWiggle(ref.current);
  }, [badge, kind]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="inline-flex shrink-0 will-change-transform"
      onMouseEnter={() => iconHover(ref.current, kind === 'gear')}
      onPointerDown={() => iconTap(ref.current)}
    >
      <Icon className={className} />
    </span>
  );
};
