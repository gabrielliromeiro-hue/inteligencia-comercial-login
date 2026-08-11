import { supabase } from "./supabase.js";

/* ============================================================
   Camada de dados. Traduz entre o formato do app (chaves tipo
   "2026.1|sal|vtr") e as tabelas do banco. O app não fala SQL:
   fala com estas funções.
   ============================================================ */

// ---------- AUTENTICAÇÃO ----------
export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}
export async function sair() {
  await supabase.auth.signOut();
}
export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export async function meuPerfil() {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data, error } = await supabase.from("perfis").select("*").eq("id", s.session.user.id).single();
  if (error) return null;
  return data;
}

// ---------- ADMIN: gestão de usuários ----------
export async function listarUsuarios() {
  const { data, error } = await supabase.from("perfis").select("*").order("criado_em");
  if (error) throw error;
  return data;
}
export async function mudarPapel(id, papel) {
  const { error } = await supabase.from("perfis").update({ papel }).eq("id", id);
  if (error) throw error;
}
export async function mudarAtivo(id, ativo) {
  const { error } = await supabase.from("perfis").update({ ativo }).eq("id", id);
  if (error) throw error;
}

// ---------- CARREGAR TUDO ----------
export async function carregarTudo() {
  const [uni, proc, can, funil, canal, metas, cfg] = await Promise.all([
    supabase.from("unidades").select("*").order("ordem"),
    supabase.from("processos").select("*").order("ordem"),
    supabase.from("canais").select("*").order("ordem"),
    supabase.from("funil_hist").select("*"),
    supabase.from("canal_hist").select("*"),
    supabase.from("metas").select("*"),
    supabase.from("config").select("*").single(),
  ]);
  const err = [uni, proc, can, funil, canal, metas, cfg].find((r) => r.error);
  if (err) throw err.error;

  // reidrata para o formato do app
  const funilMap = {}, canalMap = {}, metaMap = {};
  (funil.data || []).forEach((r) => {
    funilMap[`${r.ciclo}|${r.unidade_id}|${r.processo_id}`] = { vagas: r.vagas, insc: r.inscricoes, pagas: r.insc_pagas, matric: r.matriculas };
  });
  (canal.data || []).forEach((r) => {
    canalMap[`${r.ciclo}|${r.unidade_id}|${r.canal_id}`] = { inv: r.investimento, leads: r.leads, pagas: r.insc_pagas, matric: r.matriculas };
  });
  (metas.data || []).forEach((r) => {
    const k = `${r.ciclo_alvo}|${r.unidade_id}`;
    const base = { vagas: r.vagas, matric: r.meta_matriculas, verba: r.verba };
    Object.entries(r.shares_processo || {}).forEach(([pid, v]) => (base[`sh_${pid}`] = v));
    Object.entries(r.shares_canal || {}).forEach(([cid, v]) => (base[`ch_${cid}`] = v));
    metaMap[k] = base;
  });

  const c = cfg.data || {};
  return {
    unidades: (uni.data || []).map((u) => ({ id: u.id, nome: u.nome, mensalidade: Number(u.mensalidade) })),
    processos: (proc.data || []).map((p) => ({ id: p.id, nome: p.nome, ocupaVaga: p.ocupa_vaga !== false })),
    canais: (can.data || []).map((x) => ({ id: x.id, nome: x.nome, pago: x.pago, beta: Number(x.beta) })),
    ciclos: c.ciclos || ["2024.1", "2024.2", "2025.1", "2025.2", "2026.1", "2026.2"],
    alvos: c.alvos || ["2027.1", "2027.2", "2028.1"],
    funil: funilMap, canal: canalMap, meta: metaMap,
    cfg: {
      alvo: (c.alvos || ["2027.1"])[0], somenteHomologos: c.somente_homologos ?? true,
      saturacao: c.saturacao ?? true, pesos: c.pesos || [0.5, 0.3, 0.2],
      ganhoConv: Number(c.ganho_conv_pct || 0), cenario: 100,
      inflacao: Object.fromEntries((can.data || []).map((x) => [x.id, Number(x.reajuste)])),
    },
  };
}

// ---------- SALVAR (upserts pontuais) ----------
export async function salvarFunil(ciclo, uniId, procId, campos) {
  const row = { ciclo, unidade_id: uniId, processo_id: procId,
    vagas: n(campos.vagas), inscricoes: n(campos.insc), insc_pagas: n(campos.pagas), matriculas: n(campos.matric),
    atualizado_em: new Date().toISOString() };
  const { error } = await supabase.from("funil_hist").upsert(row, { onConflict: "unidade_id,processo_id,ciclo" });
  if (error) throw error;
}
export async function salvarCanal(ciclo, uniId, canId, campos) {
  const row = { ciclo, unidade_id: uniId, canal_id: canId,
    investimento: n(campos.inv), leads: n(campos.leads), insc_pagas: n(campos.pagas), matriculas: n(campos.matric),
    atualizado_em: new Date().toISOString() };
  const { error } = await supabase.from("canal_hist").upsert(row, { onConflict: "unidade_id,canal_id,ciclo" });
  if (error) throw error;
}
export async function salvarMeta(alvo, uniId, m, procIds, canIds) {
  const shP = {}, shC = {};
  procIds.forEach((id) => { if (n(m[`sh_${id}`]) > 0) shP[id] = n(m[`sh_${id}`]); });
  canIds.forEach((id) => { if (n(m[`ch_${id}`]) > 0) shC[id] = n(m[`ch_${id}`]); });
  const row = { unidade_id: uniId, ciclo_alvo: alvo, vagas: n(m.vagas), meta_matriculas: n(m.matric),
    verba: n(m.verba), shares_processo: shP, shares_canal: shC, atualizado_em: new Date().toISOString() };
  const { error } = await supabase.from("metas").upsert(row, { onConflict: "unidade_id,ciclo_alvo" });
  if (error) throw error;
}
export async function salvarConfig(cfg, ciclos, alvos) {
  const { error } = await supabase.from("config").update({
    somente_homologos: cfg.somenteHomologos, saturacao: cfg.saturacao,
    pesos: cfg.pesos, ganho_conv_pct: cfg.ganhoConv, ciclos, alvos,
    atualizado_em: new Date().toISOString(),
  }).eq("id", 1);
  if (error) throw error;
}

// ---------- CRUD de cadastros ----------
export async function addUnidade(nome) { const { error } = await supabase.from("unidades").insert({ nome }); if (error) throw error; }
export async function updUnidade(id, campos) { const { error } = await supabase.from("unidades").update(campos).eq("id", id); if (error) throw error; }
export async function delUnidade(id) { const { error } = await supabase.from("unidades").delete().eq("id", id); if (error) throw error; }
export async function addProcesso(nome) { const { error } = await supabase.from("processos").insert({ nome }); if (error) throw error; }
export async function updProcesso(id, campos) { const { error } = await supabase.from("processos").update(campos).eq("id", id); if (error) throw error; }
export async function delProcesso(id) { const { error } = await supabase.from("processos").delete().eq("id", id); if (error) throw error; }
export async function addCanal(nome) { const { error } = await supabase.from("canais").insert({ nome, pago: true, beta: 0.2, reajuste: 0.07 }); if (error) throw error; }
export async function updCanal(id, campos) { const { error } = await supabase.from("canais").update(campos).eq("id", id); if (error) throw error; }
export async function delCanal(id) { const { error } = await supabase.from("canais").delete().eq("id", id); if (error) throw error; }

function n(v) {
  if (v === "" || v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const x = parseFloat(s); return isFinite(x) ? x : 0;
}
