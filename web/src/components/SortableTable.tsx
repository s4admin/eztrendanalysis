import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export interface SortState { key: string; dir: SortDir }

// A sort value; return an array to break ties on later elements (e.g. [date, time])
type SortValue = string | number | null | undefined | (string | number | null | undefined)[]
export type SortGetters<T> = Record<string, (row: T) => SortValue>

function compareValues(a: SortValue, b: SortValue): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const c = compareValues(a[i], b[i])
      if (c) return c
    }
    return 0
  }
  if (a == null || a === '') return b == null || b === '' ? 0 : 1 // empty values sort last
  if (b == null || b === '') return -1
  const na = Number(a), nb = Number(b)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

export function useSortable<T>(rows: T[], getters: SortGetters<T>, initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial)
  const sorted = useMemo(() => {
    const get = getters[sort.key]
    if (!get) return rows
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => sign * compareValues(get(a), get(b)))
  }, [rows, sort]) // getters are static per table
  const toggle = (key: string) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { sorted, sort, toggle }
}

export function SortTh({ label, sortKey, sort, onSort, className = '' }: {
  label: string
  sortKey?: string
  sort: SortState
  onSort: (key: string) => void
  className?: string
}) {
  if (!sortKey) return <th className={className}>{label}</th>
  const active = sort.key === sortKey
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1 [text-transform:inherit] [letter-spacing:inherit] hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}>
        {label}
        <span className={active ? '' : 'opacity-30'}>{active && sort.dir === 'desc' ? '▼' : '▲'}</span>
      </button>
    </th>
  )
}
