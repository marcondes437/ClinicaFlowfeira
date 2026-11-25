import type { SupabaseClient } from '@supabase/supabase-js';

export type Filter = { column: string; op: string; value: unknown };
export type Operation = {
  table?: string; rpc?: string; args?: Record<string, unknown>;
  method?: 'select' | 'insert' | 'update'; values?: Record<string, unknown>;
  columns?: string; filters?: Filter[]; or?: string;
  orders?: { column: string; ascending: boolean }[];
  limit?: number; offset?: number; count?: boolean; head?: boolean;
  single?: 'required' | 'optional';
};
export type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Transport = (operation: Operation) => Promise<Result>;

// Small compatibility layer for the query calls already used by the screens.
// SQL execution and access control live exclusively on the server.
class Query implements PromiseLike<Result> {
  constructor(private send: Transport, private op: Operation) {}
  select(columns = '*', options?: { count?: string; head?: boolean }) { this.op.columns = columns; this.op.count = Boolean(options?.count); this.op.head = options?.head; return this; }
  insert(values: Record<string, unknown>) { this.op.method = 'insert'; this.op.values = values; return this; }
  update(values: Record<string, unknown>) { this.op.method = 'update'; this.op.values = values; return this; }
  private filter(column: string, op: string, value: unknown) { (this.op.filters ??= []).push({ column, op, value }); return this; }
  eq(c: string, v: unknown) { return this.filter(c, 'eq', v); }
  gt(c: string, v: unknown) { return this.filter(c, 'gt', v); }
  gte(c: string, v: unknown) { return this.filter(c, 'gte', v); }
  lt(c: string, v: unknown) { return this.filter(c, 'lt', v); }
  lte(c: string, v: unknown) { return this.filter(c, 'lte', v); }
  in(c: string, v: unknown[]) { return this.filter(c, 'in', v); }
  is(c: string, v: unknown) { return this.filter(c, 'is', v); }
  not(c: string, op: string, v: unknown) { if (op !== 'is') throw new Error('Filtro não suportado'); return this.filter(c, 'not_is', v); }
  ilike(c: string, v: unknown) { return this.filter(c, 'ilike', v); }
  or(value: string) { this.op.or = value; return this; }
  order(column: string, options?: { ascending?: boolean }) { (this.op.orders ??= []).push({ column, ascending: options?.ascending !== false }); return this; }
  limit(n: number) { this.op.limit = n; return this; }
  range(start: number, end: number) { this.op.offset = start; this.op.limit = end - start + 1; return this; }
  single() { this.op.single = 'required'; return this; }
  maybeSingle() { this.op.single = 'optional'; return this; }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { return this.send(this.op).then(onfulfilled, onrejected); }
}

export function localClient(send: Transport, auth: unknown): SupabaseClient {
  return { from: (table: string) => new Query(send, { table, method: 'select' }), rpc: (rpc: string, args?: Record<string, unknown>) => send({ rpc, args }), auth } as unknown as SupabaseClient;
}
