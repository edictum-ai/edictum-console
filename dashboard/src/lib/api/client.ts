export const API_BASE = "/api/v1"

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public retryAfter?: number,
  ) {
    super(`API Error ${status}: ${body}`)
    this.name = "ApiError"
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text()
    const retryAfter = res.headers.get("Retry-After")
    throw new ApiError(
      res.status,
      body,
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    )
  }

  return res.json() as Promise<T>
}

export async function requestVoid(
  path: string,
  options: RequestInit = {},
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text()
    const retryAfter = res.headers.get("Retry-After")
    throw new ApiError(
      res.status,
      body,
      retryAfter ? parseInt(retryAfter, 10) : undefined,
    )
  }
}
