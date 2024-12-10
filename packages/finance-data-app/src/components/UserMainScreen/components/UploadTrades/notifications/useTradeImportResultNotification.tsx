import React from 'react';
import { notification } from 'antd';

export { useTradeImportResultNotification };

function useTradeImportResultNotification() {
  const [notif, notifPlacement] = notification.useNotification();

  const notifShow = () => {
    notif.success({
      key: 'trade_import_success_notification',
      message: <>Trades imported successfully</>,
    });
  };

  const notifShowWithError = (error: any) => {
    const gqlError = error.graphQLErrors?.[0]?.extensions;

    if (gqlError?.code === 'DUPLICATE_TRADES') {
      notif.error({
        key: 'trade_import_error_notification',
        message: (
          <>Importing multiple trades with the same symbol and date combination is not supported</>
        ),
      });
    } else {
      notif.error({
        key: 'trade_import_error_notification',
        message: <>Couldn't import trades; an internal error occurred</>,
      });
    }
  };

  return {
    show: notifShow,
    showWithError: notifShowWithError,
    placement: notifPlacement,
  };
}
