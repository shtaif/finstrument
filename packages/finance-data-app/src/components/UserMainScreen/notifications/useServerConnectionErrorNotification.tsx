import React from 'react';
import { notification } from 'antd';

export { useServerConnectionErrorNotification };

function useServerConnectionErrorNotification() {
  const [notif, notifPlacement] = notification.useNotification();

  const notifShow = () =>
    notif.error({
      key: 'server_data_connection_error_notification',
      message: <>Error</>,
      description: <>Couldn't connect to server data stream</>,
    });

  return {
    show: notifShow,
    placement: notifPlacement,
  };
}
