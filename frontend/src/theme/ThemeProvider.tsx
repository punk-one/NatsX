import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useI18n } from '../i18n/I18nProvider'
import { getAntdThemeConfig } from './antdTheme'
import { applyCssVariables } from './cssVariables'
import { darkTheme } from './theme.dark'
import { lightTheme } from './theme.light'
import type { ResolvedTheme, ThemeDefinition, ThemeMode } from './theme.types'

const storageKey = 'natsx.themeMode'

interface ThemeContextValue {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (nextThemeMode: ThemeMode) => void
  themeDefinition: ThemeDefinition
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const storedThemeMode = window.localStorage.getItem(storageKey)
  if (storedThemeMode === 'light' || storedThemeMode === 'dark' || storedThemeMode === 'system') {
    return storedThemeMode
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { language } = useI18n()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode())
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    setSystemTheme(mediaQueryList.matches ? 'dark' : 'light')

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }

    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, themeMode)
    }
  }, [themeMode])

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode
  const themeDefinition = resolvedTheme === 'dark' ? darkTheme : lightTheme
  const antdLocale = language === 'en-US' ? enUS : zhCN

  useEffect(() => {
    applyCssVariables(themeDefinition)
  }, [themeDefinition])

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      themeDefinition,
    }),
    [resolvedTheme, themeDefinition, themeMode],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      <ConfigProvider locale={antdLocale} theme={getAntdThemeConfig(themeDefinition)}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const contextValue = useContext(ThemeContext)
  if (!contextValue) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return contextValue
}
