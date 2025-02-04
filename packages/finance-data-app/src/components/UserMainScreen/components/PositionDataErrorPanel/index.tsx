import React from 'react';
import { Alert } from 'antd';
import { It, type MaybeAsyncIterable } from 'react-async-iterators';
import { pipe } from 'shared-utils';
import './style.css';

export { PositionDataErrorPanel };

function PositionDataErrorPanel(props: {
  className?: string;
  errors?: MaybeAsyncIterable<undefined | { message?: string } | { message?: string }[]>;
}): React.ReactNode {
  const { className, errors } = props;

  return (
    <It value={errors}>
      {({ value: errors, error: sourceError }) =>
        pipe(
          sourceError ? sourceError : errors,
          errors => (Array.isArray(errors) ? errors : [errors]),
          errors => errors.filter(Boolean) as { message?: string }[],
          errors =>
            !errors.length ? (
              <></>
            ) : (
              <div className={`cmp-position-data-error-panel ${className ?? ''}`}>
                {errors.map((err: any, i) => (
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
        )
      }
    </It>
  );
}
