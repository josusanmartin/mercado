// Banknote-style guilloche: layered hypotrochoid curves, generated once as static SVG paths.
// Mercado's one decorative motif (brand mark + the peso balance card); keep it everywhere else quiet.

function hypotrochoid(R: number, r: number, d: number, scale: number, steps: number) {
  const k = (R - r) / r;
  // Close the curve: run until the inner circle returns to its start.
  const g = gcd(Math.round(R * 100), Math.round(r * 100)) / 100;
  const turns = r / g;
  const n = Math.max(steps, Math.round(turns * 180));
  let p = "";
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * 2 * Math.PI;
    const x = ((R - r) * Math.cos(t) + d * Math.cos(k * t)) * scale;
    const y = ((R - r) * Math.sin(t) - d * Math.sin(k * t)) * scale;
    p += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return p + "Z";
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export function GuillocheRosette({
  size = 32,
  className,
  layers = 3,
  strokeWidth = 0.6,
}: {
  size?: number;
  className?: string;
  layers?: number;
  strokeWidth?: number;
}) {
  const paths = Array.from({ length: layers }, (_, i) => hypotrochoid(5, 3 - i * 0.2, 4.6 - i * 0.6, 4.2 - i * 0.55, 600));
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} className={className} aria-hidden fill="none">
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={strokeWidth * (100 / size) * 0.5 + 0.35} opacity={1 - i * 0.22} />
      ))}
    </svg>
  );
}

/** Wide band of interlaced waves, for the background of the balance "billete". */
export function GuillocheBand({ className }: { className?: string }) {
  const lines = Array.from({ length: 14 }, (_, i) => {
    const amp = 18 + i * 1.6;
    const phase = i * 0.42;
    let d = "";
    for (let x = 0; x <= 600; x += 4) {
      const y = 60 + Math.sin(x / 38 + phase) * amp * Math.cos(x / 140 - phase / 2);
      d += `${x ? "L" : "M"}${x} ${y.toFixed(2)}`;
    }
    return d;
  });
  return (
    <svg viewBox="0 0 600 120" preserveAspectRatio="none" className={className} aria-hidden fill="none">
      {lines.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
