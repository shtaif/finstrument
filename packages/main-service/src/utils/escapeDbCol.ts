export { escapeDbCol };

function escapeDbCol(identifier: string): string {
  return `"${identifier.replaceAll('"', '\\"')}"`;
}
