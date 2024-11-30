import React, { useMemo } from 'react';
import { range } from 'lodash-es';
import { Skeleton } from 'antd';
import { type MaybeAsyncIterable } from 'iterable-operators';
import { Iterate } from 'react-async-iterable';
import { LotItem, type LotItemProps } from './LotItem/index.tsx';
import './style.css';

export {
  PositionExpandedLots,
  type PositionExpandedLotsProps,
  type LotItem,
  type InputLotsFnWithDeps,
};

function PositionExpandedLots(props: PositionExpandedLotsProps): React.ReactElement {
  const { lots } = props;

  const resolvedExpandedPositions = useMemo(() => lots[0](), lots[1]);

  return (
    <div className="cmp-position-exapnded-lots">
      <Iterate value={resolvedExpandedPositions} initialValue={[] as LotItem[]}>
        {({ value, pendingFirst }) =>
          pendingFirst
            ? range(2).map(i => <Skeleton key={i} active title={false} paragraph={{ rows: 4 }} />)
            : value.map(lot => (
                <LotItem
                  className="lot-item"
                  key={lot.id}
                  date={lot.date}
                  originalQty={lot.originalQty}
                  remainingQty={lot.remainingQty}
                  currency={lot.currency}
                  unrealizedPnl={lot.unrealizedPnl}
                />
              ))
        }
      </Iterate>
    </div>
  );
}

type PositionExpandedLotsProps = {
  lots: InputLotsFnWithDeps;
};

type InputLotsFnWithDeps = [fn: () => MaybeAsyncIterable<LotItem[]>, deps: unknown[]];

type LotItem = LotItemProps & { id: string };
