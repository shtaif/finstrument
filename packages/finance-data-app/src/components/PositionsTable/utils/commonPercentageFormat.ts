export { commonPercentageFormat };

const commonPercentageFormat: (percentage: number) => string = (() => {
  const commonPercentageFormatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return percentage => commonPercentageFormatter.format(percentage / 100);
})();
