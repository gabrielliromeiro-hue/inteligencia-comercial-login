// VERSAO-META-INSCRITOS-V2 (As Is homologo, bate com Visao Executiva)
import React, { useState, useEffect, useMemo } from "react";
import { carregarTudo } from "./lib/dados.js";

const num = (v) => { if (typeof v === "number") return v; if (!v) return 0; const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : 0; };
const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
const pct = (n, d = 1) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");

const grupoDe = (nome) => {
  const n = (nome || "").toLowerCase();
  if (n.includes("transfer") && n.includes("fies")) return "transfFies";
  if (n.includes("transfer")) return "transf";
  if (n.includes("recuper")) return "recuperado";
  if (n.includes("fies")) return "fies";
  if (n.includes("vestibular") || n.includes("enem")) return "selfpaid";
  return "selfpaid";
};
const ehSelfPaid = (nome) => grupoDe(nome) === "selfpaid";
const ehTransfer = (nome) => grupoDe(nome) === "transf" || grupoDe(nome) === "transfFies";
const ehFIES = (nome) => grupoDe(nome) === "fies";
const ehCalouroSP = (p) => p.ocupaVaga !== false && ehSelfPaid(p.nome) && !ehTransfer(p.nome);
const pctVal = (raw, pad) => { const v = num(raw); return isFinite(v) && v !== 0 ? v : pad; };

