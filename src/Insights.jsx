import React, { useState, useEffect, useMemo } from "react";
import * as E from "./lib/engine-core.js";
import { carregarTudo } from "./lib/dados.js";

const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
const f1 = (n) => (isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");
const pct = (n, d = 1) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
const sgn = (n) => (n > 0 ? "+" : "") + f0(n);
const brl = (n) => (isFinite(n) ? "R$ " + Math.round(n).toLocaleString("pt-BR") : "—");
const div = E.safeDiv;
const num = E.parseNum;

// grupo de processo (mesma regra da Executiva)
const grupoDe = (nome) => {
  const n = (nome || "").toLowerCase();
  if (n.includes("transfer") && n.includes("fies")) return "Transferência FIES";
  if (n.includes("transfer")) return "Transferência";
  if (n.includes("recuper")) return "Recuperado";
  if (n.includes("fies")) return "FIES";
  return "Self paid";
};

export default function Insights() {
  const [st, setSt] = useState(null);
  const [erro, setErro] = useState("");
  const [uniSel, setUniSel] = useState("__holding__");

  useEffect(() => { carregarTudo().then(setSt).catch((e) => setErro(e.message || String(e))); }, []);

  const D = useMemo(() => {
    if (!st) return null;
    const g = (o, k, c) => num((o[k] || {})[c]);
    const alvoUnis = uniSel === "__holding__" ? st.unidades.map((u) => u.id) : [uniSel];

    // agrega funil de um processo num ciclo (somando unidades selecionadas)
    const dadoProc = (cic, pid) => {
      let insc = 0, pagas = 0, matric = 0;
      alvoUnis.forEach((u) => {
        const k = `${cic}|${u}|${pid}`;
        insc += g(st.funil, k, "insc"); pagas += g(st.funil, k, "pagas"); matric += g(st.funil, k, "matric");
      });
      return { insc, pagas, matric, taxaPag: div(pagas, insc), convPagaMat: div(matric, pagas), convGlobal: div(matric, insc) };
    };

    // pares de ciclos homólogos disponíveis (ex: 2025.1->2026.1), do mais recente
    const ciclos = st.ciclos.slice().sort();
    const pares = [];
    ciclos.forEach((cic) => {
      const [ano, sem] = cic.split(".");
      const anoAnt = String(Number(ano) - 1) + "." + sem;
      if (ciclos.includes(anoAnt)) pares.push({ de: anoAnt, para: cic });
    });
    const parRecente = pares[pares.length - 1]; // comparação principal

    // DIAGNÓSTICO por processo (camadas 1, 2, 3) para o par mais recente
    const diagnosticos = [];
    if (parRecente) {
      st.processos.forEach((p) => {
        const a = dadoProc(parRecente.de, p.id);   // antes
        const b = dadoProc(parRecente.para, p.id);  // depois
        if (a.matric + b.matric === 0) return; // sem dado nesse processo

        const grupo = grupoDe(p.nome);
        const deltaMat = b.matric - a.matric;

        // CAMADA 1 — decomposição volume vs conversão
        // efeito volume: variação de inscrições × conversão global antiga
        // efeito conversão: inscrições novas × variação de conversão global
        const efeitoVolume = (b.insc - a.insc) * (isFinite(a.convGlobal) ? a.convGlobal : 0);
        const efeitoConversao = b.insc * ((isFinite(b.convGlobal) ? b.convGlobal : 0) - (isFinite(a.convGlobal) ? a.convGlobal : 0));

        // CAMADA 2 — onde está o gargalo (qual etapa vazou mais, comparando as taxas)
        const deltaTaxaPag = (isFinite(b.taxaPag) ? b.taxaPag : 0) - (isFinite(a.taxaPag) ? a.taxaPag : 0);
        const deltaConvPM = (isFinite(b.convPagaMat) ? b.convPagaMat : 0) - (isFinite(a.convPagaMat) ? a.convPagaMat : 0);
        let gargalo = null;
        if (deltaMat < 0) {
          // onde piorou mais
          if (deltaTaxaPag < -0.02 && deltaTaxaPag <= deltaConvPM) gargalo = { etapa: "inscrito → pago", queda: deltaTaxaPag, de: a.taxaPag, para: b.taxaPag };
          else if (deltaConvPM < -0.02) gargalo = { etapa: "pago → matrícula", queda: deltaConvPM, de: a.convPagaMat, para: b.convPagaMat };
        }

        // CAMADA 3 — o que testar (hipótese, com ressalva de conversão)
        let hipotese;
        const convManteve = Math.abs((isFinite(b.convGlobal) ? b.convGlobal : 0) - (isFinite(a.convGlobal) ? a.convGlobal : 0)) < 0.02;
        if (deltaMat < 0 && Math.abs(efeitoVolume) > Math.abs(efeitoConversao) && convManteve) {
          hipotese = `A queda veio principalmente de MENOS inscrições, com a conversão praticamente estável (${pct(a.convGlobal)} → ${pct(b.convGlobal)}). Aqui a tese de "encher o topo do funil" tem suporte: como a conversão se manteve, recuperar o volume de inscrições tende a recuperar matrículas na mesma proporção. Teste um incremento controlado de captação e confirme se a conversão segura.`;
        } else if (deltaMat < 0 && Math.abs(efeitoConversao) >= Math.abs(efeitoVolume)) {
          hipotese = `ATENÇÃO: a queda veio principalmente de CONVERSÃO pior, não de volume. Encher o topo do funil aqui desperdiça verba — o problema está no funil furando (${gargalo ? "etapa " + gargalo.etapa : "conversão global caiu"}). Antes de investir em mais inscrições, ataque a etapa que está vazando.`;
        } else if (deltaMat > 0 && Math.abs(efeitoVolume) > Math.abs(efeitoConversao)) {
          hipotese = `O crescimento veio de MAIS inscrições. Se a fonte desse volume é sustentável (não foi um pico pontual), manter o investimento de topo tende a sustentar o resultado. Confirme de qual canal veio esse volume na aba Verba.`;
        } else if (deltaMat > 0) {
          hipotese = `O crescimento veio de CONVERSÃO melhor, não de mais volume — o funil ficou mais eficiente. Momento favorável: com a conversão em alta, investir em topo de funil rende mais agora. Vale escalar captação enquanto a eficiência está boa.`;
        } else {
          hipotese = `Matrículas praticamente estáveis entre ${parRecente.de} e ${parRecente.para}. Sem sinal forte de volume nem de conversão para agir.`;
        }

        diagnosticos.push({
          proc: p.nome, grupo, a, b, deltaMat, efeitoVolume, efeitoConversao, gargalo, hipotese,
        });
      });
    }

    // ordena: maior variação absoluta primeiro (o que mais mexeu)
    diagnosticos.sort((x, y) => Math.abs(y.deltaMat) - Math.abs(x.deltaMat));

    // resumo por grupo (self paid, FIES...) para o topo
    const porGrupo = {};
    diagnosticos.forEach((d) => {
      if (!porGrupo[d.grupo]) porGrupo[d.grupo] = { matA: 0, matB: 0 };
      porGrupo[d.grupo].matA += d.a.matric; porGrupo[d.grupo].matB += d.b.matric;
    });

    return { diagnosticos, parRecente, pares, porGrupo,
      nomeUni: uniSel === "__holding__" ? "Holding (todas as unidades)" : (st.unidades.find((u) => u.id === uniSel) || {}).nome };
  }, [st, uniSel]);

  if (erro) return <div style={{ background: "#FBE9E9", color: "#9B1C1C", padding: 16, borderRadius: 8, margin: 20 }}>{erro}</div>;
  if (!st || !D) return <div style={{ color: "#4A5C57", padding: 20 }}>Carregando...</div>;

  const corGrupo = { "Self paid": "#0F5F4E", "FIES": "#8A6100", "Transferência": "#6B4A8A", "Transferência FIES": "#6B4A8A", "Recuperado": "#2E6DA4" };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={eyebrow}>Diagnóstico de captação · Clariens</div>
        <h1 style={titulo}>Diagnóstico por processo</h1>
      </div>

      <div style={filtros}>
        <div style={fld}><span style={lbl}>Unidade</span>
          <select style={sel} value={uniSel} onChange={(e) => setUniSel(e.target.value)}>
            <option value="__holding__">Holding (todas)</option>
            {st.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#4A5C57" }}>
          {D.parRecente ? `Comparando ${D.parRecente.de} → ${D.parRecente.para} (ciclos homólogos)` : "Sem par homólogo"}
        </div>
      </div>

      <div style={aviso}>
        Diagnóstico lido dos dados, comparando ciclos homólogos (mesma entrada do ano anterior). Cada análise separa
        o efeito <b>volume</b> (mudou o nº de inscrições) do efeito <b>conversão</b> (mudou a taxa) — porque "aumentar inscrições"
        só vira matrícula se a conversão se mantiver. As <b>hipóteses de ação</b> são para testar, não conclusões.
      </div>

      {!D.parRecente && (
        <div style={card}><div style={{ padding: 20, color: "#4A5C57", fontSize: 13 }}>
          Ainda não há dois ciclos homólogos preenchidos (ex: 2025.1 e 2026.1). Preencha na aba Sistema para o diagnóstico aparecer.
        </div></div>
      )}

      {D.diagnosticos.map((d, i) => (
        <div key={i} style={{ ...card, borderLeft: `4px solid ${corGrupo[d.grupo] || "#4A5C57"}` }}>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ ...selo, background: "#F1F4F3", color: corGrupo[d.grupo] || "#4A5C57" }}>{d.grupo}</span>
              <span style={insTitulo}>{d.proc}</span>
              <span style={{ marginLeft: "auto", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 15, fontWeight: 700, color: d.deltaMat > 0 ? "#0F5F4E" : d.deltaMat < 0 ? "#9B1C1C" : "#4A5C57" }}>
                {sgn(d.deltaMat)} matríc.
              </span>
            </div>

            {/* Camada 1 — decomposição */}
            <div style={sec}>
              <div style={secTit}>1 · De onde veio a variação</div>
              <div style={{ fontSize: 13, color: "#2A3B36", lineHeight: 1.55 }}>
                Matrículas foram de <b>{f0(d.a.matric)}</b> ({D.parRecente.de}) para <b>{f0(d.b.matric)}</b> ({D.parRecente.para}).
                Dessa variação de {sgn(d.deltaMat)}, cerca de <b style={{ color: Math.abs(d.efeitoVolume) >= Math.abs(d.efeitoConversao) ? "#0E1F1B" : "#4A5C57" }}>{sgn(d.efeitoVolume)}</b> veio
                da mudança no <b>volume de inscrições</b> e <b style={{ color: Math.abs(d.efeitoConversao) > Math.abs(d.efeitoVolume) ? "#0E1F1B" : "#4A5C57" }}>{sgn(d.efeitoConversao)}</b> da
                mudança na <b>taxa de conversão</b>.
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11.5, color: "#4A5C57", fontFamily: "ui-monospace,Menlo,monospace" }}>
                <span>Inscrições: {f0(d.a.insc)} → {f0(d.b.insc)}</span>
                <span>Conv. global: {pct(d.a.convGlobal)} → {pct(d.b.convGlobal)}</span>
              </div>
            </div>

            {/* Camada 2 — gargalo */}
            {d.gargalo && (
              <div style={sec}>
                <div style={secTit}>2 · Onde o funil vazou</div>
                <div style={{ fontSize: 13, color: "#2A3B36", lineHeight: 1.55 }}>
                  A maior perda foi na etapa <b>{d.gargalo.etapa}</b>: caiu de {pct(d.gargalo.de)} para {pct(d.gargalo.para)}.
                  É aí que a matrícula está escapando.
                </div>
              </div>
            )}

            {/* Camada 3 — hipótese */}
            <div style={hipBox}>
              <span style={hipLbl}>3 · Hipótese a testar</span>
              {d.hipotese}
            </div>
          </div>
        </div>
      ))}

      {/* Tabela de suporte */}
      {D.diagnosticos.length > 0 && (
        <div style={card}>
          <div style={cardH}>Suporte — {D.parRecente.de} vs {D.parRecente.para}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead><tr>
                <th style={thL}>Processo</th><th style={th}>Insc. {D.parRecente.de}</th><th style={th}>Insc. {D.parRecente.para}</th>
                <th style={th}>Mat. {D.parRecente.de}</th><th style={th}>Mat. {D.parRecente.para}</th>
                <th style={th}>Conv. {D.parRecente.de}</th><th style={th}>Conv. {D.parRecente.para}</th>
              </tr></thead>
              <tbody>
                {D.diagnosticos.map((d, i) => (
                  <tr key={i}>
                    <td style={tdL}>{d.proc}</td>
                    <td style={td}>{f0(d.a.insc)}</td><td style={td}>{f0(d.b.insc)}</td>
                    <td style={td}>{f0(d.a.matric)}</td><td style={td}>{f0(d.b.matric)}</td>
                    <td style={tdMut}>{pct(d.a.convGlobal)}</td><td style={tdMut}>{pct(d.b.convGlobal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const eyebrow = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "#4A5C57", fontWeight: 700 };
const titulo = { fontFamily: "Georgia,serif", fontSize: 24, color: "#0E1F1B", margin: "4px 0 0" };
const filtros = { display: "flex", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap" };
const fld = { display: "flex", alignItems: "center", gap: 7 };
const lbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5C57", fontWeight: 700 };
const sel = { border: "1px solid #D8E0DD", borderRadius: 4, padding: "5px 8px", fontSize: 13, background: "#fff", color: "#0E1F1B" };
const aviso = { background: "#FBF2DC", border: "1px solid #E8D9A8", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#6B5200", lineHeight: 1.55, marginBottom: 16 };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, overflow: "hidden", marginBottom: 12 };
const cardH = { fontFamily: "Georgia,serif", fontSize: 14, padding: "12px 16px", borderBottom: "1px solid #D8E0DD", color: "#0E1F1B" };
const selo = { display: "inline-block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, padding: "2px 8px", borderRadius: 10 };
const insTitulo = { fontFamily: "Georgia,serif", fontSize: 16, color: "#0E1F1B" };
const sec = { marginBottom: 12 };
const secTit = { fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "#0F5F4E", fontWeight: 700, marginBottom: 4 };
const hipBox = { background: "#F6F8F8", borderRadius: 6, padding: "10px 12px", fontSize: 12.5, color: "#4A5C57", lineHeight: 1.55, borderLeft: "3px solid #E8D9A8" };
const hipLbl = { display: "block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".07em", color: "#8A6100", fontWeight: 700, marginBottom: 3 };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "right", padding: "8px 10px", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "#4A5C57", fontWeight: 700, borderBottom: "1px solid #D8E0DD", background: "#FAFBFB", whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const td = { padding: "7px 10px", borderBottom: "1px solid #EDF1F0", textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", color: "#0E1F1B" };
const tdMut = { ...td, color: "#4A5C57" };
const tdL = { ...td, textAlign: "left", fontFamily: "inherit", fontWeight: 600 };
