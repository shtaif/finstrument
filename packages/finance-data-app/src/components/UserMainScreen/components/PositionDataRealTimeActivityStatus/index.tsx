import React from 'react';
import { Iterate } from 'react-async-iterable';
import { DisconnectOutlined } from '@ant-design/icons';
import { BlippingIndicator } from '../../../common/BlippingIndicator/index.tsx';
import './style.css';

export { PositionDataRealTimeActivityStatus };

function PositionDataRealTimeActivityStatus(props: {
  input: AsyncIterable<unknown>;
}): React.ReactNode {
  return (
    <span className="cmp-position-data-real-time-activity-status">
      <Iterate value={props.input}>
        {next =>
          next.error ? (
            <>
              <DisconnectOutlined /> Issue connecting
            </>
          ) : next.pendingFirst || next.done ? (
            <>
              <BlippingIndicator className="indicator pending-state" blipping /> Pending...
            </>
          ) : (
            <>
              <BlippingIndicator className="indicator connected-state" blipping /> Connected
            </>
          )
        }
      </Iterate>
    </span>
  );
}
