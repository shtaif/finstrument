import React from 'react';
import { Alert } from 'antd';
import './style.css';

export { HoldingDataErrorPanel };

function HoldingDataErrorPanel(props: {
  className?: string;
  errors?: readonly { readonly message?: string }[];
}): React.ReactNode {
  const { className, errors } = props;

  return (
    errors?.length && (
      <div className={`cmp-holding-data-error-panel ${className ?? ''}`}>
        {(Array.isArray(errors) ? errors : [errors]).map((err: any, i) => (
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
