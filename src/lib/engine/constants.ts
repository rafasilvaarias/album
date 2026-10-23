/** One "bar" in your convention: 16 beats (a beat = one subdivision step). */
export const BAR = 16;

export const EQ_RANGE: Record<'low' | 'mid' | 'high' | 'crossOver', [number, number]> = {
  low:  [-30, 10],
  mid:  [-25, 10],
  high: [-30, 10],
  crossOver: [300,4000],
};

export const ISOLATOR_RANGE: Record<'low' | 'mid' | 'high' | 'crossOver', [number, number]> = {
  low:  [-35, 6],
  mid:  [-20, 6],
  high: [-35, 6],
  crossOver: [200,6800],
};
