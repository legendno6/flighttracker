import { useEffect, useRef, useState } from 'react';

const FLIP_MS = 260;
const STAGGER_MS = 35;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(media.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function pad(value: string, width: number): string {
  return value.toUpperCase().slice(0, width).padEnd(width, ' ');
}

/** One character cell that mechanically flips to its new glyph, like a real split-flap board tile. */
function Flap({ char, delayMs, reducedMotion }: { char: string; delayMs: number; reducedMotion: boolean }) {
  const [settled, setSettled] = useState(char);
  const [flipping, setFlipping] = useState(false);
  const prevRef = useRef(char);

  useEffect(() => {
    if (char === prevRef.current) return;
    if (reducedMotion) {
      prevRef.current = char;
      setSettled(char);
      return;
    }
    const startTimer = window.setTimeout(() => setFlipping(true), delayMs);
    const settleTimer = window.setTimeout(() => {
      prevRef.current = char;
      setSettled(char);
      setFlipping(false);
    }, delayMs + FLIP_MS);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(settleTimer);
    };
  }, [char, delayMs, reducedMotion]);

  return (
    <div className={`fids-flap${flipping ? ' is-flipping' : ''}`}>
      <div className="fids-flap-face fids-flap-front">{settled}</div>
      <div className="fids-flap-face is-back fids-flap-back">{char}</div>
    </div>
  );
}

interface SplitFlapProps {
  value: string;
  width: number;
  colorVar?: string;
}

/** A row of mechanical split-flap tiles rendering `value`, padded/truncated to `width` characters. */
export function SplitFlap({ value, width, colorVar }: SplitFlapProps) {
  const reducedMotion = useReducedMotion();
  const chars = pad(value, width).split('');
  return (
    <div className="fids-flap-row" style={colorVar ? ({ '--fids-flap-color': colorVar } as React.CSSProperties) : undefined}>
      {chars.map((char, i) => (
        <Flap key={i} char={char} delayMs={i * STAGGER_MS} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}
