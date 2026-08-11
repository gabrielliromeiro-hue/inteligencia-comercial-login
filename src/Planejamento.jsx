import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as E from "./lib/engine-core.js";
import { carregarTudo, salvarFunil, salvarCanal, salvarMeta, updCanal, salvarVagaCiclo } from "./lib/dados.js";

const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
const f1 = (n) => (isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");
const pct = (n, d = 1) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
const brl = (n) => (isFinite(n) ? "R$ " + Math.round(n).toLocaleString("pt-BR") : "—");
const brlK = (n) => { if (!isFinite(n)) return "—"; if (Math.abs(n) >= 1e6) return "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "M"; if (Math.abs(n) >= 1e3) return "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "k"; return brl(n); };
const div = E.safeDiv;
const num = E.parseNum;

export default function Planejamento({ podeEditar }) {
  const [st, setSt] = useState(null);
  const [erro, setErro] = useState("");
  const [tab, setTab] = useState("base");
  const [uni, setUni] = useState("");
  const [ciclo, setCiclo] = useState("2026.1");
  const [status, setStatus] = useState("Carregando...");
  const salvando = useRef({});

  const recarregar = useCallback(async () => {
    try {
      const d = await carregarTudo();
      setSt(d);
      if (!uni && d.unidades[0]) setUni(d.unidades[0].id);
      setStatus("");
    } catch (e) { setErro("Erro ao carregar: " + (e.message || e)); }
  }, [uni]);

  useEffect(() => { recarregar(); }, []);

  // salva com debounce por chave
  const agendaSalvar = (chave, fn) => {
    clearTimeout(salvando.current[chave]);
    setStatus("Editando...");
    salvando.current[chave] = setTimeout(async () => {
      try { await fn(); setStatus("Salvo " + new Date().toLocaleTimeString("pt-BR")); }
      catch (e) { setStatus("Erro ao salvar"); setErro(e.message || String(e)); }
    }, 800);
  };

  const setFunilLocal = (k, campo, v, uniId, procId) => {
    setSt((s) => ({ ...s, funil: { ...s.funil, [k]: { ...(s.funil[k] || {}), [campo]: v } } }));
    agendaSalvar(k, () => {
      const cur = { ...(stRef.current.funil[k] || {}), [campo]: v };
      return salvarFunil(ciclo, uniId, procId, cur);
    });
  };
  const setCanalLocal = (k, campo, v, uniId, canId) => {
    setSt((s) => ({ ...s, canal: { ...s.canal, [k]: { ...(s.canal[k] || {}), [campo]: v } } }));
    agendaSalvar(k, () => {
      const cur = { ...(stRef.current.canal[k] || {}), [campo]: v };
      return salvarCanal(ciclo, uniId, canId, cur);
    });
  };
  const setMetaLocal = (k, campo, v, uniId) => {
    setSt((s) => ({ ...s, meta: { ...s.meta, [k]: { ...(s.meta[k] || {}), [campo]: v } } }));
    agendaSalvar(k, () => {
      const cur = { ...(stRef.current.meta[k] || {}), [campo]: v };
      return salvarMeta(st.cfg.alvo, uniId, cur, st.processos.map((p) => p.id), st.canais.map((c) => c.id));
    });
  };

  const stRef = useRef(st);
  useEffect(() => { stRef.current = st; }, [st]);

  const engine = useMemo(() => {
    if (!st) return null;
    const cfg = st.cfg;
    const semAlvo = String(cfg.alvo).split(".")[1];
    let base = st.ciclos.filter((c) => c < cfg.alvo);
    if (cfg.somenteHomologos) base = base.filter((c) => c.split(".")[1] === semAlvo);
    base = base.sort().reverse().slice(0, Math.max(3, cfg.pesos.length));
    const g = (obj, k, campo) => num((obj[k] || {})[campo]);

    const cicloUni = (cic, u) => {
      const linhas = st.processos.map((p) => {
        const k = `${cic}|${u}|${p.id}`;
        return { p, vagas: g(st.funil, k, "vagas"), insc: g(st.funil, k, "insc"), pagas: g(st.funil, k, "pagas"), aprovados: g(st.funil, k, "aprovados"), convocados: g(st.funil, k, "convocados"), matric: g(st.funil, k, "matric") };
      });
      const T = linhas.reduce((a, l) => ({ vagas: a.vagas + l.vagas, insc: a.insc + l.insc, pagas: a.pagas + l.pagas, aprovados: a.aprovados + l.aprovados, convocados: a.convocados + l.convocados, matric: a.matric + l.matric, matricOcupa: a.matricOcupa + (l.p.ocupaVaga !== false ? l.matric : 0) }), { vagas: 0, insc: 0, pagas: 0, aprovados: 0, convocados: 0, matric: 0, matricOcupa: 0 });
      return { linhas, T, temDado: T.insc + T.pagas + T.matric > 0 };
    };
    const cicloCanal = (cic, u) => {
      const linhas = st.canais.map((c) => {
        const k = `${cic}|${u}|${c.id}`;
        return { c, inv: g(st.canal, k, "inv"), leads: g(st.canal, k, "leads"), pagas: g(st.canal, k, "pagas"), matric: g(st.canal, k, "matric") };
      });
      const T = linhas.reduce((a, l) => ({ inv: a.inv + l.inv, leads: a.leads + l.leads, pagas: a.pagas + l.pagas, matric: a.matric + l.matric }), { inv: 0, leads: 0, pagas: 0, matric: 0 });
      return { linhas, T, temDado: T.inv + T.matric + T.leads > 0 };
    };
    const plano = (u) => {
      const csF = base.filter((c) => cicloUni(c, u).temDado);
      const csC = base.filter((c) => cicloCanal(c, u).temDado);
      const cyclesF = csF.map((c) => { const x = cicloUni(c, u); const pp = {}; x.linhas.forEach((l) => (pp[l.p.id] = { insc: l.insc, pagas: l.pagas, matric: l.matric })); return { porProc: pp, totalMatric: x.T.matric }; });
      const cyclesC = csC.map((c) => { const x = cicloCanal(c, u); const pc = {}; x.linhas.forEach((l) => (pc[l.c.id] = { inv: l.inv, leads: l.leads, pagas: l.pagas, matric: l.matric })); return { porCanal: pc, totalMatric: x.T.matric }; });
      const procIds = st.processos.map((p) => p.id), canIds = st.canais.map((c) => c.id);
      const rf = E.buildFunnelRef(cyclesF, procIds, cfg.pesos);
      const rc = E.buildChannelRef(cyclesC, canIds, cfg.pesos);
      const anos = E.yearsBetween(csF[0] || csC[0] || null, cfg.alvo);
      const m = st.meta[`${cfg.alvo}|${u}`] || {};
      const metaMatric = num(m.matric) * (cfg.cenario / 100);
      const ganho = 1 + (cfg.ganhoConv || 0) / 100;
      const ovP = {}, ovC = {};
      procIds.forEach((id) => { const v = num(m[`sh_${id}`]); if (v > 0) ovP[id] = v; });
      canIds.forEach((id) => { const v = num(m[`ch_${id}`]); if (v > 0) ovC[id] = v; });
      const shP = E.resolveShares(rf.share, ovP, procIds), shC = E.resolveShares(rc.share, ovC, canIds);
      const proc = st.processos.map((p) => {
        const share = shP.shares[p.id] || 0; const mat = metaMatric * share;
        const fr = E.funnelReverse(mat, rf.conv[p.id], rf.taxaPag[p.id], ganho);
        return { p, share, shareRef: rf.share[p.id], mat, conv: fr.convEf, taxaPag: rf.taxaPag[p.id], pagas: fr.pagas, insc: fr.insc };
      });
      const Tproc = proc.reduce((a, x) => ({ mat: a.mat + x.mat, pagas: a.pagas + (isFinite(x.pagas) ? x.pagas : 0), insc: a.insc + (isFinite(x.insc) ? x.insc : 0) }), { mat: 0, pagas: 0, insc: 0 });
      const can = st.canais.map((cn) => {
        const share = shC.shares[cn.id] || 0; const mat = metaMatric * share;
        const infl = cfg.inflacao[cn.id] !== undefined ? cfg.inflacao[cn.id] : 0.07;
        const pj = E.projectCAC(rc.cac[cn.id], infl, anos, cn.beta, mat, rc.matBase[cn.id], cfg.saturacao);
        const inv = isFinite(pj.cacProj) ? mat * pj.cacProj : 0;
        return { cn, share, shareRef: rc.share[cn.id], mat, cacBase: rc.cac[cn.id], cacProj: pj.cacProj, cresc: pj.cresc, fatSat: pj.fatSat, inv, infl, anos, matBase: rc.matBase[cn.id], cpip: rc.cpip[cn.id], cpl: rc.cpl[cn.id], invBase: rc.invBase[cn.id] };
      });
      const invTotal = can.reduce((a, x) => a + (isFinite(x.inv) ? x.inv : 0), 0);
      const matPaga = can.filter((x) => x.cn.pago).reduce((a, x) => a + x.mat, 0);
      const mens = (st.unidades.find((x) => x.id === u) || {}).mensalidade || 0;
      return { uni: u, rfCiclos: csF, anos, metaMatric, metaBase: num(m.matric), proc, Tproc, can, invTotal, matPaga, verba: num(m.verba), receitaSem: metaMatric * mens * 6, mens, m, vagas: num(m.vagas), sharesProcSum: proc.reduce((a, x) => a + x.share, 0), sharesCanSum: can.reduce((a, x) => a + x.share, 0) };
    };
    return { base, cicloUni, cicloCanal, plano };
  }, [st]);

  if (erro && !st) return <div style={erroBox}>{erro}</div>;
  if (!st || !engine) return <div style={{ color: "#4A5C57", padding: 20 }}>{status || "Carregando..."}</div>;

  const uniNome = (id) => (st.unidades.find((u) => u.id === id) || {}).nome || id;
  const planos = st.unidades.map((u) => engine.plano(u.id));
  const cons = planos.reduce((a, p) => ({ meta: a.meta + p.metaMatric, inv: a.inv + p.invTotal, insc: a.insc + p.Tproc.insc, pagas: a.pagas + p.Tproc.pagas, receita: a.receita + p.receitaSem, verba: a.verba + p.verba }), { meta: 0, inv: 0, insc: 0, pagas: 0, receita: 0, verba: 0 });
  const up = planos.find((p) => p.uni === uni) || planos[0];
  const cu = engine.cicloUni(ciclo, uni);
  const cc = engine.cicloCanal(ciclo, uni);
  const ro = !podeEditar;

  // Vaga do CICLO (única, não por processo)
  const ehSegundoSem = ciclo.endsWith(".2");
  const cicloPar = ciclo.replace(".2", ".1");
  const vagaCicloManual = (st.vagasCiclo || {})[`${ciclo}|${uni}`];
  // no .2, a vaga é calculada: vaga do .1 - matriculas que ocupam vaga do .1
  const cu1 = ehSegundoSem ? engine.cicloUni(cicloPar, uni) : null;
  const vaga1 = ehSegundoSem ? num((st.vagasCiclo || {})[`${cicloPar}|${uni}`]) : 0;
  const vagaCicloAuto = ehSegundoSem ? Math.max(0, vaga1 - (cu1 ? cu1.T.matricOcupa : 0)) : null;
  const vagaCiclo = ehSegundoSem ? vagaCicloAuto : num(vagaCicloManual);
  const ociosaCiclo = vagaCiclo - cu.T.matricOcupa;

  const setVagaCiclo = (v) => {
    setSt((s) => ({ ...s, vagasCiclo: { ...(s.vagasCiclo || {}), [`${ciclo}|${uni}`]: v } }));
    agendaSalvar("vagaciclo", () => salvarVagaCiclo(ciclo, uni, v));
  };

  const Cell = ({ value, onChange, w, ph }) => (
    <input className="pc-in" style={{ width: w || 82, ...(ro ? { background: "transparent", cursor: "default" } : {}) }}
      value={value ?? ""} placeholder={ph} readOnly={ro} inputMode="decimal"
      onChange={(e) => !ro && onChange(e.target.value)} />
  );

  return (
    <div>
      <style>{CSS}</style>
      <div className="pc-toolbar">
        <div className="pc-fld"><span className="pc-lbl">Unidade</span>
          <select className="pc-sel" value={uni} onChange={(e) => setUni(e.target.value)}>
            {st.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select></div>
        {(tab === "base" || tab === "canais") && (
          <div className="pc-fld"><span className="pc-lbl">Ciclo</span>
            <select className="pc-sel" value={ciclo} onChange={(e) => setCiclo(e.target.value)}>
              {st.ciclos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
        )}
        <div className="pc-fld"><span className="pc-lbl">Alvo</span>
          <select className="pc-sel" value={st.cfg.alvo} onChange={(e) => setSt((s) => ({ ...s, cfg: { ...s.cfg, alvo: e.target.value } }))}>
            {st.alvos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="pc-fld"><span className="pc-lbl">Cenário</span>
          <select className="pc-sel" value={st.cfg.cenario} onChange={(e) => setSt((s) => ({ ...s, cfg: { ...s.cfg, cenario: parseInt(e.target.value, 10) } }))}>
            <option value={90}>Pessimista 90%</option><option value={100}>Base 100%</option><option value={110}>Otimista 110%</option>
          </select></div>
        {ro && <span className="pc-ro">Modo leitura</span>}
        <span className="pc-status">{status}</span>
      </div>

      <div className="pc-tabs2">
        {[["base", "Base histórica"], ["canais", "Canais"], ["metas", "Meta por processo"], ["verba", "Verba"], ["cons", "Consolidado"]].map(([k, l]) => (
          <button key={k} className="pc-t2" data-on={tab === k ? 1 : 0} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "base" && (
        <div className="pc-card">
          <div className="pc-h">Funil por processo — {ciclo} · {uniNome(uni)}</div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #EDF1F0", flexWrap: "wrap", background: "#FAFBFB" }}>
            <div className="pc-fld"><span className="pc-lbl">Vagas do ciclo</span>
              {ehSegundoSem
                ? <span className="m" title={`${cicloPar}: ${f0(vaga1)} vagas − ${f0(cu1 ? cu1.T.matricOcupa : 0)} matríc. que ocupam vaga`} style={{ color: "#0F5F4E", cursor: "help", borderBottom: "1px dotted #0F5F4E", fontSize: 15, fontWeight: 700 }}>{f0(vagaCiclo)}</span>
                : <Cell w={70} value={vagaCicloManual} onChange={setVagaCiclo} />}
            </div>
            <div className="pc-fld"><span className="pc-lbl">Matrículas que ocupam vaga</span><span className="m" style={{ fontWeight: 700 }}>{f0(cu.T.matricOcupa)}</span></div>
            <div className="pc-fld"><span className="pc-lbl">Vagas a preencher</span><span className="m" style={{ fontWeight: 700, color: ociosaCiclo > 0 ? "#8A6100" : "#0F5F4E" }}>{vagaCiclo > 0 ? f0(ociosaCiclo) : "—"}</span></div>
            {ehSegundoSem && <span className="pc-tag" style={{ background: "#E4EFEB", color: "#0F5F4E" }}>vaga do .2 calculada do .1</span>}
          </div>
          <div className="pc-scroll"><table className="pc-t">
            <thead><tr><th>Processo</th><th>Inscrições</th><th>Pagas</th><th>Aprovados</th><th>Convocados</th><th>Matrículas</th><th>Taxa pagto</th><th>Paga→Mat</th><th>Insc→Mat</th><th>Share</th></tr></thead>
            <tbody>
              {cu.linhas.map((l) => { const k = `${ciclo}|${uni}|${l.p.id}`; const d = st.funil[k] || {};
                const ocupa = l.p.ocupaVaga !== false;
                return <tr key={l.p.id}><td>{l.p.nome}{/FIES/i.test(l.p.nome) && <span className="pc-tag">FIES</span>}{!ocupa && <span className="pc-tag" style={{ background: "#F0EAF5", color: "#6B4A8A" }}>não ocupa vaga</span>}</td>
                  <td><Cell value={d.insc} onChange={(v) => setFunilLocal(k, "insc", v, uni, l.p.id)} /></td>
                  <td><Cell value={d.pagas} onChange={(v) => setFunilLocal(k, "pagas", v, uni, l.p.id)} /></td>
                  <td><Cell value={d.aprovados} onChange={(v) => setFunilLocal(k, "aprovados", v, uni, l.p.id)} /></td>
                  <td><Cell value={d.convocados} onChange={(v) => setFunilLocal(k, "convocados", v, uni, l.p.id)} /></td>
                  <td><Cell value={d.matric} onChange={(v) => setFunilLocal(k, "matric", v, uni, l.p.id)} /></td>
                  <td className="m">{pct(div(l.pagas, l.insc))}</td><td className="m">{pct(div(l.matric, l.pagas))}</td>
                  <td className="m mut">{pct(div(l.matric, l.insc))}</td>
                  <td className="m"><b>{pct(div(l.matric, cu.T.matric))}</b></td></tr>; })}
            </tbody>
            <tfoot><tr><td>Total</td><td className="m">{f0(cu.T.insc)}</td><td className="m">{f0(cu.T.pagas)}</td><td className="m">{f0(cu.T.aprovados)}</td><td className="m">{f0(cu.T.convocados)}</td><td className="m">{f0(cu.T.matric)}</td><td className="m">{pct(div(cu.T.pagas, cu.T.insc))}</td><td className="m">{pct(div(cu.T.matric, cu.T.pagas))}</td><td className="m">{pct(div(cu.T.matric, cu.T.insc))}</td><td>100%</td></tr></tfoot>
          </table></div>
        </div>
      )}

      {tab === "canais" && (
        <div className="pc-card">
          <div className="pc-h">Canais — {ciclo} · {uniNome(uni)}</div>
          <div className="pc-scroll"><table className="pc-t">
            <thead><tr><th>Canal</th><th>Investimento</th><th>Leads</th><th>Matrículas</th><th>CPL</th><th>CAC</th><th>Share</th></tr></thead>
            <tbody>
              {cc.linhas.map((l) => { const k = `${ciclo}|${uni}|${l.c.id}`; const d = st.canal[k] || {};
                return <tr key={l.c.id}><td>{l.c.nome}{!l.c.pago && <span className="pc-tag">sem verba</span>}</td>
                  <td><Cell w={110} value={d.inv} onChange={(v) => setCanalLocal(k, "inv", v, uni, l.c.id)} /></td>
                  <td><Cell value={d.leads} onChange={(v) => setCanalLocal(k, "leads", v, uni, l.c.id)} /></td>
                  <td><Cell value={d.matric} onChange={(v) => setCanalLocal(k, "matric", v, uni, l.c.id)} /></td>
                  <td className="m">{isFinite(div(l.inv, l.leads)) ? brl(div(l.inv, l.leads)) : "—"}</td>
                  <td className="m"><b>{isFinite(div(l.inv, l.matric)) ? brl(div(l.inv, l.matric)) : "—"}</b></td>
                  <td className="m">{pct(div(l.matric, cc.T.matric))}</td></tr>; })}
            </tbody>
            <tfoot><tr><td>Total</td><td className="m">{brl(cc.T.inv)}</td><td className="m">{f0(cc.T.leads)}</td><td className="m">{f0(cc.T.matric)}</td><td></td><td className="m">{isFinite(div(cc.T.inv, cc.T.matric)) ? brl(div(cc.T.inv, cc.T.matric)) : "—"}</td><td>100%</td></tr></tfoot>
          </table></div>
        </div>
      )}

      {tab === "metas" && (
        <div className="pc-card">
          <div className="pc-h">Meta {st.cfg.alvo} — {uniNome(uni)} <span className="pc-sub2">ref: {up.rfCiclos.join(" · ") || "sem dado"} · {up.anos} ano(s) · cenário {st.cfg.cenario}%</span></div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 12px" }}>
            <div className="pc-fld"><span className="pc-lbl">Vagas</span><Cell w={60} value={(st.meta[`${st.cfg.alvo}|${uni}`] || {}).vagas} onChange={(v) => setMetaLocal(`${st.cfg.alvo}|${uni}`, "vagas", v, uni)} /></div>
            <div className="pc-fld"><span className="pc-lbl">Meta matríc. (100%)</span><Cell value={(st.meta[`${st.cfg.alvo}|${uni}`] || {}).matric} onChange={(v) => setMetaLocal(`${st.cfg.alvo}|${uni}`, "matric", v, uni)} /></div>
            <div className="pc-fld"><span className="pc-lbl">Verba</span><Cell w={110} value={(st.meta[`${st.cfg.alvo}|${uni}`] || {}).verba} onChange={(v) => setMetaLocal(`${st.cfg.alvo}|${uni}`, "verba", v, uni)} /></div>
            <div className="pc-fld"><span className="pc-lbl">Meta do cenário</span><span className="m" style={{ fontSize: 16, fontWeight: 700 }}>{f0(up.metaMatric)}</span></div>
          </div>
          <div className="pc-scroll"><table className="pc-t">
            <thead><tr><th>Processo</th><th>Share ref.</th><th>Share (%)</th><th>Efetivo</th><th>Meta matríc.</th><th>Conv paga→mat</th><th>Inscr. pagas</th><th>Inscrições</th></tr></thead>
            <tbody>
              {up.proc.map((x) => { const k = `${st.cfg.alvo}|${uni}`;
                return <tr key={x.p.id}><td>{x.p.nome}</td><td className="m mut">{pct(x.shareRef)}</td>
                  <td><Cell w={60} ph={(x.shareRef * 100).toFixed(1)} value={(st.meta[k] || {})[`sh_${x.p.id}`]} onChange={(v) => setMetaLocal(k, `sh_${x.p.id}`, v, uni)} /></td>
                  <td className="m">{pct(x.share)}</td><td className="m"><b>{f0(x.mat)}</b></td><td className="m">{pct(x.conv)}</td>
                  <td className="m">{isFinite(x.pagas) ? f0(x.pagas) : "—"}</td><td className="m"><b>{isFinite(x.insc) ? f0(x.insc) : "—"}</b></td></tr>; })}
            </tbody>
            <tfoot><tr><td>Total</td><td colSpan={2}></td><td className="m">{pct(up.sharesProcSum, 0)}</td><td className="m">{f0(up.Tproc.mat)}</td><td></td><td className="m">{f0(up.Tproc.pagas)}</td><td className="m">{f0(up.Tproc.insc)}</td></tr></tfoot>
          </table></div>
        </div>
      )}

      {tab === "verba" && (
        <div className="pc-card">
          <div className="pc-h">Verba por canal — {uniNome(uni)} · {st.cfg.alvo}
            <span className="pc-sub2">investimento {brlK(up.invTotal)} · verba {up.verba ? brlK(up.verba) : "—"} · {up.verba ? (up.invTotal - up.verba > 0 ? "gap " + brlK(up.invTotal - up.verba) : "folga " + brlK(up.verba - up.invTotal)) : ""}</span></div>
          <div className="pc-scroll"><table className="pc-t">
            <thead><tr><th>Canal</th><th>Share (%)</th><th>Meta</th><th>Base</th><th>Cresc.</th><th>CAC ref.</th><th>Reajuste</th><th>Saturação</th><th>CAC proj.</th><th>Investimento</th></tr></thead>
            <tbody>
              {up.can.map((x) => { const k = `${st.cfg.alvo}|${uni}`;
                return <tr key={x.cn.id}><td>{x.cn.nome}</td>
                  <td><Cell w={60} ph={(x.shareRef * 100).toFixed(1)} value={(st.meta[k] || {})[`ch_${x.cn.id}`]} onChange={(v) => setMetaLocal(k, `ch_${x.cn.id}`, v, uni)} /></td>
                  <td className="m">{f0(x.mat)}</td><td className="m mut">{f1(x.matBase)}</td>
                  <td className="m">{x.matBase > 0 ? pct(x.cresc, 0) : "—"}</td>
                  <td className="m">{isFinite(x.cacBase) ? brl(x.cacBase) : "—"}</td>
                  <td>{ro ? <span className="m mut">{pct(x.infl, 0)}</span> : <input className="pc-in" style={{ width: 56 }} inputMode="decimal"
                    defaultValue={(x.infl * 100).toFixed(1)}
                    title="Reajuste anual do CAC deste canal (%). Enter para salvar."
                    onBlur={(e) => {
                      const novo = num(e.target.value) / 100;
                      setSt((s) => ({ ...s, cfg: { ...s.cfg, inflacao: { ...s.cfg.inflacao, [x.cn.id]: novo } } }));
                      agendaSalvar("reaj_" + x.cn.id, () => updCanal(x.cn.id, { reajuste: novo }));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />} <span className="mut" style={{ fontSize: 10 }}>({pct(Math.pow(1 + x.infl, x.anos) - 1, 0)} acum.)</span></td>
                  <td className="m mut">{x.fatSat > 1 ? "+" + pct(x.fatSat - 1, 0) : "—"}</td>
                  <td className="m"><b>{isFinite(x.cacProj) ? brl(x.cacProj) : "—"}</b></td>
                  <td className="m"><b>{x.inv > 0 ? brlK(x.inv) : "—"}</b></td></tr>; })}
            </tbody>
            <tfoot><tr><td>Total</td><td className="m">{pct(up.sharesCanSum, 0)}</td><td className="m">{f0(up.can.reduce((a, x) => a + x.mat, 0))}</td><td colSpan={5}></td><td className="m">{brl(div(up.invTotal, up.matPaga))}</td><td className="m">{brlK(up.invTotal)}</td></tr></tfoot>
          </table></div>
        </div>
      )}

      {tab === "cons" && (
        <div className="pc-card">
          <div className="pc-h">Consolidado holding — {st.cfg.alvo}</div>
          <div className="pc-scroll"><table className="pc-t">
            <thead><tr><th>Unidade</th><th>Vagas</th><th>Meta matríc.</th><th>Ocupação</th><th>Inscr. pagas</th><th>Inscrições</th><th>Investimento</th><th>Verba</th><th>Receita sem.</th></tr></thead>
            <tbody>
              {planos.map((p) => <tr key={p.uni}><td>{uniNome(p.uni)}</td><td className="m">{p.vagas ? f0(p.vagas) : "—"}</td>
                <td className="m"><b>{f0(p.metaMatric)}</b></td><td className="m">{p.vagas ? pct(p.metaMatric / p.vagas, 0) : "—"}</td>
                <td className="m">{f0(p.Tproc.pagas)}</td><td className="m">{f0(p.Tproc.insc)}</td>
                <td className="m">{brlK(p.invTotal)}</td><td className="m">{p.verba ? brlK(p.verba) : "—"}</td><td className="m">{brlK(p.receitaSem)}</td></tr>)}
            </tbody>
            <tfoot><tr><td>Holding</td><td></td><td className="m">{f0(cons.meta)}</td><td></td><td className="m">{f0(cons.pagas)}</td><td className="m">{f0(cons.insc)}</td><td className="m">{brlK(cons.inv)}</td><td className="m">{cons.verba ? brlK(cons.verba) : "—"}</td><td className="m">{brlK(cons.receita)}</td></tr></tfoot>
          </table></div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pc-toolbar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid #D8E0DD;border-radius:6px;padding:9px 12px;margin-bottom:12px;}
.pc-fld{display:flex;align-items:center;gap:6px;}
.pc-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#4A5C57;font-weight:700;}
.pc-sel{border:1px solid #D8E0DD;border-radius:3px;padding:4px 7px;font-size:12px;background:#fff;}
.pc-ro{background:#FBF2DC;color:#8A6100;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9px;}
.pc-status{margin-left:auto;font-size:10.5px;color:#4A5C57;}
.pc-tabs2{display:flex;gap:2px;margin-bottom:12px;flex-wrap:wrap;}
.pc-t2{background:#fff;border:1px solid #D8E0DD;border-bottom:2px solid transparent;color:#4A5C57;padding:7px 12px;font-size:12px;cursor:pointer;font-weight:600;border-radius:4px 4px 0 0;}
.pc-t2[data-on="1"]{color:#0F5F4E;border-bottom-color:#0F5F4E;}
.pc-card{background:#fff;border:1px solid #D8E0DD;border-radius:6px;overflow:hidden;margin-bottom:14px;}
.pc-h{font-family:Georgia,serif;font-size:14px;padding:11px 14px;border-bottom:1px solid #D8E0DD;color:#0E1F1B;}
.pc-sub2{font-family:ui-sans-serif,system-ui;font-size:11px;color:#4A5C57;font-weight:400;margin-left:8px;}
.pc-scroll{overflow-x:auto;}
.pc-t{width:100%;border-collapse:collapse;font-size:12px;}
.pc-t th{text-align:right;padding:7px 9px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#4A5C57;font-weight:700;border-bottom:1px solid #D8E0DD;background:#FAFBFB;white-space:nowrap;}
.pc-t th:first-child,.pc-t td:first-child{text-align:left;}
.pc-t td{padding:5px 9px;border-bottom:1px solid #EDF1F0;text-align:right;white-space:nowrap;color:#0E1F1B;}
.pc-t tfoot td{border-top:1.5px solid #0E1F1B;font-weight:700;background:#FAFBFB;}
.pc-t .m{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;}
.pc-t .mut{color:#4A5C57;}
.pc-in{border:1px solid transparent;border-radius:3px;padding:3px 5px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#F6F8F8;color:#0E1F1B;}
.pc-in:hover{border-color:#D8E0DD;}
.pc-in:focus{outline:none;border-color:#0F5F4E;background:#fff;box-shadow:0 0 0 2px #E4EFEB;}
.pc-tag{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9.5px;font-weight:700;background:#EDF1F0;color:#4A5C57;margin-left:5px;}
`;
const erroBox = { background: "#FBE9E9", color: "#9B1C1C", fontSize: 13, padding: "12px 14px", borderRadius: 6, margin: 20 };
