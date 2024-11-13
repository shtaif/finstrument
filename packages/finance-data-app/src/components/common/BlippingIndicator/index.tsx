import React from 'react';
import './style.css';

export { BlippingIndicator };

function BlippingIndicator(props: {
  blipping?: boolean;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  const { blipping = false, className = '', style } = props;
  return (
    <span
      className={`cmp-blipping-indicator ${blipping ? 'indicator-blipping' : ''} ${className}`}
      style={style}
    />
  );
}
