import { useState } from 'react';

export { useSimpleUpdater };

function useSimpleUpdater(): () => void {
  const [, setMockCount] = useState(0);
  return () => setMockCount(count => count + 1);
}
