import React from 'react';
import { Iterate } from 'react-async-iterable';
import { DisconnectOutlined } from '@ant-design/icons';

export { HoldingStatsRealTimeActivityStatus };

function HoldingStatsRealTimeActivityStatus(props: {
  input: AsyncIterable<unknown>;
}): React.ReactNode {
  return (
    <Iterate value={props.input}>
      {next =>
        next.error ? null : next.pendingFirst || next.done ? (
          <>⚪️ Pending...</>
        ) : next.error ? (
          <>
            <DisconnectOutlined /> Issue connecting
          </>
        ) : (
          <>🟢 Connected</>
        )
      }
    </Iterate>
  );
}
