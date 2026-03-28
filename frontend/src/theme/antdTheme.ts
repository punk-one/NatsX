import { theme as antdTheme, type ThemeConfig } from 'antd'

import type { ThemeDefinition } from './theme.types'

export function getAntdThemeConfig(themeDefinition: ThemeDefinition): ThemeConfig {
  const { palette } = themeDefinition

  return {
    algorithm: themeDefinition.mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.colorPrimary,
      colorSuccess: palette.colorSuccess,
      colorWarning: palette.colorWarning,
      colorError: palette.colorError,
      colorInfo: palette.colorInfo,
      colorBgBase: palette.colorBgApp,
      colorBgLayout: palette.colorBgPage,
      colorBgContainer: palette.colorBgPanel,
      colorBgElevated: palette.colorBgElevated,
      colorText: palette.colorText,
      colorTextSecondary: palette.colorTextTertiary,
      colorTextTertiary: palette.colorTextQuaternary,
      colorBorder: palette.colorBorder,
      colorBorderSecondary: palette.colorBorderSecondary,
      borderRadius: themeDefinition.borderRadius,
      controlHeight: themeDefinition.controlHeight,
      fontSize: themeDefinition.fontSize,
      wireframe: false,
    },
    components: {
      Button: {
        defaultBg: palette.colorBgPanel,
        defaultBorderColor: palette.colorInputBorder,
        defaultColor: palette.colorTextSecondary,
        primaryColor: palette.colorTextInverse,
        primaryShadow: 'none',
      },
      Card: {
        colorBgContainer: palette.colorBgPanel,
        headerBg: 'transparent',
      },
      Dropdown: {
        colorBgElevated: palette.colorBgElevated,
      },
      Input: {
        activeBorderColor: palette.colorPrimary,
        hoverBorderColor: palette.colorPrimaryHover,
        colorBgContainer: palette.colorInputBg,
        colorTextPlaceholder: palette.colorInputPlaceholder,
      },
      Modal: {
        contentBg: palette.colorBgElevated,
        headerBg: palette.colorBgElevated,
        titleColor: palette.colorText,
      },
      Segmented: {
        itemSelectedBg: palette.colorPrimaryBg,
        itemSelectedColor: palette.colorPrimary,
        trackBg: palette.colorBgPanelSecondary,
      },
      Select: {
        optionSelectedBg: palette.colorPrimaryBg,
        optionActiveBg: palette.colorBgPanelSecondary,
      },
      Table: {
        headerBg: palette.colorTableHeaderBg,
        headerColor: palette.colorTableHeaderText,
      },
      Tag: {
        defaultBg: palette.colorBgPanelSecondary,
        defaultColor: palette.colorTextSecondary,
      },
      Tooltip: {
        colorBgSpotlight: themeDefinition.mode === 'dark' ? palette.colorBgPanelSecondary : palette.colorText,
      },
    },
  }
}
