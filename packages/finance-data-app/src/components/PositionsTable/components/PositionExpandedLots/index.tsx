import React, { useMemo, type DependencyList } from 'react';
import { range } from 'lodash-es';
import { Skeleton } from 'antd';
import { It, type MaybeAsyncIterable } from 'react-async-iterators';
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

  const [fn, deps] = lots ?? [() => undefined, []];

  const resolvedExpandedPositions = useMemo(() => fn(), deps);

  return (
    <div className="cmp-position-exapnded-lots">
      <It value={resolvedExpandedPositions} initialValue={[] as LotItem[]}>
        {({ value, pendingFirst }) =>
          pendingFirst
            ? range(2).map(i => <Skeleton key={i} active title={false} paragraph={{ rows: 4 }} />)
            : value?.map(lot => (
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
      </It>
    </div>
  );
}

type PositionExpandedLotsProps = {
  lots?: InputLotsFnWithDeps;
};

type InputLotsFnWithDeps = [fn: () => MaybeAsyncIterable<LotItem[]>, deps: DependencyList];

type LotItem = LotItemProps & { id: string };
