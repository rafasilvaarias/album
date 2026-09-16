export function positionToDb(
  position: number,
  min: number = -30,
  max: number = 10,
  k: number = 3
): number {
  const t = Math.max(-1, Math.min(1, position));
  const peak = t >= 0 ? max : Math.abs(min);
  const sign = t >= 0 ? 1 : -1;
  return sign * ((Math.pow(k, Math.abs(t)) - 1) / (k - 1)) * peak;
}

export function mulberry32(seed: number) {
  return function() {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}