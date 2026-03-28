import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { messages, supportedLanguages, type LanguageCode } from './messages'

const storageKey = 'natsx.language'

type MessageParams = Record<string, string | number>

interface I18nContextValue {
  language: LanguageCode
  setLanguage: (nextLanguage: LanguageCode) => void
  t: (key: string, params?: MessageParams) => string
  supportedLanguages: typeof supportedLanguages
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

function getStoredLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return 'zh-CN'
  }

  const storedLanguage = window.localStorage.getItem(storageKey)
  return storedLanguage === 'en-US' ? 'en-US' : 'zh-CN'
}

function lookupMessage(language: LanguageCode, key: string): string | undefined {
  const parts = key.split('.')
  let current: unknown = messages[language]

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params?: MessageParams) {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => getStoredLanguage())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, language)
    }
  }, [language])

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: string, params?: MessageParams) => {
        const value = lookupMessage(language, key) ?? lookupMessage('zh-CN', key) ?? key
        return interpolate(value, params)
      },
      supportedLanguages,
    }),
    [language],
  )

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const contextValue = useContext(I18nContext)
  if (!contextValue) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return contextValue
}
