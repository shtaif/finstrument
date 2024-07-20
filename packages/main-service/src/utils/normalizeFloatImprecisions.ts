export { normalizeFloatImprecisions };

function normalizeFloatImprecisions(value: number): number {
  let res = value;
  res *= multiplier;
  res = Math.round(res);
  res /= multiplier;
  return res;
}

const NUM_DECS_TO_RETAIN = 12;

const multiplier = 10 ** NUM_DECS_TO_RETAIN;
