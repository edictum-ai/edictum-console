import { useState, useRef, useCallback, useEffect } from "react"
import * as yaml from "js-yaml"

export interface YamlValidation {
  valid: boolean
  error?: string
  line?: number
}

/**
 * Debounced YAML validation hook. Returns current validation state
 * and a `validate` function to call on content changes.
 */
export function useYamlValidation(debounceMs = 300) {
  const [validation, setValidation] = useState<YamlValidation>({ valid: true })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const validate = useCallback(
    (val: string) => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (!val.trim()) {
          setValidation({ valid: true })
          return
        }
        try {
          yaml.load(val)
          setValidation({ valid: true })
        } catch (e) {
          const msg =
            e instanceof yaml.YAMLException ? e.message : "Invalid YAML"
          const line =
            e instanceof yaml.YAMLException
              ? (e.mark?.line ?? 0) + 1
              : undefined
          setValidation({ valid: false, error: msg, line })
        }
      }, debounceMs)
    },
    [debounceMs],
  )

  const reset = useCallback(() => setValidation({ valid: true }), [])

  return { validation, validate, reset }
}
