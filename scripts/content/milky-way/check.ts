import { resolveGalaxySettings, sampleGalaxyPosition, seededRandom } from '@ge/domain';
import { ARMS, REGIONS, SYSTEMS } from './catalog.ts';
import { armPoint, barRotationDeg, makeFrame } from './geo.ts';
import { armPath, GALAXY_SETTINGS, place } from './plan.ts';

/**
 * Two checks on the fitted background (milky-way README):
 * - `fitArms()`: searches the generated spiral's twist, bar length and the bar's angle (within
 *   a few degrees of the measured 27°) for the closest match to the measured arms.
 * - `plotSvg()`: a top-down picture, as the galaxy view's top view shows it, of the generated
 *   stars, their arms' centre lines (dashed), the measured arms and the catalogue.
 */

const R = GALAXY_SETTINGS.radiusLy;
/** The generated arms start curling at this share of the radius (density.ts, GALAXY_SHAPE). */
const ARM_START = 0.05;

/** The angle of generated arm `k` at radius `r` (density.ts, sampleGalaxyPosition). */
function armAngle(k: number, r: number, arms: number, twist: number, barLy: number) {
  const start = ARM_START * R;
  const progress = Math.log(1 + Math.max(r - barLy, 0) / start) / Math.log(1 + (R - barLy) / start);
  return (k * 2 * Math.PI) / arms + progress * twist * 2 * Math.PI;
}

export function fitArms() {
  let best = { error: Infinity, extraDeg: 0, bar: 0, twist: 0 };
  for (let extraDeg = -16; extraDeg <= 16; extraDeg += 1) {
    const frame = makeFrame(barRotationDeg() + extraDeg);
    // The Local Arm is a spur between the major arms: the generated spiral has no match for it.
    const points = ARMS.filter((a) => a.key !== 'local-arm').flatMap((a) =>
      Array.from({ length: 31 }, (_, i) =>
        frame(armPoint(a, a.betaFromDeg + ((a.betaToDeg - a.betaFromDeg) * i) / 30)),
      ),
    );
    for (let bar = 0.2; bar <= 0.34; bar += 0.02) {
      // A realistic pitch (about 12° near the Sun) needs roughly 1.0–1.2 turns; much tighter
      // spirals fit any arc and stop looking like the Galaxy.
      for (let twist = 0.95; twist <= 1.25; twist += 0.025) {
        let sum = 0;
        for (const p of points) {
          const r = Math.hypot(p.x, p.z);
          const theta = Math.atan2(p.z, p.x);
          let nearest = Infinity;
          for (let k = 0; k < 4; k++) {
            const d = theta - armAngle(k, r, 4, twist, bar * R);
            nearest = Math.min(nearest, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * r);
          }
          sum += nearest * nearest;
        }
        // Light-years off the arms, plus a penalty for straying from the measured bar angle.
        const error = Math.sqrt(sum / points.length) + Math.abs(extraDeg) * 25;
        if (error < best.error) best = { error, extraDeg, bar, twist };
      }
    }
  }
  return best;
}

export function plotSvg(): string {
  const settings = resolveGalaxySettings(GALAXY_SETTINGS);
  const random = seededRandom(GALAXY_SETTINGS.seed);
  const W = 1000;
  const scale = W / 2 / 52_000;
  // Seen from +Y: X to the right, Z down the page.
  const at = (x: number, z: number) =>
    [W / 2 + x * scale, W / 2 + z * scale].map((n) => n.toFixed(1));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(W)}" style="background:#000">`,
  ];
  for (let i = 0; i < 25_000; i++) {
    const [x, , z] = sampleGalaxyPosition(settings, random);
    const [cx, cy] = at(x, z);
    parts.push(`<circle cx="${cx ?? ''}" cy="${cy ?? ''}" r="0.8" fill="#556"/>`);
  }
  const barLy = settings.barLengthRadii * R;
  for (let k = 0; k < settings.arms; k++) {
    const line = [];
    for (let r = barLy; r <= R; r += 500) {
      const th = armAngle(k, r, settings.arms, settings.armTwist, barLy);
      line.push(at(r * Math.cos(th), r * Math.sin(th)).join(','));
    }
    parts.push(
      `<polyline fill="none" stroke="#fff" stroke-dasharray="6 4" stroke-width="1.5" points="${line.join(' ')}"/>`,
    );
  }
  const colors = ['#ff6', '#f6f', '#6ff', '#6f6', '#f96', '#99f'];
  ARMS.forEach((arm, i) => {
    const color = colors[i % colors.length] ?? '#fff';
    const points = armPath(arm);
    parts.push(
      `<polyline fill="none" stroke="${color}" stroke-width="3" points="${points.map((p) => at(p.x, p.z).join(',')).join(' ')}"/>`,
    );
    const [lx, ly] = at(points[20]?.x ?? 0, points[20]?.z ?? 0);
    parts.push(
      `<text x="${lx ?? ''}" y="${ly ?? ''}" fill="${color}" font-size="14">${arm.name}</text>`,
    );
  });
  const dot = (x: number, z: number, color: string, label: string) => {
    const [cx, cy] = at(x, z);
    parts.push(`<circle cx="${cx ?? ''}" cy="${cy ?? ''}" r="3" fill="${color}"/>`);
    parts.push(
      `<text x="${String(Number(cx) + 4)}" y="${cy ?? ''}" fill="${color}" font-size="9">${label}</text>`,
    );
  };
  for (const r of REGIONS) {
    const p = place(r.pos);
    if (Math.hypot(p.x, p.z) < 60_000) dot(p.x, p.z, '#f88', r.name);
  }
  for (const s of SYSTEMS) {
    const p = place(s.pos);
    if (s.pos.d > 1000) dot(p.x, p.z, '#8cf', s.name);
  }
  const sun = place({ l: 0, b: 0, d: 0 });
  dot(sun.x, sun.z, '#ff0', 'Sun');
  dot(0, 0, '#fff', 'Sgr A*');
  parts.push('</svg>');
  return parts.join('');
}
