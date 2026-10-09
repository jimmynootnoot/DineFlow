import { supabase } from './supabase';

export async function serverRequest(path,body) {
  const { data:{session},error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(`/api/${path}`,{ method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(45000) });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The online service is unavailable. Check the Vercel deployment and try again.');
  }
  const result = await response.json();
  if (!response.ok) {
    if (result.protection?.vercel_auth_enabled) {
      throw new Error('Vercel Deployment Protection is blocking the online service. Make the production deployment public, then try again.');
    }
    throw new Error(result.error || 'The online service could not complete the request. Please try again.');
  }
  return result;
}
export function downloadText(filename,text,type='text/plain') {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const a = document.createElement('a'); a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
};
