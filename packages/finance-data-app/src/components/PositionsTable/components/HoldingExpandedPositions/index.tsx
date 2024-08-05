import React, { useMemo, type ReactElement } from 'react';
import { range } from 'lodash-es';
import { Skeleton } from 'antd';
import { ExtractAsyncIterableValue } from 'iterable-operators';
import { Iterate } from '../../../../utils/react-async-iterable';

export { HoldingExpandedPositions, type HoldingExpandedPositionsProps, type ExpandedPosition };

function HoldingExpandedPositions(props: HoldingExpandedPositionsProps): ReactElement {
  const { positions } = props;

  const resolvedExpandedPositions =
    positions && !Array.isArray(positions)
      ? useMemo(() => positions.iter[0](), positions.iter[1])
      : useMemo(() => positions, []);

  return (
    <Iterate
      value={resolvedExpandedPositions}
      initialValue={[] as ExtractAsyncIterableValue<typeof resolvedExpandedPositions>}
    >
      {({ value, pendingFirst }) =>
        pendingFirst ? (
          range(2).map(i => <Skeleton key={i} active title={false} paragraph={{ rows: 4 }} />)
        ) : (
          <pre>
            {value.map(pos => (
              <div key={pos.id}>{JSON.stringify(pos, undefined, 2)}</div>
            ))}
          </pre>
        )
      }
    </Iterate>
  );
}

type HoldingExpandedPositionsProps = {
  positions: ExpandedPosition[] | { iter: PositionIterableFnWithDeps };
};

type PositionIterableFnWithDeps = [fn: () => AsyncIterable<ExpandedPosition[]>, deps: unknown[]];

type ExpandedPosition = {
  id: string;
  date?: Date | string | number;
  quantity?: number;
  price?: number;
  unrealizedPnl?: {
    amount?: number;
    percent?: number;
  };
};
