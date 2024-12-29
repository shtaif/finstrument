import React from 'react';
import { Alert } from 'antd';
import { useAsyncIter } from 'react-async-iterators';
import { pipe } from 'shared-utils';
import { type MaybeAsyncIterable } from 'iterable-operators';
import './style.css';

export { PositionDataErrorPanel };

function PositionDataErrorPanel(props: {
  className?: string;
  errors?: MaybeAsyncIterable<undefined | { message?: string } | { message?: string }[]>;
}): React.ReactNode {
  const { className, errors } = props;

  const nextErrors = useAsyncIter(errors);

  const errorsNorm = pipe(
    nextErrors.error ?? nextErrors.value ?? nextErrors.value,
    errors => (!errors ? [] : errors),
    errors => (Array.isArray(errors) ? errors : [errors])
  );

  return (
    !!errorsNorm.length && (
      <div className={`cmp-position-data-error-panel ${className ?? ''}`}>
        {errorsNorm.map((err, i) => (
          <Alert
            className="alert-item"
            key={i}
            type="error"
            showIcon
            message={<>Error: {err.message} </>}
          />
        ))}
      </div>
    )
  );
}
