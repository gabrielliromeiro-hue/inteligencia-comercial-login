import React, { useState, useEffect, useMemo } from "react";
import * as E from "./lib/engine-core.js";
import { carregarTudo } from "./lib/dados.js";

const f0 = (n) => (isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—");
const pct = (n, d = 0) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
const brl = (n) => (isFinite(n) ? "R$ " + Math.round(n).toLocaleString("pt-BR") : "—");
const div = E.safeDiv;
const num = E.parseNum;

export default function Insights() {
  const [st, setSt] = useState(null);
  const [erro, setErro] = useState("");
  const [uniSel, setUniSel] = useState("__holding__");

  useEffect(() => { carregarTudo().then(setSt).catch((e) => setErro(e.message || String(e))); }, []);

  const D = useMemo(() => {
    if (!st) return null;
    const g = (o, k, c) => num((o[k] || {})[c]);
    const alvoUnis = uniSel === "__holding__" ? st.unidades.map((u) => u.id) : [uniSel];
    const ciclosPassados = st.ciclos.filter((c) => c <= st.ciclos[st.ciclos.length - 1]).sort();

    // agrega por ciclo (soma unidades selecionadas)
    const porCiclo = ciclosPassados.map((cic) => {
      let insc = 0, pagas = 0, matric = 0, inv = 0;
      alvoUnis.forEach((u) => st.processos.forEach((p) => {
        const k = `${cic}|${u}|${p.id}`;
        insc += g(st.funil, k, "insc"); pagas += g(st.funil, k, "pagas"); matric += g(st.funil, k, "matric");
      }));
      alvoUnis.forEach((u) => st.canais.forEach((cn) => { inv += g(st.canal, `${cic}|${u}|${cn.id}`, "inv"); }));
      return { ciclo: cic, insc, pagas, matric, inv, taxaPag: div(pagas, insc), conv: div(matric, pagas), cac: div(inv, matric), temDado: insc + pagas + matric > 0 };
    }).filter((x) => x.temDado);

    // ==== INSIGHTS por regras auditáveis ====
    const ins = [];
    if (porCiclo.length >= 2) {
      // 1. ciclo com maior taxa de pagamento
      const maxPag = [...porCiclo].filter(c => isFinite(c.taxaPag)).sort((a, b) => b.taxaPag - a.taxaPag)[0];
      const mediaPag = porCiclo.filter(c => isFinite(c.taxaPag)).reduce((a, c) => a + c.taxaPag, 0) / porCiclo.filter(c => isFinite(c.taxaPag)).length;
      if (maxPag && maxPag.taxaPag > mediaPag * 1.05) {
        ins.push({ tipo: "padrao", titulo: `${maxPag.ciclo} teve a maior taxa de pagamento de inscrição`,
          texto: `Naquele ciclo, ${pct(maxPag.taxaPag)} dos inscritos pagaram a taxa, contra média de ${pct(mediaPag)} no período. Isso rendeu ${f0(maxPag.pagas)} inscrições pagas.`,
          hipotese: `Vale investigar o que foi diferente em ${maxPag.ciclo} (campanha, prazo, valor da taxa, mix de canal). Se for replicável, é alavanca de topo de funil para o próximo ciclo.` });
      }
      // 2. correlação inscritos pagos -> matrículas
      const maxPagas = [...porCiclo].sort((a, b) => b.pagas - a.pagas)[0];
      const maxMatric = [...porCiclo].sort((a, b) => b.matric - a.matric)[0];
      if (maxPagas && maxMatric && maxPagas.ciclo === maxMatric.ciclo) {
        ins.push({ tipo: "correlacao", titulo: `Mais inscrições pagas acompanhou mais matrículas em ${maxPagas.ciclo}`,
          texto: `O ciclo com mais inscrições pagas (${f0(maxPagas.pagas)}) foi também o de mais matrículas (${f0(maxMatric.matric)}). A conversão paga→matrícula foi ${pct(maxPagas.conv)}.`,
          hipotese: `Os dados são consistentes com a tese de "encher a boca do funil": mais inscrições pagas tenderam a virar mais matrículas. ATENÇÃO: é correlação, não prova de causa — pode ter havido campanha ou vestibular extra naquele ciclo. Teste aumentando inscrições pagas de forma controlada e meça se a conversão se mantém.` });
      }
      // 3. tendência de conversão
      const comConv = porCiclo.filter(c => isFinite(c.conv));
      if (comConv.length >= 3) {
        const ult3 = comConv.slice(-3);
        if (ult3[0].conv > ult3[1].conv && ult3[1].conv > ult3[2].conv) {
          ins.push({ tipo: "alerta", titulo: `Conversão paga→matrícula caindo há 3 ciclos`,
            texto: `Passou de ${pct(ult3[0].conv)} para ${pct(ult3[2].conv)}. Você está trazendo inscrições pagas, mas elas viram matrícula com menos eficiência.`,
            hipotese: `Encher o funil pode não bastar se o fundo está furando. Vale olhar o processo de matrícula (atendimento, prazo, condição de pagamento) antes de só aumentar investimento de topo.` });
        } else if (ult3[0].conv < ult3[1].conv && ult3[1].conv < ult3[2].conv) {
          ins.push({ tipo: "positivo", titulo: `Conversão paga→matrícula melhorando há 3 ciclos`,
            texto: `Subiu de ${pct(ult3[0].conv)} para ${pct(ult3[2].conv)}. O fundo do funil está mais eficiente.`,
            hipotese: `Com o fundo melhorando, investir mais em topo de funil tende a ter retorno maior agora do que antes. Momento favorável para escalar captação.` });
        }
      }
      // 4. eficiência de CAC
      const comCac = porCiclo.filter(c => isFinite(c.cac) && c.cac > 0);
      if (comCac.length >= 2) {
        const melhorCac = [...comCac].sort((a, b) => a.cac - b.cac)[0];
        ins.push({ tipo: "padrao", titulo: `${melhorCac.ciclo} teve o melhor custo por matrícula`,
          texto: `CAC de ${brl(melhorCac.cac)} naquele ciclo, o mais baixo do histórico. Trouxe ${f0(melhorCac.matric)} matrículas com ${brl(melhorCac.inv)} de investimento.`,
          hipotese: `Entender o mix de canais de ${melhorCac.ciclo} pode revelar a alocação mais eficiente para replicar no próximo ciclo.` });
      }
    }

    return { porCiclo, ins, nomeUni: uniSel === "__holding__" ? "Holding (todas as unidades)" : (st.unidades.find((u) => u.id === uniSel) || {}).nome };
  }, [st, uniSel]);

  if (erro) return <div style={{ background: "#FBE9E9", color: "#9B1C1C", padding: 16, borderRadius: 8, margin: 20 }}>{erro}</div>;
  if (!st || !D) return <div style={{ color: "#4A5C57", padding: 20 }}>Carregando...</div>;

  const corTipo = { padrao: "#0F5F4E", correlacao: "#2E6DA4", alerta: "#9B1C1C", positivo: "#0F5F4E", "": "#4A5C57" };
  const bgTipo = { padrao: "#E4EFEB", correlacao: "#E8F0F7", alerta: "#FBE9E9", positivo: "#E4EFEB", "": "#F1F4F3" };
  const rotuloTipo = { padrao: "Padrão nos dados", correlacao: "Correlação observada", alerta: "Ponto de atenção", positivo: "Sinal positivo" };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={eyebrow}>Leitura dos dados · Clariens</div>
        <h1 style={titulo}>Insights e hipóteses</h1>
      </div>

      <div style={filtros}>
        <div style={fld}><span style={lbl}>Unidade</span>
          <select style={sel} value={uniSel} onChange={(e) => setUniSel(e.target.value)}>
            <option value="__holding__">Holding (todas)</option>
            {st.unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#4A5C57" }}>{D.nomeUni}</div>
      </div>

      <div style={aviso}>
        Estes insights são lidos diretamente dos números que a equipe preencheu, por regras fixas e auditáveis.
        As <b>hipóteses de ação</b> são sugestões a testar, não conclusões: correlação nos dados não prova causa.
        A decisão é sua.
      </div>

      {D.ins.length === 0 && (
        <div style={card}><div style={{ padding: 20, color: "#4A5C57", fontSize: 13 }}>
          Ainda não há dados suficientes para gerar insights. Preencha pelo menos dois ciclos com histórico na aba Sistema.
        </div></div>
      )}

      {D.ins.map((x, i) => (
        <div key={i} style={{ ...card, borderLeft: `4px solid ${corTipo[x.tipo]}` }}>
          <div style={{ padding: "14px 16px" }}>
            <span style={{ ...selo, background: bgTipo[x.tipo], color: corTipo[x.tipo] }}>{rotuloTipo[x.tipo]}</span>
            <div style={insTitulo}>{x.titulo}</div>
            <div style={insTexto}>{x.texto}</div>
            <div style={hipBox}><span style={hipLbl}>Hipótese a testar</span>{x.hipotese}</div>
          </div>
        </div>
      ))}

      {/* Tabela de suporte: métricas por ciclo */}
      {D.porCiclo.length > 0 && (
        <div style={card}>
          <div style={cardH}>Métricas por ciclo (base dos insights)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead><tr>
                <th style={thL}>Ciclo</th><th style={th}>Inscrições</th><th style={th}>Pagas</th><th style={th}>Matrículas</th>
                <th style={th}>Taxa pagto</th><th style={th}>Paga→Mat</th><th style={th}>CAC</th>
              </tr></thead>
              <tbody>
                {D.porCiclo.map((c) => (
                  <tr key={c.ciclo}>
                    <td style={tdL}>{c.ciclo}</td><td style={td}>{f0(c.insc)}</td><td style={td}>{f0(c.pagas)}</td>
                    <td style={td}>{f0(c.matric)}</td><td style={td}>{pct(c.taxaPag)}</td><td style={td}>{pct(c.conv)}</td>
                    <td style={td}>{isFinite(c.cac) && c.cac > 0 ? brl(c.cac) : "—"}</td>
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
const filtros = { display: "flex", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "10px 14px", marginBottom: 14 };
const fld = { display: "flex", alignItems: "center", gap: 7 };
const lbl = { fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5C57", fontWeight: 700 };
const sel = { border: "1px solid #D8E0DD", borderRadius: 4, padding: "5px 8px", fontSize: 13, background: "#fff", color: "#0E1F1B" };
const aviso = { background: "#FBF2DC", border: "1px solid #E8D9A8", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#6B5200", lineHeight: 1.5, marginBottom: 16 };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, overflow: "hidden", marginBottom: 12 };
const cardH = { fontFamily: "Georgia,serif", fontSize: 14, padding: "12px 16px", borderBottom: "1px solid #D8E0DD", color: "#0E1F1B" };
const selo = { display: "inline-block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, padding: "2px 8px", borderRadius: 10, marginBottom: 8 };
const insTitulo = { fontFamily: "Georgia,serif", fontSize: 15, color: "#0E1F1B", marginBottom: 6 };
const insTexto = { fontSize: 13, color: "#2A3B36", lineHeight: 1.55, marginBottom: 10 };
const hipBox = { background: "#F6F8F8", borderRadius: 6, padding: "10px 12px", fontSize: 12.5, color: "#4A5C57", lineHeight: 1.55 };
const hipLbl = { display: "block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".07em", color: "#8A6100", fontWeight: 700, marginBottom: 3 };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const th = { textAlign: "right", padding: "8px 12px", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "#4A5C57", fontWeight: 700, borderBottom: "1px solid #D8E0DD", background: "#FAFBFB", whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const td = { padding: "7px 12px", borderBottom: "1px solid #EDF1F0", textAlign: "right", fontFamily: "ui-monospace,Menlo,monospace", color: "#0E1F1B" };
const tdL = { ...td, textAlign: "left", fontFamily: "inherit", fontWeight: 600 };
