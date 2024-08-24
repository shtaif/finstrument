import React from 'react';
import { useAsyncFn } from 'react-use';
import { Upload, UploadFile, Spin } from 'antd';
import { LoadingOutlined, UploadOutlined } from '@ant-design/icons';
import { graphql } from '../../../../generated/gql/index.ts';
import { SetTradesInputMode } from '../../../../generated/gql/graphql.ts';
import { gqlClient } from '../../../../utils/gqlClient/index.ts';
import './style.css';

export { UploadTrades };

function UploadTrades(props: {
  className?: string;
  style?: React.CSSProperties;
  onUploadSuccess?: () => void;
  onUploadFailure?: (err: unknown) => void;
}) {
  const [{ loading: isUploadingLedger }, uploadLedger] = useAsyncFn(
    async (file: UploadFile<any>) => {
      const fileContents: string = await (file as any).text();

      try {
        await gqlClient.mutate({
          variables: {
            input: {
              mode: SetTradesInputMode.Replace,
              data: { csv: fileContents },
            },
          },
          mutation: setTradesMutation,
        });

        await props.onUploadSuccess?.();
      } catch (err) {
        await props.onUploadFailure?.(err);
      }
    },
    [props.onUploadSuccess, props.onUploadFailure]
  );

  return (
    <Upload.Dragger
      className={`cmp-upload-trades-area ${props.className ?? ''}`}
      style={props.style}
      accept="text/csv"
      maxCount={1}
      showUploadList={false}
      beforeUpload={() => false}
      onChange={info => uploadLedger(info.file)}
    >
      {isUploadingLedger ? (
        <Spin indicator={<LoadingOutlined className="loading-spinner" spin />} />
      ) : (
        <>
          <div className="upload-icon-container">
            <UploadOutlined className="upload-icon" />
          </div>
          <div className="text-line">Import CSV Ledger</div>
        </>
      )}
    </Upload.Dragger>
  );
}

const setTradesMutation = graphql(/* GraphQL */ `
  mutation SetTradesMutation($input: SetTradesInput!) {
    setTrades(input: $input) {
      tradesAddedCount
      tradesModifiedCount
      tradesRemovedCount
    }
  }
`);
