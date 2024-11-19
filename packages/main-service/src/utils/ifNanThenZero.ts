export { ifNanThenZero };

function ifNanThenZero(num: number): number {
  return isNaN(num) ? 0 : num;
}
