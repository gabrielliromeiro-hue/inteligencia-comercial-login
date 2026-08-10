import { createClient } from "@supabase/supabase-js";

// As chaves NÃO ficam escritas aqui. Elas vêm de variáveis de ambiente,
// configuradas no Netlify. Isso mantém as credenciais fora do código.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigurado = !!(url && key);

export const supabase = supabaseConfigurado
  ? createClient(url, key)
  : null;
