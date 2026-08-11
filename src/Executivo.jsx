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
  const [uniSel, setUniSel] = useState("__holding__");
  const [cicloHist, setCicloHist] = useState("");

  useEffect(() => { carregarTudo().then((d) => {
    setSt(d);
    // default: ciclo homólogo mais recente antes do alvo
    const semAlvo = String(d.cfg.alvo).split(".")[1];
    const homo = d.ciclos.filter((c) => c < d.cfg.alvo && c.split(".")[1] === semAlvo).sort().reverse();
    setCicloHist(homo[0] || d.ciclos.filter((c) => c < d.cfg.alvo).sort().reverse()[0] || d.ciclos[0]);
  }).catch((e) => setErro(e.message || String(e))); }, []);

  const D = useMemo(() => {
    if (!st) return null;
    const cfg = st.cfg;
    const semAlvo = String(cfg.alvo).split(".")[1];
    let base = st.ciclos.filter((c) => c < cfg.alvo);
    if (cfg.somenteHomologos) base = base.filter((c) => c.split(".")[1] === semAlvo);
    base = base.sort().reverse().slice(0, Math.max(3, cfg.pesos.length));
    const g = (o, k, c) => num((o[k] || {})[c]);
    const alvoUnis = uniSel === "__holding__" ? st.unidades.map((u) => u.id) : [uniSel];

    // histórico por processo, somando as unidades selecionadas, no ciclo escolhido
    const histProc = st.processos.map((p) => {
      let mat = 0;
      alvoUnis.forEach((u) => { mat += g(st.funil, `${cicloHist}|${u}|${p.id}`, "matric"); });
      return { p, mat };
    });
    const histTotal = histProc.reduce((a, x) => a + x.mat, 0);

    // projeção (ciclo alvo) por processo, somando as unidades selecionadas
    const cicloUni = (cic, u) => {
      const linhas = st.processos.map((p) => { const k = `${cic}|${u}|${p.id}`; return { p, insc: g(st.funil, k, "insc"), pagas: g(st.funil, k, "pagas"), matric: g(st.funil, k, "matric") }; });
      const T = linhas.reduce((a, l) => ({ matric: a.matric + l.matric }), { matric: 0 });
      return { linhas, T, temDado: T.matric > 0 };
    };
    const projUniProc = (u) => {
      const csF = base.filter((c) => cicloUni(c, u).temDado);
      const cyclesF = csF.map((c) => { const x = cicloUni(c, u); const pp = {}; x.linhas.forEach((l) => (pp[l.p.id] = { insc: l.insc, pagas: l.pagas, matric: l.matric })); return { porProc: pp, totalMatric: x.T.matric }; });
      const rf = E.buildFunnelRef(cyclesF, st.processos.map((p) => p.id), cfg.pesos);
      const shP = E.resolveShares(rf.share, {}, st.processos.map((p) => p.id));
      const m = st.meta[`${cfg.alvo}|${u}`] || {};
      const metaMatric = num(m.matric) * (cfg.cenario / 100);
      const out = {}; st.processos.forEach((p) => (out[p.id] = metaMatric * (shP.shares[p.id] || 0)));
      return { out, metaMatric, metaBase: num(m.matric) };
    };
    const projAgg = {}; let metaTotal = 0;
    st.processos.forEach((p) => (projAgg[p.id] = 0));
    alvoUnis.forEach((u) => { const pj = projUniProc(u); metaTotal += pj.metaMatric; st.processos.forEach((p) => (projAgg[p.id] += pj.out[p.id])); });
    const projTotal = st.processos.reduce((a, p) => a + projAgg[p.id], 0);

    const linhas = st.processos.map((p, i) => ({
      nome: p.nome, cor: PALETA[i % PALETA.length],
      histMat: histProc.find((x) => x.p.id === p.id).mat,
      histShare: histTotal > 0 ? histProc.find((x) => x.p.id === p.id).mat / histTotal : NaN,
      projMat: projAgg[p.id],
      projShare: projTotal > 0 ? projAgg[p.id] / projTotal : NaN,
    })).filter((l) => l.histMat > 0 || l.projMat > 0);

    // meta do período histórico (para atingimento): usa a meta do ciclo histórico se existir
    let metaHist = 0;
    alvoUnis.forEach((u) => { metaHist += num((st.meta[`${cicloHist}|${u}`] || {}).matric); });

    return { linhas, histTotal, projTotal, metaTotal, metaHist, alvo: cfg.alvo, cenario: cfg.cenario, cicloHist,
      nomeUni: uniSel === "__holding__" ? "Holding (todas as unidades)" : (st.unidades.find((u) => u.id === uniSel) || {}).nome };
  }, [st, uniSel, cicloHist]);

  if (erro) return <div style={{ background: "#FBE9E9", color: "#9B1C1C", padding: 16, borderRadius: 8, margin: 20 }}>{erro}</div>;
  if (!st || !D) return <div style={{ color: "#4A5C57", padding: 20 }}>Carregando...</div>;

  const cenarioLabel = { 90: "Pessimista", 100: "Base", 110: "Otimista" }[D.cenario] || D.cenario + "%";

  return (
    <div style={wrap}>
      <div style={header}>
        <div>
          <div style={eyebrow}>Planejamento comercial · Clariens</div>
          <h1 style={titulo}>Matrículas por entrada · {D.alvo}</h1>
        </div>
        <div style={cenarioTag}>Cenário {cenarioLabel}</div>
      </div>

      {/* Filtros */}
      <div style={filtros}>
        <div style={fld}><span style={lbl}>Unidade</span>
          <select style={sel} value={uniSel} onChange={(e) => setUniSel(e.target.value)}>
            <option value="__holding__">Holding (todas)</option>
            {st.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={fld}><span style={lbl}>Ciclo histórico</span>
          <select style={sel} value={cicloHist} onChange={(e) => setCicloHist(e.target.value)}>
            {st.ciclos.filter((c) => c < st.cfg.alvo).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#4A5C57" }}>{D.nomeUni}</div>
      </div>

      {/* Tabela principal */}
      <div style={card}>
        <div style={cardH}>Matrículas por processo de entrada — {D.cicloHist} (real) vs {D.alvo} (previsto)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }} rowSpan={2}>Processo de entrada</th>
                <th style={thGrp} colSpan={3}>Histórico {D.cicloHist}</th>
                <th style={thGrpP} colSpan={3}>Previsto {D.alvo}</th>
              </tr>
              <tr>
                <th style={th}>Matríc.</th><th style={th}>% do total</th><th style={th}>% da meta</th>
                <th style={thP}>Matríc.</th><th style={thP}>% do total</th><th style={thP}>% da meta</th>
              </tr>
            </thead>
            <tbody>
              {D.linhas.map((l, i) => (
                <tr key={i}>
                  <td style={tdL}><span style={{ ...dot, background: l.cor }} />{l.nome}</td>
                  <td style={td}>{f0(l.histMat)}</td>
                  <td style={td}>{pct(l.histShare)}</td>
                  <td style={tdMut}>{D.metaHist > 0 ? pct(l.histMat / D.metaHist) : "—"}</td>
                  <td style={{ ...td, background: "#F5F9F8" }}><b>{f0(l.projMat)}</b></td>
                  <td style={{ ...td, background: "#F5F9F8" }}>{pct(l.projShare)}</td>
                  <td style={{ ...tdMut, background: "#F5F9F8" }}>{D.metaTotal > 0 ? pct(l.projMat / D.metaTotal) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={tdLf}>Total</td>
                <td style={tdf}>{f0(D.histTotal)}</td>
                <td style={tdf}>100%</td>
                <td style={tdf}>{D.metaHist > 0 ? pct(D.histTotal / D.metaHist) : "—"}</td>
                <td style={{ ...tdf, background: "#EDF3F1" }}>{f0(D.projTotal)}</td>
                <td style={{ ...tdf, background: "#EDF3F1" }}>100%</td>
                <td style={{ ...tdf, background: "#EDF3F1" }}>{D.metaTotal > 0 ? pct(D.projTotal / D.metaTotal) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={legenda}>
          <b>% do total</b>: participação da entrada no total de matrículas do período (share).
          <b style={{ marginLeft: 12 }}>% da meta</b>: quanto aquela entrada representa da meta de matrículas definida.
          {D.metaHist === 0 && <span style={{ color: "#8A6100", marginLeft: 12 }}>Sem meta cadastrada para {D.cicloHist}, o "% da meta" histórico fica vazio.</span>}
        </div>
      </div>

      {/* Barras comparativas hist vs prev */}
      <div style={card}>
        <div style={cardH}>Comparativo visual — share de cada entrada</div>
        <div style={{ padding: "14px 16px" }}>
          {D.linhas.map((l, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#0E1F1B", marginBottom: 4 }}>{l.nome}</div>
              <div style={cmpRow}>
                <span style={cmpTag}>{D.cicloHist}</span>
                <div style={cmpTrack}><div style={{ ...cmpFill, width: `${(isFinite(l.histShare) ? l.histShare : 0) * 100}%`, background: "#7D8F89" }} /></div>
                <span style={cmpVal}>{pct(l.histShare)}</span>
              </div>
              <div style={cmpRow}>
                <span style={cmpTag}>{D.alvo}</span>
                <div style={cmpTrack}><div style={{ ...cmpFill, width: `${(isFinite(l.projShare) ? l.projShare : 0) * 100}%`, background: l.cor }} /></div>
                <span style={cmpVal}>{pct(l.projShare)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={rodape}>
        Dados do histórico preenchido pela equipe na aba Sistema. Previsto = projeção do modelo para {D.alvo} no cenário {cenarioLabel} ({D.cenario}%).
      </div>
    </div>
  );
}

const wrap = { maxWidth: 1100, margin: "0 auto" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 };
const eyebrow = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#4A5C57", fontWeight: 700 };
const titulo = { fontFamily: "Georgia,serif", fontSize: 24, color: "#0E1F1B", margin: "4px 0 0" };
const cenarioTag = { background: "#E4EFEB", color: "#0F5F4E", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 20 };
const filtros = { display: "flex", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "10px 14px", marginBottom: 16, flexWrap: "wrap" };
const fld = { display: "flex", alignItems: "center", gap: 7 };
const lbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5C57", fontWeight: 700 };
const sel = { border: "1px solid #D8E0DD", borderRadius: 4, padding: "5px 8px", fontSize: 13, background: "#fff", color: "#0E1F1B" };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, overflow: "hidden", marginBottom: 16 };
const cardH = { fontFamily: "Georgia,serif", fontSize: 14, padding: "12px 16px", borderBottom: "1px solid #D8E0DD", color: "#0E1F1B" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "right", padding: "8px 12px", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "#4A5C57", fontWeight: 700, borderBottom: "1px solid #D8E0DD", background: "#FAFBFB", whiteSpace: "nowrap" };
const thP = { ...th, background: "#EDF3F1" };
const thGrp = { ...th, textAlign: "center", borderBottom: "2px solid #D8E0DD", color: "#4A5C57" };
const thGrpP = { ...thGrp, background: "#EDF3F1", color: "#0F5F4E" };
const td = { padding: "8px 12px", borderBottom: "1px solid #EDF1F0", textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", fontVariantNumeric: "tabular-nums", color: "#0E1F1B", whiteSpace: "nowrap" };
const tdMut = { ...td, color: "#4A5C57" };
const tdL = { padding: "8px 12px", borderBottom: "1px solid #EDF1F0", textAlign: "left", color: "#0E1F1B" };
const dot = { display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 7, verticalAlign: "middle" };
const tdf = { ...td, borderTop: "1.5px solid #0E1F1B", borderBottom: "none", fontWeight: 700, background: "#FAFBFB" };
const tdLf = { ...tdL, borderTop: "1.5px solid #0E1F1B", fontWeight: 700, background: "#FAFBFB" };
const legenda = { fontSize: 11, color: "#4A5C57", padding: "10px 16px", borderTop: "1px solid #EDF1F0", lineHeight: 1.5 };
const cmpRow = { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 };
const cmpTag = { width: 52, fontSize: 10.5, color: "#4A5C57", fontFamily: "ui-monospace,Menlo,monospace" };
const cmpTrack = { flex: 1, background: "#EDF1F0", borderRadius: 3, height: 18 };
const cmpFill = { height: "100%", borderRadius: 3, opacity: 0.9 };
const cmpVal = { width: 52, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: "#0E1F1B", fontFamily: "ui-monospace,Menlo,monospace" };
const rodape = { fontSize: 11, color: "#8496910", lineHeight: 1.5 };
