import { motion } from "framer-motion";

/**
 * Animated side view of a substation: ground, plinth, transformer, and the storm water level.
 * All heights in metres above mean sea level.
 */
export default function SideView({ ground, base, water, raise = 0, caption }) {
  const W = 520, H = 300, padB = 30, padT = 20;
  const top = Math.max(base + raise + 3.2, water + 0.8, 4);
  const y = (m) => H - padB - (Math.max(m, -0.5) / top) * (H - padB - padT);
  const plinthTop = base + raise;
  const flooded = water >= plinthTop;
  const wy = y(water);
  const tfH = 2.4; // drawn transformer height (m)

  return (
    <figure className="side-view">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Water at ${water} m vs equipment base at ${plinthTop.toFixed(2)} m`}>
        {/* metre ticks */}
        {Array.from({ length: Math.floor(top) + 1 }, (_, m) => (
          <g key={m}>
            <line x1={40} x2={W - 10} y1={y(m)} y2={y(m)} stroke="#1e3a47" strokeDasharray="3 5" />
            <text x={8} y={y(m) + 4} fill="#6f8b95" fontSize="11">{m} m</text>
          </g>
        ))}
        {/* sea on the right */}
        <rect x={W - 110} y={y(0)} width={100} height={H - padB - y(0)} fill="#0c4a6e" />
        <text x={W - 60} y={H - 10} fill="#7dd3fc" fontSize="11" textAnchor="middle">sea</text>
        {/* ground */}
        <rect x={40} y={y(ground)} width={W - 150} height={H - padB - y(ground)} fill="#3f3a2a" />
        <text x={60} y={H - 10} fill="#c8b98a" fontSize="11">ground {ground} m</text>
        {/* plinth (animated when raised) */}
        <motion.rect x={170} width={180} fill="#64748b" initial={false}
          animate={{ y: y(plinthTop), height: Math.max(y(ground) - y(plinthTop), 2) }} transition={{ duration: 0.9 }} />
        {/* transformer */}
        <motion.g initial={false} animate={{ y: y(plinthTop) - y(0) }} transition={{ duration: 0.9 }}>
          <rect x={200} y={y(0) - (y(0) - y(tfH))} width={120} height={y(0) - y(tfH)} rx={6}
            fill={flooded ? "#7f1d1d" : "#0f766e"} stroke={flooded ? "#fb7185" : "#2dd4bf"} strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={212 + i * 28} x2={212 + i * 28} y1={y(tfH) + 8} y2={y(0) - 8} stroke="#0b1220" strokeWidth={4} opacity={0.35} />
          ))}
          <text x={260} y={y(tfH) - 8} fill="#e2f3f3" fontSize="12" textAnchor="middle">transformer</text>
        </motion.g>
        {/* storm water (animated) */}
        <motion.rect x={40} width={W - 50} fill="rgba(56,189,248,0.42)" initial={false}
          animate={{ y: wy, height: Math.max(H - padB - wy, 0) }} transition={{ duration: 0.9, ease: "easeInOut" }} />
        <motion.line x1={40} x2={W - 10} stroke="#38bdf8" strokeWidth={2} initial={false}
          animate={{ y1: wy, y2: wy }} transition={{ duration: 0.9, ease: "easeInOut" }} />
        <motion.text x={W - 14} fill="#bae6fd" fontSize="12" textAnchor="end" initial={false}
          animate={{ y: wy - 6 }} transition={{ duration: 0.9 }}>storm water {water} m</motion.text>
        {/* base marker */}
        <line x1={150} x2={370} y1={y(plinthTop)} y2={y(plinthTop)} stroke={flooded ? "#fb7185" : "#34d399"} strokeDasharray="6 4" />
        <text x={150} y={y(plinthTop) - 6} fill={flooded ? "#fb7185" : "#34d399"} fontSize="11">equipment base {plinthTop.toFixed(2)} m</text>
      </svg>
      <figcaption className={flooded ? "bad" : "good"}>
        {raise > 0 ? `After raising ${raise} m: ` : ""}
        {flooded
          ? `Flooded: water is ${(water - plinthTop).toFixed(2)} m above the equipment base.`
          : `Dry: ${(plinthTop - water).toFixed(2)} m of safety margin.`}
        {caption ? ` ${caption}` : ""}
      </figcaption>
    </figure>
  );
}
