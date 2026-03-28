declare global {
  interface Window {
    go?: {
      main?: {
        App?: Record<string, (...args: unknown[]) => Promise<unknown>>
      }
    }
  }
}

declare module '*.svg' {
  const src: string
  export default src
}

export {}
