export { userHoldingsChanged };

function userHoldingsChanged(ownerId: string): string {
  return `user-holdings-changed:${ownerId}`;
}
