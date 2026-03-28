import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp } from 'antd'

import App from './App'
import { I18nProvider } from './i18n/I18nProvider'
import './styles.css'
import { ThemeProvider } from './theme/ThemeProvider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <AntdApp>
          <App />
        </AntdApp>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
)
