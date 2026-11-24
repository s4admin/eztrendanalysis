const BASE = '/api'
function getToken() { return localStorage.getItem('token') }
export function setToken(t: string) { localStorage.setItem('token', t) }
export function clearToken() { localStorage.removeItem('token') }
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(BASE + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined })
  if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Unauthorized') }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || 'Request failed'), { status: res.status }) }
  if (res.status === 204) return undefined as T
  return res.json()
}
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  // Fetch a file (e.g. a PDF report) and save it using the server's filename
  download: async (path: string, fallbackName: string): Promise<void> => {
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers['Authorization'] = 'Bearer ' + token
    const res = await fetch(BASE + path, { headers })
    if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Unauthorized') }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed') }
    const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  },
  uploadFile: async <T>(path: string, formData: FormData): Promise<T> => {
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers['Authorization'] = 'Bearer ' + token
    const res = await fetch(BASE + path, { method: 'POST', headers, body: formData })
    if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Unauthorized') }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw Object.assign(new Error(e.error || 'Upload failed'), { status: res.status }) }
    return res.json()
  }
}
