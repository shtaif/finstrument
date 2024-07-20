export { mockUuidFromNumber };

function mockUuidFromNumber(num: number): string {
  const hexNum = num.toString(16);
  const segment1 = hexNum.slice(0, 8).padEnd(8, '0');
  const segment2 = hexNum.slice(8, 12).padEnd(4, '0');
  const segment3 = hexNum.slice(12, 16).padEnd(4, '0');
  const segment4 = hexNum.slice(16, 20).padEnd(4, '0');
  const segment5 = hexNum.slice(20, 32).padEnd(12, '0');
  return `${segment1}-${segment2}-${segment3}-${segment4}-${segment5}`;
}
