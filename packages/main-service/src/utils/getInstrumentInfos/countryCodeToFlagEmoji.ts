export { countryCodeToFlagEmoji };

function countryCodeToFlagEmoji(countryCode: string): string;
function countryCodeToFlagEmoji(countryCode: undefined | null): undefined;
function countryCodeToFlagEmoji(countryCode: string | undefined | null): string | undefined;
function countryCodeToFlagEmoji(countryCode: string | undefined | null): string | undefined {
  if (typeof countryCode !== 'string') {
    return;
  }

  const UNICODE_FLAG_OFFSET = 127397;

  const [firstCodePoint, secondCodePoint] = countryCode
    .toUpperCase()
    .split('')
    .map(char => char.codePointAt(0)! + UNICODE_FLAG_OFFSET);

  return String.fromCodePoint(firstCodePoint, secondCodePoint);
}
