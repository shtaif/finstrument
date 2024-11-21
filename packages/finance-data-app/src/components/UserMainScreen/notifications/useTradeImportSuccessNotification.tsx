import React from 'react';
import { notification } from 'antd';

export { useTradeImportSuccessNotification };

function useTradeImportSuccessNotification() {
  const [notif, notifPlacement] = notification.useNotification();

  const notifShow = () =>
    notif.success({
      key: 'trade_import_success_notification',
      message: <>Trades imported successfully</>,
    });

  return {
    show: notifShow,
    placement: notifPlacement,
  };
}
