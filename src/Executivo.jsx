import React, { useState, useEffect, useMemo } from "react";
import * as E from "./lib/engine-core.js";
import { carregarTudo } from "./lib/dados.js";

const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
const pct = (n, d = 0) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
const brl = (n) => (isFinite(n) ? "R$ " + Math.round(n).toLocaleString("pt-BR") : "—");
const brlK = (n) => { if (!isFinite(n)) return "—"; if (Math.abs(n) >= 1e6) return "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi"; if (Math.abs(n) >= 1e3) return "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil"; return brl(n); };
const div = E.safeDiv;
const num = E.parseNum;

const PALETA = ["#0F5F4E", "#2E8B72", "#5AAD95", "#8A6100", "#B08A3E", "#4A5C57", "#7D8F89"];

export default function Executivo() {
  const [st, setSt] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarTudo().then(setSt).catch((e) => setErro(e.message || String(e)));
  }, []);

  const dados = useMemo(() => {
    if (!st) return null;
    const cfg = st.cfg;
    const semAlvo = String(cfg.alvo).split(".")[1];
    let base = st.ciclos.filter((c) => c < cfg.alvo);
    if (cfg.somenteHomologos) base = base.filter((c) => c.split(".")[1] === semAlvo);
    base = base.sort().reverse().slice(0, Math.max(3, cfg.pesos.length));
    const g = (obj, k, campo) => num((obj[k] || {})[campo]);

    const cicloUni = (cic, u) => {
      const linhas = st.processos.map((p) => { const k = `${cic}|${u}|${p.id}`; return { p, insc: g(st.funil, k, "insc"), pagas: g(st.funil, k, "pagas"), matric: g(st.funil, k, "matric") }; });
      const T = linhas.reduce((a, l) => ({ insc: a.insc + l.insc, pagas: a.pagas + l.pagas, matric: a.matric + l.matric }), { insc: 0, pagas: 0, matric: 0 });
      return { linhas, T, temDado: T.insc + T.pagas + T.matric > 0 };
    };
    const cicloCanal = (cic, u) => {
      const linhas = st.canais.map((c) => { const k = `${cic}|${u}|${c.id}`; return { c, inv: g(st.canal, k, "inv"), matric: g(st.canal, k, "matric") }; });
      const T = linhas.reduce((a, l) => ({ inv: a.inv + l.inv, matric: a.matric + l.matric }), { inv: 0, matric: 0 });
      return { linhas, T, temDado: T.inv + T.matric > 0 };
    };
    const plano = (u) => {
      const csF = base.filter((c) => cicloUni(c, u).temDado);
      const csC = base.filter((c) => cicloCanal(c, u).temDado);
      const cyclesF = csF.map((c) => { const x = cicloUni(c, u); const pp = {}; x.linhas.forEach((l) => (pp[l.p.id] = { insc: l.insc, pagas: l.pagas, matric: l.matric })); return { porProc: pp, totalMatric: x.T.matric }; });
      const cyclesC = csC.map((c) => { const x = cicloCanal(c, u); const pc = {}; x.linhas.forEach((l) => (pc[l.c.id] = { inv: l.inv, matric: l.matric })); return { porCanal: pc, totalMatric: x.T.matric }; });
      const procIds = st.processos.map((p) => p.id), canIds = st.canais.map((c) => c.id);
      const rf = E.buildFunnelRef(cyclesF, procIds, cfg.pesos);
      const rc = E.buildChannelRef(cyclesC, canIds, cfg.pesos);
      const anos = E.yearsBetween(csF[0] || csC[0] || null, cfg.alvo);
      const m = st.meta[`${cfg.alvo}|${u}`] || {};
      const metaMatric = num(m.matric) * (cfg.cenario / 100);
      const ganho = 1 + (cfg.ganhoConv || 0) / 100;
      const shP = E.resolveShares(rf.share, {}, procIds), shC = E.resolveShares(rc.share, {}, canIds);
      const proc = st.processos.map((p) => ({ p, share: shP.shares[p.id] || 0, mat: metaMatric * (shP.shares[p.id] || 0) }));
      const can = st.canais.map((cn) => {
        const share = shC.shares[cn.id] || 0; const mat = metaMatric * share;
        const infl = cfg.inflacao[cn.id] !== undefined ? cfg.inflacao[cn.id] : 0.07;
        const pj = E.projectCAC(rc.cac[cn.id], infl, anos, cn.beta, mat, rc.matBase[cn.id], cfg.saturacao);
        return { cn, share, mat, inv: isFinite(pj.cacProj) ? mat * pj.cacProj : 0 };
      });
      const invTotal = can.reduce((a, x) => a + (isFinite(x.inv) ? x.inv : 0), 0);
      const matPaga = can.filter((x) => x.cn.pago).reduce((a, x) => a + x.mat, 0);
      const mens = (st.unidades.find((x) => x.id === u) || {}).mensalidade || 0;
      return { uni: u, nome: (st.unidades.find((x) => x.id === u) || {}).nome, metaMatric, proc, can, invTotal, matPaga, verba: num(m.verba), receita: metaMatric * mens * 6, vagas: num(m.vagas) };
    };

    const planos = st.unidades.map((u) => plano(u.id));
    const H = planos.reduce((a, p) => ({
      meta: a.meta + p.metaMatric, inv: a.inv + p.invTotal, verba: a.verba + p.verba,
      receita: a.receita + p.receita, vagas: a.vagas + p.vagas, matPaga: a.matPaga + p.matPaga,
    }), { meta: 0, inv: 0, verba: 0, receita: 0, vagas: 0, matPaga: 0 });
    // share por processo consolidado
    const shareProc = st.processos.map((p, i) => {
      const mat = planos.reduce((a, pl) => a + (pl.proc.find((x) => x.p.id === p.id)?.mat || 0), 0);
      return { nome: p.nome, mat, cor: PALETA[i % PALETA.length] };
    }).filter((x) => x.mat > 0);
    const maxMeta = Math.max(1, ...planos.map((p) => p.metaMatric));
    return { planos, H, shareProc, maxMeta, alvo: cfg.alvo, cenario: cfg.cenario };
  }, [st]);

  if (erro) return <div style={{ background: "#FBE9E9", color: "#9B1C1C", padding: 16, borderRadius: 8, margin: 20 }}>{erro}</div>;
  if (!dados) return <div style={{ color: "#4A5C57", padding: 20 }}>Carregando...</div>;

  const { H, planos, shareProc, maxMeta, alvo, cenario } = dados;
  const cenarioLabel = { 90: "Pessimista", 100: "Base", 110: "Otimista" }[cenario] || cenario + "%";
  const gapVerba = H.inv - H.verba;

  return (
    <div style={wrap}>
      <style>{CSS}</style>
      <div style={header}>
        <div>
          <div style={eyebrow}>Planejamento comercial · Clariens</div>
          <h1 style={titulo}>Visão executiva {alvo}</h1>
        </div>
        <div style={cenarioTag}>Cenário {cenarioLabel} · {cenario}%</div>
      </div>

      {/* KPIs grandes */}
      <div style={kpiGrid}>
        <Kpi rotulo="Meta de matrículas" valor={f0(H.meta)} sub="calouros na holding" destaque />
        <Kpi rotulo="Investimento necessário" valor={brlK(H.inv)} sub="mídia + canais" />
        <Kpi rotulo="Verba disponível" valor={H.verba ? brlK(H.verba) : "—"}
          sub={H.verba ? (gapVerba > 0 ? "gap de " + brlK(gapVerba) : "folga de " + brlK(-gapVerba)) : "não informada"}
          cor={H.verba ? (gapVerba > 0 ? "#9B1C1C" : "#0F5F4E") : "#4A5C57"} />
        <Kpi rotulo="CAC médio" valor={brl(div(H.inv, H.matPaga))} sub="custo por matrícula paga" />
        <Kpi rotulo="Receita projetada" valor={brlK(H.receita)} sub="1º semestre" />
        <Kpi rotulo="Investimento / receita" valor={pct(div(H.inv, H.receita), 1)} sub="eficiência de captação" />
      </div>

      <div style={duasCol}>
        {/* Meta por unidade — barras */}
        <div style={card}>
          <div style={cardH}>Meta de matrículas por unidade</div>
          <div style={{ padding: "14px 16px" }}>
            {planos.map((p) => (
              <div key={p.uni} style={barRow}>
                <div style={barLabel}>{p.nome}</div>
                <div style={barTrack}>
                  <div style={{ ...barFill, width: `${Math.max(3, (p.metaMatric / maxMeta) * 100)}%` }} />
                  <span style={barVal}>{f0(p.metaMatric)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Share por processo — donut simplificado em barras empilhadas */}
        <div style={card}>
          <div style={cardH}>Origem das matrículas por processo</div>
          <div style={{ padding: "14px 16px" }}>
            <div style={stackBar}>
              {shareProc.map((s, i) => {
                const total = shareProc.reduce((a, x) => a + x.mat, 0);
                return <div key={i} style={{ width: `${(s.mat / total) * 100}%`, background: s.cor, height: "100%" }} title={s.nome} />;
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              {shareProc.map((s, i) => {
                const total = shareProc.reduce((a, x) => a + x.mat, 0);
                return (
                  <div key={i} style={legRow}>
                    <span style={{ ...legDot, background: s.cor }} />
                    <span style={legNome}>{s.nome}</span>
                    <span style={legVal}>{f0(s.mat)} · {pct(s.mat / total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela consolidada */}
      <div style={card}>
        <div style={cardH}>Consolidado por unidade — {alvo}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead><tr>
              <th style={th}>Unidade</th><th style={thR}>Vagas</th><th style={thR}>Meta matríc.</th>
              <th style={thR}>Ocupação</th><th style={thR}>Investimento</th><th style={thR}>Verba</th>
              <th style={thR}>Gap</th><th style={thR}>CAC médio</th><th style={thR}>Receita sem.</th>
            </tr></thead>
            <tbody>
              {planos.map((p) => {
                const gap = p.invTotal - p.verba;
                return (
                  <tr key={p.uni}>
                    <td style={tdL}>{p.nome}</td>
                    <td style={td}>{p.vagas ? f0(p.vagas) : "—"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{f0(p.metaMatric)}</td>
                    <td style={td}>{p.vagas ? pct(p.metaMatric / p.vagas) : "—"}</td>
                    <td style={td}>{brlK(p.invTotal)}</td>
                    <td style={td}>{p.verba ? brlK(p.verba) : "—"}</td>
                    <td style={{ ...td, color: p.verba ? (gap > 0 ? "#9B1C1C" : "#0F5F4E") : "#4A5C57" }}>{p.verba ? brlK(gap) : "—"}</td>
                    <td style={td}>{brl(div(p.invTotal, p.matPaga))}</td>
                    <td style={td}>{brlK(p.receita)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td style={tdLf}>Holding</td><td style={tdf}>{H.vagas ? f0(H.vagas) : "—"}</td>
              <td style={tdf}>{f0(H.meta)}</td><td style={tdf}>{H.vagas ? pct(H.meta / H.vagas) : "—"}</td>
              <td style={tdf}>{brlK(H.inv)}</td><td style={tdf}>{H.verba ? brlK(H.verba) : "—"}</td>
              <td style={{ ...tdf, color: gapVerba > 0 ? "#9B1C1C" : "#0F5F4E" }}>{H.verba ? brlK(gapVerba) : "—"}</td>
              <td style={tdf}>{brl(div(H.inv, H.matPaga))}</td><td style={tdf}>{brlK(H.receita)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      <div style={rodape}>
        Números gerados a partir do histórico preenchido pela equipe. Cenário {cenarioLabel} ({cenario}% da meta base).
        Para editar premissas ou dados, use a aba Sistema.
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, sub, cor, destaque }) {
  return (
    <div style={{ ...kpiCard, ...(destaque ? { background: "#0E1F1B" } : {}) }}>
      <div style={{ ...kpiRotulo, color: destaque ? "#9DB0AB" : "#4A5C57" }}>{rotulo}</div>
      <div style={{ ...kpiValor, color: destaque ? "#fff" : (cor || "#0E1F1B") }}>{valor}</div>
      <div style={{ ...kpiSub, color: destaque ? "#9DB0AB" : (cor || "#4A5C57") }}>{sub}</div>
    </div>
  );
}

const wrap = { maxWidth: 1200, margin: "0 auto" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 };
const eyebrow = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#4A5C57", fontWeight: 700 };
const titulo = { fontFamily: "Georgia,serif", fontSize: 26, color: "#0E1F1B", margin: "4px 0 0" };
const cenarioTag = { background: "#E4EFEB", color: "#0F5F4E", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 20 };
const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 12, marginBottom: 18 };
const kpiCard = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "16px 18px" };
const kpiRotulo = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 700 };
const kpiValor = { fontFamily: "ui-monospace,Menlo,monospace", fontSize: 26, fontWeight: 700, letterSpacing: "-.5px", marginTop: 6, fontVariantNumeric: "tabular-nums" };
const kpiSub = { fontSize: 11.5, marginTop: 3 };
const duasCol = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginBottom: 18 };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, overflow: "hidden", marginBottom: 18 };
const cardH = { fontFamily: "Georgia,serif", fontSize: 14, padding: "12px 16px", borderBottom: "1px solid #D8E0DD", color: "#0E1F1B" };
const barRow = { display: "flex", alignItems: "center", gap: 10, marginBottom: 9 };
const barLabel = { width: 130, fontSize: 12, color: "#4A5C57", textAlign: "right", flexShrink: 0 };
const barTrack = { flex: 1, background: "#EDF1F0", borderRadius: 3, height: 26, position: "relative" };
const barFill = { height: "100%", background: "#0F5F4E", borderRadius: 3, opacity: 0.88 };
const barVal = { position: "absolute", right: 8, top: 0, lineHeight: "26px", fontSize: 12, fontWeight: 700, color: "#0E1F1B", fontFamily: "ui-monospace,Menlo,monospace" };
const stackBar = { display: "flex", height: 32, borderRadius: 4, overflow: "hidden", border: "1px solid #EDF1F0" };
const legRow = { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" };
const legDot = { width: 11, height: 11, borderRadius: 3, flexShrink: 0 };
const legNome = { fontSize: 12.5, color: "#0E1F1B", flex: 1 };
const legVal = { fontSize: 12, color: "#4A5C57", fontFamily: "ui-monospace,Menlo,monospace" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "left", padding: "9px 12px", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".06em", color: "#4A5C57", fontWeight: 700, borderBottom: "1px solid #D8E0DD", background: "#FAFBFB" };
const thR = { ...th, textAlign: "right" };
const td = { padding: "8px 12px", borderBottom: "1px solid #EDF1F0", textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontVariantNumeric: "tabular-nums", color: "#0E1F1B" };
const tdL = { ...td, textAlign: "left", fontFamily: "inherit" };
const tdf = { ...td, borderTop: "1.5px solid #0E1F1B", borderBottom: "none", fontWeight: 700, background: "#FAFBFB" };
const tdLf = { ...tdf, textAlign: "left", fontFamily: "inherit" };
const rodape = { fontSize: 11, color: "#8496910", marginTop: 4, lineHeight: 1.5 };
const CSS = `@media print { .no-print { display:none; } body { background:#fff; } }`;
