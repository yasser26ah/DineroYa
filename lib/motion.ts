// ============================================================================
// DineroYa — Motion
// Micro-interacciones con Anime.js v4. Solo se animan transform, opacity y
// stroke: nunca propiedades que disparen layout. Todas las animaciones se
// pausan/revierten al desmontar y se desactivan con prefers-reduced-motion.
// ============================================================================
import { animate, createTimeline, stagger, spring, utils } from 'animejs';
import type { JSAnimation, Timeline } from 'animejs';
import { useEffect, useRef } from 'react';
import type { DependencyList } from 'react';

/** Springs con intención: táctiles al tocar, suaves al acomodar. */
export const SPRINGS = {
  /** Drawer y menús: rebote corto, se siente físico sin oscilar. */
  tactile: { stiffness: 260, damping: 26, mass: 1 },
  /** Sub-opciones y hover: asentamiento rápido. */
  settle: { stiffness: 190, damping: 22, mass: 1 },
  /** Tap: elástico, duración percibida corta. */
  pop: { bounce: 0.45, duration: 380 },
} as const;

export const EASES = {
  enter: 'out(3)',
  swing: 'inOut(2)',
} as const;

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const play = (target: Element | null | undefined, params: Record<string, unknown>): JSAnimation | null => {
  if (!target || prefersReducedMotion()) return null;
  return animate(target, params);
};

// --- Iconos -----------------------------------------------------------------

/** Hover: crece un poco y, si es un engranaje, gira. */
export function iconHover(el: Element | null, spin = false): JSAnimation | null {
  return play(el, {
    scale: 1.12,
    rotate: spin ? 18 : 0,
    duration: 320,
    ease: spring(SPRINGS.settle),
  });
}

/** Tap: compresión elástica, el gesto se siente recibido. */
export function iconTap(el: Element | null): JSAnimation | null {
  return play(el, { scale: [1, 0.84, 1], duration: 320, ease: spring(SPRINGS.pop) });
}

/** Estado activo: pulso corto (o giro completo si es el engranaje). */
export function iconActive(el: Element | null, spin = false): JSAnimation | null {
  if (spin) {
    return play(el, { rotate: [0, 90], duration: 620, ease: spring(SPRINGS.tactile) });
  }
  return play(el, { scale: [1, 1.18, 1], duration: 420, ease: spring(SPRINGS.pop) });
}

/** Campana: se balancea cuando aparece una notificación nueva. */
export function iconWiggle(el: Element | null): JSAnimation | null {
  return play(el, { rotate: [0, -14, 11, -7, 0], duration: 640, ease: EASES.swing });
}

// --- Transiciones de vista ---------------------------------------------------

/**
 * Entrada escalonada de los elementos marcados con [data-reveal].
 * Devuelve la timeline para poder revertirla al desmontar.
 */
export function revealTimeline(root: HTMLElement | null, selector = '[data-reveal]'): Timeline | null {
  if (!root) return null;
  const targets = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (targets.length === 0) return null;

  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateY: 0, scale: 1 });
    return null;
  }

  utils.set(targets, { opacity: 0, translateY: 14 });

  const timeline = createTimeline({ defaults: { duration: 460, ease: EASES.enter } });
  timeline.add(targets, {
    opacity: [0, 1],
    translateY: [14, 0],
    delay: stagger(45),
  });
  return timeline;
}

/** Hook: anima la entrada de una vista y limpia la timeline al desmontar. */
export function useReveal(deps: DependencyList, selector = '[data-reveal]') {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timeline = revealTimeline(ref.current, selector);
    return () => {
      timeline?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

/** Drawer móvil: apertura/cierre con física de resorte. */
export function animateDrawer(el: HTMLElement | null, open: boolean): JSAnimation | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    el.style.transform = open ? 'translateX(0)' : 'translateX(-100%)';
    return null;
  }
  return animate(el, {
    translateX: open ? ['-100%', '0%'] : ['0%', '-100%'],
    duration: 520,
    ease: spring(SPRINGS.tactile),
  });
}

/** Sub-opciones de un menú: despliegue escalonado. */
export function revealSubitems(root: HTMLElement | null): JSAnimation | null {
  if (!root) return null;
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-subitem]'));
  if (targets.length === 0) return null;
  if (prefersReducedMotion()) {
    utils.set(targets, { opacity: 1, translateX: 0 });
    return null;
  }
  return animate(targets, {
    opacity: [0, 1],
    translateX: [-8, 0],
    delay: stagger(35),
    duration: 420,
    ease: spring(SPRINGS.settle),
  });
}
