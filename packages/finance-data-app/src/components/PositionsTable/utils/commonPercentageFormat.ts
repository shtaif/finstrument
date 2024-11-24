export { commonPercentageFormat };

function commonPercentageFormat(percentage: number): string {
  return commonPercentageFormatter.format(percentage / 100);
}

const commonPercentageFormatter = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
