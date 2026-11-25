"use client";
import { localClient, type Operation } from './protocol';
async function call(action: string, payload: unknown = {}) {
  try {
    const response = await fetch('/api/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    return await response.json();
  } catch { return { data: null, error: { message: 'Não foi possível acessar o servidor local.' } }; }
}
export function createClient() {
  return localClient((op: Operation) => call('query', op), {
    signInWithPassword: (payload: unknown) => call('login', payload),
    signUp: (payload: unknown) => call('signup', payload),
    signOut: () => call('logout'),
    updateUser: (payload: unknown) => call('password', payload),
    resetPasswordForEmail: async () => ({ error: { message: 'Sem envio de e-mail no modo local. Solicite a redefinição ao responsável pelo computador.' } }),
    signInWithOAuth: async () => ({ error: { message: 'Use e-mail e senha locais. Google exige internet.' } }),
  });
}
