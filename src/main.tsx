// localStorage 兜底守卫必须最先导入：Zustand store 在模块初始化阶段就会
// 访问 localStorage，晚于本文件的任何 import 链（见 storage-guard.ts 头注释）
import './utils/storage-guard';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/variables.css';
import './styles/themes/index.css';
import './styles/globals.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