export default function MetaInscritos() {
  const [st, setSt] = useState(null);
  const [uniSel, setUniSel] = useState("__holding__");
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarTudo().then(setSt).catch((e) => setErro(String(e.message || e)));
  }, []);

  const D = useMemo(() => {
    if (!st) return null;
    const alvo = st.cfg.alvo; // 2027.1
    const alvoUnis = uniSel === "__holding__" ? st.unidades.map((u) => u.id) : [uniSel];
    const g = (o, k, c) => num((o[k] || {})[c]);

    // janela dos 3 últimos intakes cronológicos antes do alvo (para conversão do topo)
    const janela3 = st.ciclos.filter((c) => c < alvo).sort().reverse().slice(0, 3);
    // As Is = ciclo HOMÓLOGO mais recente antes do alvo (mesma regra da Visão Executiva).
    // Para alvo 2027.1 (semestre .1), o As Is é 2026.1, não 2026.2 (que está incompleto).
    const semAlvo = String(alvo).split(".")[1];
    const homo = st.ciclos.filter((c) => c < alvo && c.split(".")[1] === semAlvo).sort().reverse();
    const cicloAsIs = homo[0] || st.ciclos.filter((c) => c < alvo).sort().reverse()[0] || st.ciclos[0];

    // conversão inscrito->matrícula (média simples, ignora furados)
    const convMatric = (uId, pid) => {
      let soma = 0, n = 0;
      janela3.forEach((c) => {
        const insc = g(st.funil, `${c}|${uId}|${pid}`, "insc");
        const mat = g(st.funil, `${c}|${uId}|${pid}`, "matric");
        if (insc > 0) { soma += mat / insc; n += 1; }
      });
      return n > 0 ? soma / n : NaN;
    };
    // taxa de pagamento (pago/inscrito, média simples, ignora furados)
    const taxaPagto = (uId, pid) => {
      let soma = 0, n = 0;
      janela3.forEach((c) => {
        const insc = g(st.funil, `${c}|${uId}|${pid}`, "insc");
        const pagas = g(st.funil, `${c}|${uId}|${pid}`, "pagas");
        if (insc > 0) { soma += pagas / insc; n += 1; }
      });
      return n > 0 ? soma / n : NaN;
    };

    const TRANSF_PADRAO = 8;

    // calcula as matrículas do cenário RECUPERAÇÃO por processo (mesma mecânica da Visão Executiva)
    const recupPorProc = {}; // pid -> matrículas recuperadas (somadas no filtro)
    st.processos.forEach((p) => (recupPorProc[p.id] = 0));

    alvoUnis.forEach((u) => {
      const mU = st.meta[`${alvo}|${u}`] || {};
      const asIsU = {};
      st.processos.forEach((p) => (asIsU[p.id] = g(st.funil, `${cicloAsIs}|${u}|${p.id}`, "matric")));

      const revU = {};
      const foiEditado = {};
      st.processos.forEach((p) => {
        revU[p.id] = asIsU[p.id];
        if (ehCalouroSP(p)) {
          const raw = mU[`rv_${p.id}`];
          const temEdit = raw !== undefined && raw !== "" && num(raw) !== 0;
          if (temEdit) { revU[p.id] = asIsU[p.id] * (1 + num(raw) / 100); foiEditado[p.id] = true; }
        }
      });
      st.processos.forEach((p) => {
        if (ehTransfer(p.nome)) revU[p.id] = asIsU[p.id] * (1 + pctVal(mU.rv_transf, TRANSF_PADRAO) / 100);
      });
      // fechamento na vaga
      const vagaU = num(mU.vagas);
      if (vagaU > 0) {
        const idsVaga = st.processos.filter((p) => p.ocupaVaga !== false).map((p) => p.id);
        const somaEditados = idsVaga.filter((id) => foiEditado[id]).reduce((a, id) => a + revU[id], 0);
        const idsLivres = idsVaga.filter((id) => !foiEditado[id]);
        const restante = vagaU - somaEditados;
        const baseHist = idsLivres.reduce((a, id) => a + asIsU[id], 0);
        if (idsLivres.length && restante > 0) {
          idsLivres.forEach((id) => { const prop = baseHist > 0 ? asIsU[id] / baseHist : 1 / idsLivres.length; revU[id] = restante * prop; });
        } else if (idsLivres.length && restante <= 0) {
          idsLivres.forEach((id) => (revU[id] = 0));
          const somaEd = somaEditados || 1; const fator = vagaU / somaEd;
          idsVaga.filter((id) => foiEditado[id]).forEach((id) => (revU[id] *= fator));
        }
      }
      st.processos.forEach((p) => (recupPorProc[p.id] += revU[p.id]));
    });

    // monta as linhas: por processo, matrícula do cenário -> inscritos -> pagos
    // conversão é "mista" quando é holding (média ponderada pelas matrículas de cada praça)
    const linhasProc = st.processos.map((p) => {
      const matric = recupPorProc[p.id];
      const semInsc = ehFIES(p.nome); // FIES não tem inscrição
      // conversão agregada no filtro: média das praças ponderada por matrícula do cenário
      let numConv = 0, denConv = 0, numPag = 0, denPag = 0;
      alvoUnis.forEach((u) => {
        const cm = convMatric(u, p.id);
        const tp = taxaPagto(u, p.id);
        const mU = st.meta[`${alvo}|${u}`] || {};
        const asIsU = g(st.funil, `${cicloAsIs}|${u}|${p.id}`, "matric");
        const peso = Math.max(asIsU, 1); // pondera pela presença histórica da praça no processo
        if (isFinite(cm) && cm > 0) { numConv += cm * peso; denConv += peso; }
        if (isFinite(tp) && tp > 0) { numPag += tp * peso; denPag += peso; }
      });
      const conv = denConv > 0 ? numConv / denConv : NaN;
      const txPag = denPag > 0 ? numPag / denPag : NaN;
      const inscNec = !semInsc && matric > 0 && isFinite(conv) && conv > 0 ? matric / conv : (semInsc ? null : 0);
      const pagoNec = inscNec != null && isFinite(txPag) ? inscNec * txPag : (semInsc ? null : 0);
      return { p, grupo: grupoDe(p.nome), matric, conv, txPag, inscNec, pagoNec, semInsc };
    }).filter((x) => x.matric > 0.5 || x.inscNec > 0.5);

    const totInsc = linhasProc.reduce((a, x) => a + (x.inscNec || 0), 0);
    const totPago = linhasProc.reduce((a, x) => a + (x.pagoNec || 0), 0);
    const totMatric = linhasProc.reduce((a, x) => a + (x.matric || 0), 0);

    const nomeUni = uniSel === "__holding__" ? "Holding (todas as unidades)" : (st.unidades.find((u) => u.id === uniSel) || {}).nome;
    return { alvo, linhasProc, totInsc, totPago, totMatric, nomeUni, janela3 };
  }, [st, uniSel]);

  if (erro) return <div style={{ padding: 24, color: "#9B1C1C", fontFamily: "system-ui" }}>Erro ao carregar: {erro}</div>;
  if (!st || !D) return <div style={{ padding: 24, color: "#4A5C57", fontFamily: "system-ui" }}>Carregando…</div>;

  const wrap = { fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A1A1A", maxWidth: 1100, margin: "0 auto", padding: "0 16px 40px" };
  const card = { background: "#fff", border: "1px solid #E4EAE8", borderRadius: 10, marginBottom: 16, overflow: "hidden" };
  const cardH = { padding: "12px 16px", fontWeight: 700, color: "#0E1F1B", fontFamily: "Georgia, serif", fontSize: 16, borderBottom: "1px solid #EEF2F1" };
  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
  const th = { textAlign: "right", padding: "8px 10px", borderBottom: "2px solid #0F5F4E", color: "#0E1F1B", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
  const thL = { ...th, textAlign: "left" };
  const td = { textAlign: "right", padding: "7px 10px", borderBottom: "1px solid #EEF2F1", fontFamily: "ui-monospace, monospace" };
  const tdL = { ...td, textAlign: "left", fontFamily: "system-ui" };
  const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 };
  const kpiCard = { background: "#fff", border: "1px solid #E4EAE8", borderRadius: 10, padding: "12px 14px" };
  const kpiRot = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "#4A5C57", marginBottom: 4 };
  const kpiVal = { fontSize: 24, fontWeight: 700, fontFamily: "ui-monospace, monospace" };

  return (
    <div style={wrap}>
      <div style={{ padding: "18px 0 10px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#4A5C57" }}>Planejamento comercial · Clariens</div>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "Georgia, serif", color: "#0F5F4E" }}>Meta de inscritos e pagos · {D.alvo}</div>
        <div style={{ marginTop: 8 }}>
          <select value={uniSel} onChange={(e) => setUniSel(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #D8E0DD", borderRadius: 6, fontSize: 13 }}>
            <option value="__holding__">Holding (todas as unidades)</option>
            {st.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
      </div>

      <div style={kpiGrid}>
        <div style={kpiCard}><div style={kpiRot}>Meta de matrículas</div><div style={{ ...kpiVal, color: "#0E1F1B" }}>{f0(D.totMatric)}</div></div>
        <div style={kpiCard}><div style={kpiRot}>Meta de inscritos</div><div style={{ ...kpiVal, color: "#0F5F4E" }}>{f0(D.totInsc)}</div></div>
        <div style={kpiCard}><div style={kpiRot}>Meta de inscritos pagos</div><div style={{ ...kpiVal, color: "#8A6100" }}>{f0(D.totPago)}</div></div>
        <div style={kpiCard}><div style={kpiRot}>Taxa de pagamento média</div><div style={{ ...kpiVal, color: "#0E1F1B" }}>{pct(D.totInsc > 0 ? D.totPago / D.totInsc : NaN)}</div></div>
      </div>

      <div style={card}>
        <div style={cardH}>Meta por processo · {D.nomeUni}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead><tr>
              <th style={thL}>Processo</th>
              <th style={th}>Meta matríc.</th>
              <th style={th}>Conv. inscrito→matríc.</th>
              <th style={th}>Meta inscritos</th>
              <th style={th}>Taxa pagto.</th>
              <th style={th}>Meta inscritos pagos</th>
            </tr></thead>
            <tbody>
              {D.linhasProc.map((x) => (
                <tr key={x.p.id}>
                  <td style={tdL}>{x.p.nome}{x.semInsc && <span style={{ fontSize: 9, color: "#8A6100", marginLeft: 6 }}>sem inscrição</span>}</td>
                  <td style={td}>{f0(x.matric)}</td>
                  <td style={{ ...td, color: "#4A5C57" }}>{x.semInsc ? "—" : pct(x.conv, 1)}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#0F5F4E" }}>{x.semInsc || !(x.inscNec > 0) ? "—" : f0(x.inscNec)}</td>
                  <td style={{ ...td, color: "#4A5C57" }}>{x.semInsc ? "—" : pct(x.txPag, 0)}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#8A6100" }}>{x.semInsc || !(x.pagoNec > 0) ? "—" : f0(x.pagoNec)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...tdL, fontWeight: 700, borderTop: "2px solid #0F5F4E" }}>Total</td>
                <td style={{ ...td, fontWeight: 700, borderTop: "2px solid #0F5F4E" }}>{f0(D.totMatric)}</td>
                <td style={{ ...td, borderTop: "2px solid #0F5F4E" }}></td>
                <td style={{ ...td, fontWeight: 700, color: "#0F5F4E", borderTop: "2px solid #0F5F4E" }}>{f0(D.totInsc)}</td>
                <td style={{ ...td, borderTop: "2px solid #0F5F4E" }}></td>
                <td style={{ ...td, fontWeight: 700, color: "#8A6100", borderTop: "2px solid #0F5F4E" }}>{f0(D.totPago)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: "10px 16px", fontSize: 11.5, color: "#4A5C57", lineHeight: 1.5 }}>
          A <b>meta de matrículas</b> vem do cenário Recuperação (fecha na vaga). A <b>meta de inscritos</b> = matrículas ÷ conversão inscrito→matrícula; a <b>meta de inscritos pagos</b> = inscritos × taxa de pagamento. Conversão e taxa são a média simples dos 3 últimos intakes ({D.janela3.slice().reverse().join(", ")}), ignorando ciclos sem inscrição. FIES fica fora (não tem inscrição).
        </div>
      </div>
    </div>
  );
}
