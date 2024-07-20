import { useLayoutEffect, useRef, ReactNode, type FC } from 'react';
import { usePrevious } from '@uidotdev/usehooks';
import './style.css';

const LivePriceDisplay: FC<{
  className?: string;
  price?: number;
  children?: (price: number) => ReactNode;
}> = ({ className, price, children = (price: number) => price.toLocaleString() }) => {
  const prevPrice = usePrevious(price) ?? undefined;

  const animationsRef = useRef<{
    priceIncrease: Animation;
    priceDecrease: Animation;
  }>();

  function handleContainerRef(elemRef: HTMLDivElement) {
    animationsRef.current?.priceIncrease.cancel();
    animationsRef.current?.priceDecrease.cancel();
    if (!elemRef) {
      return;
    }
    animationsRef.current = {
      priceIncrease: elemRef.animate(
        [
          { color: '#0eb35b', transform: 'scale(1.1)' },
          { color: '#0eb35b', transform: 'scale(1)' },
          { color: '' },
        ],
        { duration: 500 }
      ),
      priceDecrease: elemRef.animate(
        [
          { color: '#e62333', transform: 'scale(1.1)' },
          { color: '#e62333', transform: 'scale(1)' },
          { color: '' },
        ],
        { duration: 500 }
      ),
    };
    animationsRef.current.priceIncrease.finish();
    animationsRef.current.priceDecrease.finish();
  }

  useLayoutEffect(() => {
    if (
      prevPrice === price ||
      prevPrice === undefined ||
      price === undefined ||
      !animationsRef.current
    ) {
      return;
    }

    const { priceIncrease, priceDecrease } = animationsRef.current;

    const anime = price > prevPrice ? priceIncrease : priceDecrease;

    anime.play();

    return () => anime.finish();
  }, [price, prevPrice]);

  return (
    <div className={`live-price-display ${className}`} ref={handleContainerRef}>
      {price === undefined ? '' : children(price)}
    </div>
  );
};
export { LivePriceDisplay };
