import type { ThemeDefinition } from './theme.types'

function camelToKebab(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

export function buildCssVariables(themeDefinition: ThemeDefinition) {
  return Object.fromEntries(
    Object.entries(themeDefinition.palette).map(([key, value]) => [`--${camelToKebab(key)}`, value]),
  )
}

export function applyCssVariables(themeDefinition: ThemeDefinition, target: HTMLElement = document.documentElement) {
  const cssVariables = buildCssVariables(themeDefinition)
  Object.entries(cssVariables).forEach(([key, value]) => {
    target.style.setProperty(key, value)
  })
  target.dataset.theme = themeDefinition.mode
  target.style.setProperty('color-scheme', themeDefinition.mode)
  document.body.dataset.theme = themeDefinition.mode
}
