/**
 * Cliente HTTP para la API de Medilu (Express).
 *
 * - `credentials: 'include'` en todas las llamadas: la sesión vive en una cookie
 *   httpOnly del backend. En desarrollo, Vite hace proxy (mismo origen) para que
 *   la cookie viaje; en producción el SPA se sirve desde el mismo Express.
 * - Rutas relativas (sin host): funcionan igual en dev (proxy) y prod (same-origin).
 */

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data
  }
}

type Json = Record<string, unknown> | unknown[]

async function request<T = unknown>(
  method: string,
  path: string,
  body?: Json | FormData
): Promise<T> {
  const headers: Record<string, string> = {}
  let payload: BodyInit | undefined

  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }

  const res = await fetch(path, {
    method,
    headers,
    body: payload,
    credentials: "include",
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" &&
        ((data as Record<string, unknown>).error as string ||
          (data as Record<string, unknown>).message as string)) ||
      res.statusText ||
      "Error de red"
    throw new ApiError(String(msg), res.status, data)
  }

  return data as T
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: Json) => request<T>("POST", path, body),
  put: <T = unknown>(path: string, body?: Json) => request<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body?: Json) => request<T>("PATCH", path, body),
  del: <T = unknown>(path: string) => request<T>("DELETE", path),
  upload: <T = unknown>(path: string, form: FormData) => request<T>("POST", path, form),
}
