export default generateColorFromString;

function generateColorFromString(str: string): string {
  const hash = str.split('').reduce((hash, char) => char.charCodeAt(0) + (hash << 5) - hash, 0);

  let color = '#';

  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += value.toString(16).padStart(2, '0');
  }

  return color;
}
