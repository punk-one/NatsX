export function matchNatsSubject(subject: string, pattern: string): boolean {
  const normalizedSubject = subject.trim()
  const normalizedPattern = pattern.trim()

  if (!normalizedPattern) {
    return true
  }

  const subjectTokens = normalizedSubject.split('.')
  const patternTokens = normalizedPattern.split('.')

  for (let index = 0; index < patternTokens.length; index += 1) {
    const patternToken = patternTokens[index]
    const subjectToken = subjectTokens[index]

    if (patternToken === '>') {
      return index === patternTokens.length - 1
    }

    if (subjectToken === undefined) {
      return false
    }

    if (patternToken === '*') {
      continue
    }

    if (patternToken !== subjectToken) {
      return false
    }
  }

  return subjectTokens.length === patternTokens.length
}

export function parseHeaderText(headerText?: string): Record<string, string> | undefined {
  const headers = headerText
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, line) => {
      const [key, ...rest] = line.split(':')
      if (!key || rest.length === 0) {
        return accumulator
      }
      accumulator[key.trim()] = rest.join(':').trim()
      return accumulator
    }, {})

  return headers && Object.keys(headers).length > 0 ? headers : undefined
}

export function formatHeaders(headers?: Record<string, string[]>): string {
  if (!headers || Object.keys(headers).length === 0) {
    return '-'
  }

  return Object.entries(headers)
    .map(([key, values]) => `${key}: ${values.join(', ')}`)
    .join('\n')
}
