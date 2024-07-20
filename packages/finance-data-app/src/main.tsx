import ReactDOM from 'react-dom/client';
import { ConfigProvider as AntdConfigProvider, theme } from 'antd';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <AntdConfigProvider
    theme={{
      algorithm: theme.darkAlgorithm,
    }}
  >
    <App />
  </AntdConfigProvider>
);
