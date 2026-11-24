import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, setToken, clearToken } from '../api/client'
interface User { id: number; name: string; email: string }
interface AuthCtx { user: User | null; loading: boolean; login(e: string, p: string): Promise<void>; register(n: string, e: string, p: string): Promise<void>; logout(): void }
const Ctx = createContext<AuthCtx | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshUser = async () => { try { setUser(await api.get<User>('/auth/me')) } catch { setUser(null) } }
  useEffect(() => { if (localStorage.getItem('token')) refreshUser().finally(() => setLoading(false)); else setLoading(false) }, [])
  const login = async (email: string, password: string) => { const { token, user: u } = await api.post<{ token: string; user: User }>('/auth/login', { email, password }); setToken(token); setUser(u) }
  const register = async (name: string, email: string, password: string) => { const { token, user: u } = await api.post<{ token: string; user: User }>('/auth/register', { name, email, password }); setToken(token); setUser(u) }
  const logout = () => { clearToken(); setUser(null) }
  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
}
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('useAuth outside provider'); return c }
