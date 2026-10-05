import React, { useRef, useEffect, useState } from 'react';

/**
 * SignaturePad — a lightweight draw-to-sign canvas used by the `signature` field
 * type on both the public registration form and the builder preview. It stores its
 * result as a PNG data-URL string (or null when cleared) via onChange, so the value
 * round-trips through form_data like any other string field — no new validation or
 * pricing wiring is needed. Pointer + touch both draw; `touch-none` stops the page
 * scrolling while signing on mobile.
 */
export default function SignaturePad({ value, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const last      = useRef({ x: 0, y: 0 });
  const [empty, setEmpty] = useState(!value);

  // Size the backing store to the element (DPR-aware) and restore an existing
  // value once, on mount. The canvas is always visible when it mounts (inside the
  // form / preview modal), so getBoundingClientRect has real dimensions here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect  = canvas.getBoundingClientRect();
    canvas.width  = Math.max(1, rect.width)  * ratio;
    canvas.height = Math.max(1, rect.height) * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const start = (e) => {
    if (disabled) return;
    drawing.current = true;
    last.current = pointFrom(e);
  };

  const move = (e) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      onChange(canvasRef.current.toDataURL('image/png'));
    } catch (_) {
      /* toDataURL can throw on a tainted canvas — not possible here (no external
         image drawn), but guard anyway so a signature never breaks submit. */
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className={`w-full h-40 rounded-lg border border-slate-300 bg-white touch-none ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-crosshair'}`}
      />
      <div className="flex justify-between items-center mt-1.5">
        <span className="text-xs text-slate-400 font-jakarta">
          {empty ? 'Draw your signature in the box above' : 'Signature captured'}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-jakarta text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
