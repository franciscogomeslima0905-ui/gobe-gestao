import { useState } from 'react';
import { cx } from './ui';

/**
 * Logo da GB GOBÊ.
 * Coloque o arquivo oficial em /public/logo.png — se ele não existir,
 * o sistema usa o monograma provisório /public/logo.svg.
 */
export default function Logo({ className, showText = true, light = false }: { className?: string; showText?: boolean; light?: boolean }) {
  const [src, setSrc] = useState('/logo.png');
  return (
    <div className="flex items-center gap-3">
      <img
        src={src}
        onError={() => src !== '/logo.svg' && setSrc('/logo.svg')}
        alt="GB GOBÊ – Confeitaria Artesanal"
        className={cx('h-11 w-11 shrink-0 rounded-full object-contain', className)}
      />
      {showText && (
        <div className="leading-tight">
          <p className={cx('font-display text-lg font-semibold tracking-wide', light ? 'text-creme' : 'text-bordo')}>GB GOBÊ</p>
          <p className={cx('text-[11px] font-medium uppercase tracking-[.18em]', light ? 'text-rosa' : 'text-cereja')}>Confeitaria Artesanal</p>
        </div>
      )}
    </div>
  );
}
