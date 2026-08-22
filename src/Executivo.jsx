// VERSAO-GRUPO-FIX-V6 (classificadores de grupo corrigidos)
import React, { useState, useEffect, useMemo } from "react";
import * as E from "./lib/engine-core.js";
import { carregarTudo, salvarReversao } from "./lib/dados.js";
import { f0, brl, brlK, div, num } from "./lib/format.js";

// pct local mantém default 0 casas (comportamento histórico desta tela)
const pct = (n, d = 0) => (isFinite(n) ? (n * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
// grupos cujo % de recuperação é editável (self-paid calouro e transferência externa; FIES compensa, não edita)
const ehGrupoEditavel = (grupo) => grupo === "selfpaid" || grupo === "transf";
const PALETA = ["#0F5F4E", "#2E8B72", "#5AAD95", "#8A6100", "#B08A3E", "#4A5C57", "#7D8F89"];

// célula do funil: número + cor + seta comparando ao ciclo homólogo
function funilCell(cell) {
  if (!cell || !(cell.val > 0)) return "—";
  const v = cell.varPct;
  if (v == null) return f0v(cell.val);
  const cor = v > 0.001 ? "#0F5F4E" : v < -0.001 ? "#9B1C1C" : "#4A5C57";
  const seta = v > 0.001 ? "▲" : v < -0.001 ? "▼" : "";
  return (
    <span style={{ color: cor }}>{f0v(cell.val)} <span style={{ fontSize: 9 }}>{seta}</span></span>
  );
}
function f0v(n) { return isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—"; }

export default function Executivo({ modo = "executivo" }) {
  const [st, setSt] = useState(null);
  const [erro, setErro] = useState("");
  const [uniSel, setUniSel] = useState("__holding__");
  const [cicloHist, setCicloHist] = useState("");
  const [editRev, setEditRev] = useState(false); // mostra a grade de edição por praça

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
      const m = st.meta[`${cfg.alvo}|${u}`] || {};
      // respeita os overrides de share gravados na aba Meta (sh_<processo>), igual o Sistema
      const ovP = {};
      st.processos.forEach((p) => { const v = num(m[`sh_${p.id}`]); if (v > 0) ovP[p.id] = v; });
      const shP = E.resolveShares(rf.share, ovP, st.processos.map((p) => p.id));
      const metaMatric = num(m.matric) * (cfg.cenario / 100);
      const out = {}; st.processos.forEach((p) => (out[p.id] = metaMatric * (shP.shares[p.id] || 0)));
      return { out, metaMatric, metaBase: num(m.matric) };
    };
    const projAgg = {}; let metaTotal = 0;
    st.processos.forEach((p) => (projAgg[p.id] = 0));
    alvoUnis.forEach((u) => { const pj = projUniProc(u); metaTotal += pj.metaMatric; st.processos.forEach((p) => (projAgg[p.id] += pj.out[p.id])); });
    const projTotal = st.processos.reduce((a, p) => a + projAgg[p.id], 0);


    // matriz share por processo x ciclo historico + previsto
    const ciclosHistoricos = st.ciclos.filter((c) => c < cfg.alvo).sort();
    const matrizShare = st.processos.map((p, idx) => {
      const porCiclo = ciclosHistoricos.map((cic) => {
        let mat = 0, tot = 0;
        alvoUnis.forEach((u) => {
          st.processos.forEach((pp) => { tot += g(st.funil, `${cic}|${u}|${pp.id}`, "matric"); });
          mat += g(st.funil, `${cic}|${u}|${p.id}`, "matric");
        });
        return tot > 0 ? mat / tot : NaN;
      });
      const prevShare = projTotal > 0 ? projAgg[p.id] / projTotal : NaN;
      return { nome: p.nome, cor: PALETA[idx % PALETA.length], porCiclo, prevShare };
    }).filter((r) => r.porCiclo.some((x) => isFinite(x)) || isFinite(r.prevShare));

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

    // Classificação em grupos (regra do board)
    // Self paid = Vestibular Tradicional + Agendado/Online + ENEM
    // Demais grupos separados: FIES, Transferência, Transferência FIES, Recuperado
    const grupoDe = (nome) => {
      const n = (nome || "").toLowerCase();
      if (n.includes("transfer") && n.includes("fies")) return "transfFies";
      if (n.includes("transfer")) return "transf";
      if (n.includes("recuper")) return "recuperado";
      if (n.includes("fies")) return "fies";
      if (n.includes("vestibular") || n.includes("enem")) return "selfpaid";
      return "selfpaid"; // default: segunda graduação e afins entram como self paid (calouro pagante)
    };
    const somaGrupo = (fonteProj, fonteHistArr) => {
      const G = { selfpaid: 0, fies: 0, transf: 0, transfFies: 0, recuperado: 0 };
      st.processos.forEach((p) => { G[grupoDe(p.nome)] += fonteProj[p.id] || 0; });
      const H = { selfpaid: 0, fies: 0, transf: 0, transfFies: 0, recuperado: 0 };
      fonteHistArr.forEach((x) => { H[grupoDe(x.p.nome)] += x.mat; });
      return { G, H };
    };
    const grp = somaGrupo(projAgg, histProc);
    const projSelfPaid = grp.G.selfpaid, projFies = grp.G.fies, projTransf = grp.G.transf, projTransfFies = grp.G.transfFies, projRecuperado = grp.G.recuperado;
    const histSelfPaid = grp.H.selfpaid, histFies = grp.H.fies, histTransf = grp.H.transf, histTransfFies = grp.H.transfFies, histRecuperado = grp.H.recuperado;

    // conversão global inscrito->matriculado (histórico do ciclo escolhido)
    let inscHist = 0, matHistG = 0, invHist = 0;
    alvoUnis.forEach((u) => st.processos.forEach((p) => {
      inscHist += g(st.funil, `${cicloHist}|${u}|${p.id}`, "insc");
      matHistG += g(st.funil, `${cicloHist}|${u}|${p.id}`, "matric");
    }));
    alvoUnis.forEach((u) => st.canais.forEach((c) => { invHist += g(st.canal, `${cicloHist}|${u}|${c.id}`, "inv"); }));
    const convGlobalHist = div(matHistG, inscHist);

    // CAC, CPI e previsão de inscritos (projetados para o alvo)
    // usa a razão histórica investimento/matrícula e investimento/inscrição, aplicada à meta
    const cacHist = div(invHist, matHistG);
    const cpiHist = div(invHist, inscHist);
    const previsaoInscritos = st.processos.reduce((a, p) => {
      // inscritos previstos = matrícula prevista / (conversão histórica do processo, aprox global)
      return a + (isFinite(convGlobalHist) && convGlobalHist > 0 ? (projAgg[p.id] || 0) / convGlobalHist : 0);
    }, 0);

    // vagas (= meta) e ociosidade da holding/unidade
    let vagasTot = 0;
    alvoUnis.forEach((u) => { vagasTot += num((st.meta[`${cfg.alvo}|${u}`] || {}).vagas); });

    // projeção que ocupa vaga (exclui transferências e recuperado) — base da ociosidade
    const ocupaVaga = (p) => p.ocupaVaga !== false;
    const projOcupaVaga = st.processos.filter(ocupaVaga).reduce((a, p) => a + projAgg[p.id], 0);
    const projNaoOcupa = projTotal - projOcupaVaga;

    // Funil por etapa x processo (ciclo histórico escolhido)
    const funilEtapas = st.processos.map((p) => {
      let insc = 0, pagas = 0, aprov = 0, conv = 0, matric = 0;
      alvoUnis.forEach((u) => {
        const k = `${cicloHist}|${u}|${p.id}`;
        insc += g(st.funil, k, "insc"); pagas += g(st.funil, k, "pagas");
        aprov += g(st.funil, k, "aprovados"); conv += g(st.funil, k, "convocados");
        matric += g(st.funil, k, "matric");
      });
      return { nome: p.nome, insc, pagas, aprov, conv, matric };
    }).filter((x) => x.insc + x.pagas + x.aprov + x.conv + x.matric > 0);
    const funilTotal = funilEtapas.reduce((a, x) => ({
      insc: a.insc + x.insc, pagas: a.pagas + x.pagas, aprov: a.aprov + x.aprov, conv: a.conv + x.conv, matric: a.matric + x.matric,
    }), { insc: 0, pagas: 0, aprov: 0, conv: 0, matric: 0 });

    // Funil por etapa AO LONGO DOS CICLOS (para a tabela de evolução do funil)
    const ciclosSeq = st.ciclos.slice().sort();
    const somaEtapasCiclo = (cic, pid) => {
      let insc = 0, pagas = 0, aprov = 0, conv = 0, matric = 0;
      alvoUnis.forEach((u) => {
        const filtro = pid ? [pid] : st.processos.map((p) => p.id);
        filtro.forEach((id) => {
          const k = `${cic}|${u}|${id}`;
          insc += g(st.funil, k, "insc"); pagas += g(st.funil, k, "pagas");
          aprov += g(st.funil, k, "aprovados"); conv += g(st.funil, k, "convocados"); matric += g(st.funil, k, "matric");
        });
      });
      return { insc, pagas, aprov, conv, matric };
    };
    // homólogo de um ciclo (ano anterior, mesmo semestre)
    const homologoDe = (cic) => { const [a, s] = cic.split("."); const h = (Number(a) - 1) + "." + s; return ciclosSeq.includes(h) ? h : null; };
    const etapasDef = [["insc", "Inscritos"], ["pagas", "Inscritos pagos"], ["aprov", "Aprovados"], ["conv", "Convocados"], ["matric", "Matriculados"]];
    // monta a evolução: para cada etapa, os valores por ciclo + variação vs homólogo
    const evolFunil = (pid) => {
      const porCicloRaw = {};
      ciclosSeq.forEach((c) => (porCicloRaw[c] = somaEtapasCiclo(c, pid)));
      // só ciclos com algum dado
      const ciclosComDado = ciclosSeq.filter((c) => { const d = porCicloRaw[c]; return d.insc + d.pagas + d.aprov + d.conv + d.matric > 0; });
      return etapasDef.map(([campo, rot]) => {
        const cells = ciclosComDado.map((c) => {
          const val = porCicloRaw[c][campo];
          const h = homologoDe(c);
          const valH = h && ciclosComDado.includes(h) ? porCicloRaw[h][campo] : null;
          const varPct = (valH != null && valH > 0) ? (val - valH) / valH : null;
          return { ciclo: c, val, varPct };
        });
        // variação do último ciclo com homólogo (para a coluna final)
        const ultComVar = [...cells].reverse().find((x) => x.varPct != null);
        return { campo, rot, cells, varFinal: ultComVar ? ultComVar.varPct : null };
      });
    };
    const evolFunilTotal = evolFunil(null);
    const ciclosFunil = (() => { const s = new Set(); evolFunilTotal.forEach((e) => e.cells.forEach((c) => s.add(c.ciclo))); return Array.from(s).sort(); })();
    const evolFunilPorProc = st.processos.map((p) => ({ nome: p.nome, linhas: evolFunil(p.id) }))
      .filter((x) => x.linhas.some((l) => l.cells.some((c) => c.val > 0)));

    // ==== EFICIÊNCIA DE VERBA e COMPARAÇÃO ENTRE UNIDADES ====
    // ciclo de referência para CAC canal-processo
    const semAlvoE = String(cfg.alvo).split(".")[1];
    let baseCP = st.ciclos.filter((c) => c < cfg.alvo);
    if (cfg.somenteHomologos) baseCP = baseCP.filter((c) => c.split(".")[1] === semAlvoE);
    baseCP = baseCP.sort().reverse();
    const cicloRefE = baseCP[0];
    const anosE = E.yearsBetween(cicloRefE || null, cfg.alvo);

    // por unidade: meta, CAC projetado agregado, investimento, conversão ref, ocupação, verba/gap
    const compUnidades = st.unidades.filter((u) => alvoUnis.includes(u.id)).map((u) => {
      const pj = projUniProc(u.id);
      const m = st.meta[`${cfg.alvo}|${u.id}`] || {};
      const vagas = num(m.vagas);
      // CAC projetado agregado da unidade: soma investimento / soma matrícula, por canal-processo
      let invTot = 0, matComCanal = 0;
      st.canais.forEach((c) => {
        st.processos.forEach((p) => {
          const k = `${cicloRefE}|${u.id}|${c.id}|${p.id}`;
          const d = st.canalProc[k] || {};
          const invB = num(d.inv), matB = num(d.matric);
          if (matB > 0) {
            const cacB = invB / matB;
            const infl = cfg.inflacao[c.id] !== undefined ? cfg.inflacao[c.id] : 0.07;
            // meta desse canal-processo pela proporção histórica simplificada
            const metaCP = pj.out[p.id] || 0; // meta do processo (aprox; refinado no Sistema)
            const pjc = E.projectCAC(cacB, infl, anosE, c.beta, metaCP, matB, cfg.saturacao);
            if (isFinite(pjc.cacProj)) { invTot += metaCP * pjc.cacProj * (matB / Math.max(1, matB)); }
          }
        });
      });
      // conversão global de referência
      let insc = 0, mat = 0;
      st.processos.forEach((p) => { insc += g(st.funil, `${cicloRefE}|${u.id}|${p.id}`, "insc"); mat += g(st.funil, `${cicloRefE}|${u.id}|${p.id}`, "matric"); });
      const convRef = div(mat, insc);
      const mens = u.mensalidade || 0;
      const cacUnidade = div(invTot, pj.metaMatric);
      return { u, meta: pj.metaMatric, vagas, ocupacao: div(pj.metaMatric, vagas), inv: invTot, verba: num(m.verba), gap: invTot - num(m.verba), cacProj: cacUnidade, convRef, mens, custoPorReceita: mens > 0 ? div(cacUnidade, mens * 6) : NaN };
    }).filter((x) => x.meta > 0 || x.inv > 0);

    // eficiência por canal (holding): CAC projetado no volume da meta, separando escalável x não
    const canalEfic = st.canais.map((c) => {
      let invB = 0, matB = 0;
      alvoUnis.forEach((u) => st.processos.forEach((p) => {
        const d = st.canalProc[`${cicloRefE}|${u}|${c.id}|${p.id}`] || {};
        invB += num(d.inv); matB += num(d.matric);
      }));
      const cacB = div(invB, matB);
      const infl = cfg.inflacao[c.id] !== undefined ? cfg.inflacao[c.id] : 0.07;
      // volume alvo do canal = proporção histórica do canal na holding × meta total
      const matMetaCanal = matB; // referência; o volume real vem do plano
      const pjc = E.projectCAC(cacB, infl, anosE, c.beta, matMetaCanal, matB, cfg.saturacao);
      return { c, escalavel: c.pago !== false, cacBase: cacB, cacProj: pjc.cacProj, matBase: matB, invBase: invB };
    }).filter((x) => x.matBase > 0);
    const canalEsc = canalEfic.filter((x) => x.escalavel).sort((a, b) => (a.cacProj || 1e18) - (b.cacProj || 1e18));
    const canalNaoEsc = canalEfic.filter((x) => !x.escalavel).sort((a, b) => (a.cacProj || 1e18) - (b.cacProj || 1e18));

    // ==== 3 CENÁRIOS DE PROJEÇÃO (Tendência · As Is · Reversão) ====
    // ciclo homólogo anterior ao cicloHist, para medir a queda histórica por processo
    const semH = String(cicloHist).split(".")[1];
    const anoH = Number(String(cicloHist).split(".")[0]);
    const cicloHistAnt = (anoH - 1) + "." + semH; // homólogo do ciclo As Is
    const temAnt = st.ciclos.includes(cicloHistAnt);
    // classificação de processo
    const ehSelfPaid = (nome) => grupoDe(nome) === "selfpaid";
    const ehENEM = (nome) => (nome || "").toLowerCase().includes("enem");
    const ehTransfer = (nome) => grupoDe(nome) === "transf" || grupoDe(nome) === "transfFies";
    const ehFIES = (nome) => grupoDe(nome) === "fies";
    // calouro self-paid que ocupa vaga: Vestibular, Agendado, ENEM, Segunda Graduação (NÃO FIES, NÃO transferência)
    const ehCalouroSP = (p) => p.ocupaVaga !== false && ehSelfPaid(p.nome) && !ehTransfer(p.nome);

    // conversão ponderada dos 2 últimos intakes homólogos (peso maior no recente): 0.65 / 0.35
    const ciclosHomAll = st.ciclos.filter((c) => c.split(".")[1] === semH && c <= cicloHist).sort().reverse();
    const conv2ultimos = (uId, pid) => {
      const cs = ciclosHomAll.slice(0, 2); // [mais recente, anterior]
      const pesos = [0.65, 0.35];
      let numr = 0, den = 0;
      cs.forEach((c, i) => {
        const insc = g(st.funil, `${c}|${uId}|${pid}`, "insc");
        const mat = g(st.funil, `${c}|${uId}|${pid}`, "matric");
        if (insc > 0) { numr += pesos[i] * (mat / insc); den += pesos[i]; }
      });
      return den > 0 ? numr / den : NaN;
    };

    // As Is e Tendência por processo (base)
    const baseProc = st.processos.map((p) => {
      let asIs = 0;
      alvoUnis.forEach((u) => { asIs += g(st.funil, `${cicloHist}|${u}|${p.id}`, "matric"); });
      return { p, asIs, tend: projAgg[p.id] || 0 };
    });

    // ==== RECUPERAÇÃO SELF-PAID (por praça) — mecânica soma-zero ====
    // Cada processo self-paid calouro (Vestibular, ENEM, Segunda Graduação) cresce uma %
    // editável sobre o As Is (rv_<processo>, padrão 0 = sem crescimento). Tudo que o calouro
    // ganha em matrículas é subtraído do FIES (a vaga é fixa: o que entra de self-paid sai de
    // FIES). A Transferência cresce rv_transf% (padrão 8) de forma independente, sem tocar no
    // FIES (transferência não ocupa vaga de calouro).
    const TRANSF_PADRAO = 8;
    const pctVal = (raw, padrao) => { const v = num(raw); return isFinite(v) && v !== 0 ? v : padrao; };

    const recupPorProc = {};
    const porPracaProc = {};
    const detalhePraca = {};
    st.processos.forEach((p) => { recupPorProc[p.id] = 0; porPracaProc[p.id] = []; });

    alvoUnis.forEach((u) => {
      const mU = st.meta[`${cfg.alvo}|${u}`] || {};
      const asIsU = {};
      st.processos.forEach((p) => (asIsU[p.id] = g(st.funil, `${cicloHist}|${u}|${p.id}`, "matric")));

      // 1) self-paid calouro cresce a % editável de cada um; soma o ganho total
      let ganhoCalouro = 0;
      const revU = {};
      st.processos.forEach((p) => {
        revU[p.id] = asIsU[p.id];
        if (ehCalouroSP(p)) {
          const cresc = pctVal(mU[`rv_${p.id}`], 0) / 100; // padrão 0 = sem crescimento
          revU[p.id] = asIsU[p.id] * (1 + cresc);
          ganhoCalouro += revU[p.id] - asIsU[p.id];
        }
      });
      // 2) FIES compensa: cai exatamente o que o calouro ganhou (soma zero)
      const fiesP = st.processos.find((p) => ehFIES(p.nome));
      if (fiesP) revU[fiesP.id] = asIsU[fiesP.id] - ganhoCalouro;
      // 3) transferência cresce independente (não mexe no FIES)
      st.processos.forEach((p) => {
        if (ehTransfer(p.nome)) revU[p.id] = asIsU[p.id] * (1 + pctVal(mU.rv_transf, TRANSF_PADRAO) / 100);
      });

      st.processos.forEach((p) => {
        recupPorProc[p.id] += revU[p.id];
        const conv = conv2ultimos(u, p.id);
        const delta = revU[p.id] - asIsU[p.id];
        porPracaProc[p.id].push({ uId: u, asIs: asIsU[p.id], rev: revU[p.id], conv, deltaMat: delta,
          inscNec: delta > 0 && isFinite(conv) && conv > 0 ? delta / conv : 0 });
      });
      detalhePraca[u] = { ganhoCalouro, fiesAsIs: fiesP ? asIsU[fiesP.id] : 0 };
    });

    const cenariosProc = baseProc.map((b) => {
      const pp = porPracaProc[b.p.id] || [];
      return { p: b.p, grupo: grupoDe(b.p.nome), asIs: b.asIs, tend: b.tend,
        reversao: recupPorProc[b.p.id] || 0, porPraca: pp,
        inscRev: pp.reduce((a, x) => a + (x.inscNec || 0), 0),
        mexeRev: Math.abs((recupPorProc[b.p.id] || 0) - b.asIs) > 0.5,
        editavel: ehCalouroSP(b.p) || ehTransfer(b.p.nome) };
    });
    const travaInfo = {}; // soma-zero conserva a vaga, sem trava

    // totais e por grupo
    const cenTotal = cenariosProc.reduce((a, x) => ({ asIs: a.asIs + x.asIs, tend: a.tend + x.tend, reversao: a.reversao + x.reversao }), { asIs: 0, tend: 0, reversao: 0 });

    // ==== CONVERSÃO POR PRAÇA (self-paid calouro vs transferência) ====
    // calouro = self-paid que ocupa vaga (Vestibular, ENEM, Agendado) — NÃO inclui transferência
    const ehCalouro = (nome) => ehSelfPaid(nome) && !ehTransfer(nome);
    const convPorPraca = st.unidades.filter((u) => alvoUnis.includes(u.id)).map((u) => {
      // agrega calouro no cicloHist
      let cInsc = 0, cPag = 0, cMat = 0, tInsc = 0, tPag = 0, tMat = 0;
      st.processos.forEach((p) => {
        const k = `${cicloHist}|${u.id}|${p.id}`;
        const insc = g(st.funil, k, "insc"), pag = g(st.funil, k, "pagas"), mat = g(st.funil, k, "matric");
        if (ehCalouro(p.nome)) { cInsc += insc; cPag += pag; cMat += mat; }
        else if (ehTransfer(p.nome)) { tInsc += insc; tPag += pag; tMat += mat; }
      });
      return {
        u, cInsc, cPag, cMat, tInsc, tPag, tMat,
        convCalouro: div(cMat, cInsc),          // global calouro insc->mat
        taxaPagCal: div(cPag, cInsc),            // insc->pago
        pagMatCal: div(cMat, cPag),              // pago->matrícula
        convTransf: div(tMat, tInsc),
      };
    }).filter((x) => x.cInsc > 0 || x.cMat > 0);
    // melhor conversão de calouro (para destacar o gap)
    const melhorConv = convPorPraca.reduce((m, x) => (isFinite(x.convCalouro) && x.convCalouro > m ? x.convCalouro : m), 0);
    const mediaConvCal = (() => { const vs = convPorPraca.map((x) => x.convCalouro).filter((v) => isFinite(v)); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN; })();

    // JUSTIFICATIVAS por regra, por praça (só onde o self-paid cresce)
    const justificativas = [];
    if (uniSel === "__holding__") {
      st.unidades.filter((u) => alvoUnis.includes(u.id)).forEach((u) => {
        const det = detalhePraca[u.id];
        if (!det || (det.ganhoCalouro || 0) < 0.5) return;
        const itens = [];
        // por processo self-paid calouro que cresce
        cenariosProc.filter((c) => ehCalouroSP(c.p)).forEach((c) => {
          const pp = c.porPraca.find((x) => x.uId === u.id);
          if (pp && pp.deltaMat > 0.5) {
            let txt = `${c.p.nome}: ${f0(pp.asIs)} → ${f0(pp.rev)} (+${f0(pp.deltaMat)}). `;
            if (isFinite(pp.conv) && pp.conv > 0) txt += `Exige ~${f0(pp.inscNec)} inscrições na conversão de ${(pp.conv * 100).toFixed(1)}% (2 últimos intakes).`;
            else txt += `Sem base de conversão recente para estimar o topo.`;
            itens.push(txt);
          }
        });
        // compensação no FIES
        itens.push(`FIES cede ${f0(det.ganhoCalouro)} matrículas para compensar o ganho do self-paid (${f0(det.fiesAsIs)} → ${f0(det.fiesAsIs - det.ganhoCalouro)}).`);
        // transferência, se cresceu
        const ppT = cenariosProc.find((c) => ehTransfer(c.p.nome));
        const ppTu = ppT && ppT.porPraca.find((x) => x.uId === u.id);
        if (ppTu && ppTu.deltaMat > 0.5) itens.push(`Transferência: ${f0(ppTu.asIs)} → ${f0(ppTu.rev)} (+${f0(ppTu.deltaMat)}), crescimento independente (não ocupa vaga).`);
        if (itens.length) justificativas.push({ praca: u.nome, itens });
      });
    }
    const cenPorGrupo = {};
    cenariosProc.forEach((x) => {
      if (!cenPorGrupo[x.grupo]) cenPorGrupo[x.grupo] = { asIs: 0, tend: 0, reversao: 0 };
      cenPorGrupo[x.grupo].asIs += x.asIs; cenPorGrupo[x.grupo].tend += x.tend; cenPorGrupo[x.grupo].reversao += x.reversao;
    });

    return { linhas, histTotal, projTotal, metaTotal, metaHist, matrizShare, ciclosHistoricos, alvo: cfg.alvo, cenario: cfg.cenario, cicloHist,
      projSelfPaid, projFies, projTransf, projTransfFies, projRecuperado,
      histSelfPaid, histFies, histTransf, histTransfFies, histRecuperado,
      convGlobalHist, cacHist, cpiHist, previsaoInscritos, vagasTot, projOcupaVaga, projNaoOcupa,
      funilEtapas, funilTotal, evolFunilTotal, evolFunilPorProc, ciclosFunil,
      compUnidades, canalEsc, canalNaoEsc, cicloRefE,
      cenariosProc, cenTotal, cenPorGrupo, cicloHistAnt, temAnt, justificativas,
      convPorPraca, melhorConv, mediaConvCal, travaInfo, detalhePraca,
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
          <h1 style={titulo}>{modo === "funil" ? "Funil por ciclo" : "Matrículas por entrada"} · {D.alvo}</h1>
        </div>
        {modo === "executivo" && <div style={cenarioTag}>Cenário {cenarioLabel}</div>}
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

      {/* ===== CONTEÚDO EXECUTIVO ===== */}
      {modo === "executivo" && (<>
      {/* KPIs de topo: composição self paid x FIES + conversão global */}
      <div style={kpiGrid}>
        <div style={kpiCard}>
          <div style={kpiRot}>Meta total {D.alvo}</div>
          <div style={{ ...kpiVal, color: "#0E1F1B" }}>{f0(D.projTotal)}</div>
          <div style={kpiSub}>calouros previstos</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>Self paid</div>
          <div style={{ ...kpiVal, color: "#0F5F4E" }}>{f0(D.projSelfPaid)}</div>
          <div style={kpiSub}>{pct(div(D.projSelfPaid, D.projTotal))} da meta · sem FIES</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>FIES</div>
          <div style={{ ...kpiVal, color: "#8A6100" }}>{f0(D.projFies)}</div>
          <div style={kpiSub}>{pct(div(D.projFies, D.projTotal))} da meta · calouro à parte</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>Conversão global {D.cicloHist}</div>
          <div style={{ ...kpiVal, color: "#0E1F1B" }}>{pct(D.convGlobalHist, 1)}</div>
          <div style={kpiSub}>inscrito → matriculado</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>CAC previsto</div>
          <div style={{ ...kpiVal, color: "#0E1F1B", fontSize: 20 }}>{isFinite(D.cacHist) && D.cacHist > 0 ? brl(D.cacHist) : "—"}</div>
          <div style={kpiSub}>custo por matrícula</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>CPI previsto</div>
          <div style={{ ...kpiVal, color: "#0E1F1B", fontSize: 20 }}>{isFinite(D.cpiHist) && D.cpiHist > 0 ? brl(D.cpiHist) : "—"}</div>
          <div style={kpiSub}>custo por inscrição</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>Previsão de inscritos</div>
          <div style={{ ...kpiVal, color: "#0E1F1B" }}>{D.previsaoInscritos > 0 ? f0(D.previsaoInscritos) : "—"}</div>
          <div style={kpiSub}>topo de funil necessário</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiRot}>Vagas a preencher</div>
          <div style={{ ...kpiVal, color: (D.vagasTot - D.projOcupaVaga) > 0 ? "#8A6100" : "#4A5C57" }}>{D.vagasTot > 0 ? f0(D.vagasTot - D.projOcupaVaga) : "—"}</div>
          <div style={kpiSub}>{D.vagasTot > 0 ? "vaga = meta · exclui transf. e recuperado" : "defina vagas na aba Sistema"}</div>
        </div>
      </div>

      {/* 3 CENÁRIOS DE PROJEÇÃO */}
      <div style={card}>
        <div style={cardH}>Cenários de projeção — {D.alvo} · {D.nomeUni}</div>
        <div style={{ padding: "10px 16px 0", fontSize: 12, color: "#4A5C57", lineHeight: 1.5 }}>
          <b>Tendência</b>: projeta a direção histórica (self-paid em queda, FIES em alta). <b>As Is</b>: mantém o realizado de {D.cicloHist} (se nada for feito). <b>Recuperação Self-Paid</b>: edite a % de crescimento de cada processo self-paid na coluna "Recup. vs As Is" (com uma unidade selecionada); o ganho é compensado no FIES automaticamente. A Transferência cresce à parte, sem tocar no FIES.
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={tbl}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Processo</th>
              <th style={th}>Tendência</th><th style={th}>As Is ({D.cicloHist})</th><th style={th}>Recup. Self-Paid</th>
              <th style={th}>Recup. vs As Is</th><th style={th}>Topo nec.</th>
            </tr></thead>
            <tbody>
              {D.cenariosProc.filter((x) => x.asIs > 0 || x.tend > 0).map((x) => {
                const dRev = x.reversao - x.asIs;
                // editável inline só quando uma unidade específica está selecionada
                const editavelInline = uniSel !== "__holding__" && (ehGrupoEditavel(x.grupo));
                const chaveEdit = x.grupo === "transf" ? "rv_transf" : `rv_${x.p.id}`;
                const mUsel = uniSel !== "__holding__" ? (st.meta[`${D.alvo}|${uniSel}`] || {}) : {};
                return (
                  <tr key={x.p.id}>
                    <td style={tdL}>{x.p.nome}{x.grupo === "fies" && <span style={{ fontSize: 9, color: "#8A6100", marginLeft: 6 }}>compensa</span>}</td>
                    <td style={td}>{f0(x.tend)}</td>
                    <td style={td}>{f0(x.asIs)}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#0F5F4E" }}>{f0(x.reversao)}</td>
                    <td style={{ ...td, color: dRev > 0.5 ? "#0F5F4E" : (dRev < -0.5 ? "#9B1C1C" : "#4A5C57") }}>
                      {editavelInline ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                          <input defaultValue={mUsel[chaveEdit] !== undefined ? mUsel[chaveEdit] : ""} placeholder="0"
                            style={{ width: 44, border: "1px solid #B7D8CE", borderRadius: 4, padding: "2px 4px", fontSize: 11.5, textAlign: "right", fontFamily: "ui-monospace,monospace" }}
                            inputMode="decimal"
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            onBlur={(e) => {
                              const nv = e.target.value === "" ? 0 : num(e.target.value);
                              setSt((s) => { const k = `${D.alvo}|${uniSel}`; const meta = { ...(s.meta[k] || {}) }; if (e.target.value === "") delete meta[chaveEdit]; else meta[chaveEdit] = nv; return { ...s, meta: { ...s.meta, [k]: meta } }; });
                              salvarReversao(D.alvo, uniSel, chaveEdit, nv).catch(() => {});
                            }} />
                          <span style={{ fontSize: 10, color: "#4A5C57" }}>%</span>
                          <span style={{ minWidth: 34, textAlign: "right" }}>{Math.abs(dRev) > 0.5 ? (dRev > 0 ? "+" : "−") + f0(Math.abs(dRev)) : ""}</span>
                        </span>
                      ) : (Math.abs(dRev) > 0.5 ? (dRev > 0 ? "+" : "−") + f0(Math.abs(dRev)) : "—")}
                    </td>
                    <td style={tdMut}>{x.mexeRev && isFinite(x.inscRev) ? f0(x.inscRev) + " insc." : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td style={{ ...tdL, fontWeight: 700 }}>Total</td>
                <td style={{ ...td, fontWeight: 700 }}>{f0(D.cenTotal.tend)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{f0(D.cenTotal.asIs)}</td>
                <td style={{ ...td, fontWeight: 700, color: "#0F5F4E" }}>{f0(D.cenTotal.reversao)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{D.cenTotal.reversao - D.cenTotal.asIs > 0.5 ? "+" + f0(D.cenTotal.reversao - D.cenTotal.asIs) : "—"}</td>
                <td></td></tr>
            </tfoot>
          </table>
        </div>
        {/* subtotais por grupo */}
        <div style={{ padding: "4px 16px 0" }}>
          <table style={tbl}>
            <thead><tr><th style={{ ...th, textAlign: "left" }}>Grupo</th><th style={th}>Tendência</th><th style={th}>As Is</th><th style={th}>Recup. Self-Paid</th></tr></thead>
            <tbody>
              {[["selfpaid", "Self paid"], ["fies", "FIES"], ["transf", "Transferência"], ["transfFies", "Transferência FIES"], ["recuperado", "Recuperado"]].filter(([cod]) => D.cenPorGrupo[cod] && (D.cenPorGrupo[cod].asIs > 0 || D.cenPorGrupo[cod].tend > 0)).map(([cod, rotulo]) => (
                <tr key={cod}><td style={tdL}>{rotulo}</td>
                  <td style={td}>{f0(D.cenPorGrupo[cod].tend)}</td>
                  <td style={td}>{f0(D.cenPorGrupo[cod].asIs)}</td>
                  <td style={{ ...td, color: "#0F5F4E" }}>{f0(D.cenPorGrupo[cod].reversao)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={legenda}>
          <b>Leitura para o board:</b> a Tendência revela o risco (para onde vamos sem agir), o As Is mostra o freio da queda (manter o de {D.cicloHist}), a Recuperação Self-Paid mostra a retomada moderada: o FIES cede parte da vaga para o self-paid calouro crescer. "Topo nec." = inscrições necessárias na conversão dos 2 últimos intakes para sustentar a matrícula recuperada. Ajustável por praça.
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          <button onClick={() => setEditRev(!editRev)} style={{ fontSize: 12, padding: "5px 12px", border: "1px solid #0F5F4E", borderRadius: 5, background: editRev ? "#0F5F4E" : "#fff", color: editRev ? "#fff" : "#0F5F4E", cursor: "pointer", fontWeight: 600 }}>
            {editRev ? "Fechar edição" : (uniSel === "__holding__" ? "Ajustar recuperação por praça" : "Ajustar recuperação desta unidade")}
          </button>
        </div>
      </div>

      {/* Grade editável de recuperação: % por processo self-paid + transferência */}
      {editRev && (
        <div style={card}>
          <div style={cardH}>Ajuste da Recuperação Self-Paid {uniSel === "__holding__" ? "por praça" : "— " + D.nomeUni}</div>
          <div style={{ padding: "10px 16px 0", fontSize: 12, color: "#4A5C57", lineHeight: 1.5 }}>
            Digite a <b>% de crescimento sobre o As Is</b> de cada processo self-paid calouro. O ganho em matrículas é <b>subtraído do FIES</b> automaticamente (a vaga é fixa). A <b>Transferência</b> cresce à parte, sem tocar no FIES. Vazio = sem crescimento. Enter salva.
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={tbl}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Praça</th>
                {D.cenariosProc.filter((c) => c.grupo === "selfpaid").map((c) => <th key={c.p.id} style={th}>{c.p.nome} (%)</th>)}
                <th style={th}>Transf. (%)</th>
                <th style={th}>FIES resultante</th>
              </tr></thead>
              <tbody>
                {st.unidades.filter((u) => uniSel === "__holding__" || u.id === uniSel).map((u) => {
                  const mU = st.meta[`${D.alvo}|${u.id}`] || {};
                  const det = (D.detalhePraca || {})[u.id] || {};
                  const campo = (chave, placeholder) => (
                    <input defaultValue={mU[chave] !== undefined ? mU[chave] : ""} placeholder={placeholder}
                      style={{ width: 52, border: "1px solid #D8E0DD", borderRadius: 4, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "ui-monospace,monospace" }}
                      inputMode="decimal"
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      onBlur={(e) => {
                        const nv = e.target.value === "" ? 0 : num(e.target.value);
                        setSt((s) => { const k = `${D.alvo}|${u.id}`; const meta = { ...(s.meta[k] || {}) }; if (e.target.value === "") delete meta[chave]; else meta[chave] = nv; return { ...s, meta: { ...s.meta, [k]: meta } }; });
                        salvarReversao(D.alvo, u.id, chave, nv).catch(() => {});
                      }} />
                  );
                  const fiesResultante = det.fiesAsIs != null ? det.fiesAsIs - (det.ganhoCalouro || 0) : null;
                  return (
                    <tr key={u.id}>
                      <td style={tdL}>{u.nome}</td>
                      {D.cenariosProc.filter((c) => c.grupo === "selfpaid").map((c) => <td key={c.p.id} style={td}>{campo(`rv_${c.p.id}`, "0")}</td>)}
                      <td style={td}>{campo("rv_transf", "8")}</td>
                      <td style={{ ...tdMut, color: (det.ganhoCalouro || 0) > 0.5 ? "#9B1C1C" : "#4A5C57" }}>{fiesResultante != null ? f0(fiesResultante) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={legenda}>Ao salvar, o quadro de cenários recalcula na hora. A coluna "FIES resultante" mostra o FIES após ceder as matrículas que o self-paid ganhou.</div>
        </div>
      )}

      {/* Justificativas por praça (regras) */}
      {D.justificativas && D.justificativas.length > 0 && (
        <div style={card}>
          <div style={cardH}>Justificativa da Recuperação Self-Paid por praça</div>
          <div style={{ padding: "12px 16px" }}>
            {D.justificativas.map((j, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: "#0E1F1B", fontSize: 13, marginBottom: 4 }}>{j.praca}</div>
                {j.itens.map((it, k) => <div key={k} style={{ fontSize: 12.5, color: "#4A5C57", lineHeight: 1.5, marginBottom: 3, paddingLeft: 10, borderLeft: "2px solid #E8D9A8" }}>{it}</div>)}
              </div>
            ))}
          </div>
          <div style={legenda}>Texto gerado por regras a partir do diagnóstico (queda homóloga, conversão histórica, esforço de topo). Edite antes de levar ao board — é um rascunho de defesa, não um texto final.</div>
        </div>
      )}

      {/* Conversão por praça (self-paid calouro vs transferência) */}
      {D.convPorPraca && D.convPorPraca.length > 0 && (
        <div style={card}>
          <div style={cardH}>Conversão por praça — {D.cicloHist} · self-paid calouro vs transferência</div>
          <div style={{ padding: "10px 16px 0", fontSize: 12, color: "#4A5C57", lineHeight: 1.5 }}>
            <b>Calouro</b> = Vestibular + ENEM + Agendado (self-paid que ocupa vaga). <b>Transferência</b> é self-paid mas não é calouro, então aparece à parte. A conversão global do calouro é comparável entre praças — o gap mostra quem sabe converter o mesmo tráfego.
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={tbl}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Praça</th>
                <th style={th}>Insc. calouro</th><th style={th}>Insc→pago</th><th style={th}>Pago→matríc.</th>
                <th style={th}>Conv. calouro</th><th style={th}>vs melhor</th><th style={th}>Conv. transf.</th>
              </tr></thead>
              <tbody>
                {D.convPorPraca.slice().sort((a, b) => (b.convCalouro || 0) - (a.convCalouro || 0)).map((x) => {
                  const ehMelhor = isFinite(x.convCalouro) && Math.abs(x.convCalouro - D.melhorConv) < 1e-9;
                  const gap = isFinite(x.convCalouro) && D.melhorConv > 0 ? x.convCalouro / D.melhorConv - 1 : null;
                  return (
                    <tr key={x.u.id}>
                      <td style={tdL}>{ehMelhor && <span style={{ color: "#0F5F4E", fontWeight: 700, marginRight: 5 }}>★</span>}{x.u.nome}</td>
                      <td style={td}>{f0(x.cInsc)}</td>
                      <td style={tdMut}>{pct(x.taxaPagCal, 0)}</td>
                      <td style={tdMut}>{pct(x.pagMatCal, 1)}</td>
                      <td style={{ ...td, fontWeight: 700, color: ehMelhor ? "#0F5F4E" : "#0E1F1B" }}>{pct(x.convCalouro, 1)}</td>
                      <td style={{ ...td, color: gap !== null && gap < -0.001 ? "#9B1C1C" : "#4A5C57" }}>{ehMelhor ? "—" : (gap !== null ? pct(gap, 0) : "—")}</td>
                      <td style={tdMut}>{isFinite(x.convTransf) ? pct(x.convTransf, 1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td style={{ ...tdL, fontWeight: 700 }}>Média calouro</td><td colSpan={3}></td><td style={{ ...td, fontWeight: 700 }}>{pct(D.mediaConvCal, 1)}</td><td colSpan={2}></td></tr></tfoot>
            </table>
          </div>
          <div style={legenda}>
            ★ = melhor conversão de calouro. A coluna "vs melhor" mostra o quanto cada praça está abaixo da líder. <b>Insight:</b> se a diferença for grande, o ganho não está em mais verba — está em levar a conversão das praças fracas ao nível da melhor. Convém investigar o que a líder faz de diferente no funil (atendimento, tempo de resposta, oferta na inscrição).
          </div>
        </div>
      )}

      {/* Comparação entre unidades (só faz sentido na holding) */}
      {uniSel === "__holding__" && D.compUnidades.length > 1 && (
        <div style={card}>
          <div style={cardH}>Comparação entre unidades — {D.alvo}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Unidade</th>
                <th style={th}>Meta</th><th style={th}>Ocupação</th><th style={th}>Conv. ref.</th>
                <th style={th}>CAC proj.</th><th style={th}>Investimento</th><th style={th}>Verba</th><th style={th}>Gap</th>
              </tr></thead>
              <tbody>
                {D.compUnidades.map((x) => (
                  <tr key={x.u.id}>
                    <td style={tdL}>{x.u.nome}</td>
                    <td style={td}>{f0(x.meta)}</td>
                    <td style={td}>{x.vagas > 0 ? pct(x.ocupacao) : "—"}</td>
                    <td style={td}>{pct(x.convRef, 1)}</td>
                    <td style={td}>{isFinite(x.cacProj) && x.cacProj > 0 ? brl(x.cacProj) : "—"}</td>
                    <td style={td}>{brlK(x.inv)}</td>
                    <td style={td}>{x.verba > 0 ? brlK(x.verba) : "—"}</td>
                    <td style={{ ...td, color: x.gap > 0 ? "#9B1C1C" : "#0F5F4E" }}>{x.verba > 0 ? brlK(x.gap) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={legenda}>CAC projetado no volume da meta (com saturação). <b>Conv. ref.</b> = conversão inscrito→matrícula do ciclo {D.cicloRefE}. Gap em <span style={{ color: "#9B1C1C" }}>vermelho</span> = investimento maior que a verba.</div>
        </div>
      )}

      {/* Eficiência de verba por canal */}
      {(D.canalEsc.length > 0 || D.canalNaoEsc.length > 0) && (
        <div style={card}>
          <div style={cardH}>Eficiência de verba por canal — {D.nomeUni}</div>
          <div style={{ padding: "10px 16px 0", fontSize: 12, color: "#4A5C57" }}>
            Canais ordenados por menor CAC projetado. <b>Só os escaláveis</b> aceitam mais verba para trazer mais matrícula — os não-escaláveis (indicação, orgânico) aparecem como referência, mas não são acionáveis por investimento.
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={tbl}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Canal</th><th style={th}>Tipo</th>
                <th style={th}>CAC ref.</th><th style={th}>CAC projetado</th><th style={th}>Matríc. base</th>
              </tr></thead>
              <tbody>
                {D.canalEsc.map((x, i) => (
                  <tr key={x.c.id}>
                    <td style={tdL}>{i === 0 && <span style={{ color: "#0F5F4E", fontWeight: 700, marginRight: 5 }}>★</span>}{x.c.nome}</td>
                    <td style={{ ...td, textAlign: "left" }}><span style={{ background: "#E4EFEB", color: "#0F5F4E", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 9 }}>escala com verba</span></td>
                    <td style={tdMut}>{isFinite(x.cacBase) && x.cacBase > 0 ? brl(x.cacBase) : "—"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{isFinite(x.cacProj) && x.cacProj > 0 ? brl(x.cacProj) : "—"}</td>
                    <td style={tdMut}>{f0(x.matBase)}</td>
                  </tr>
                ))}
                {D.canalNaoEsc.map((x) => (
                  <tr key={x.c.id} style={{ opacity: 0.7 }}>
                    <td style={tdL}>{x.c.nome}</td>
                    <td style={{ ...td, textAlign: "left" }}><span style={{ background: "#EDF1F0", color: "#4A5C57", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 9 }}>não escala</span></td>
                    <td style={tdMut}>{isFinite(x.cacBase) && x.cacBase > 0 ? brl(x.cacBase) : "—"}</td>
                    <td style={td}>{isFinite(x.cacProj) && x.cacProj > 0 ? brl(x.cacProj) : "—"}</td>
                    <td style={tdMut}>{f0(x.matBase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={legenda}>★ = canal escalável mais eficiente (menor CAC projetado): onde o próximo real de verba tende a render mais matrícula. Atenção: CAC baixo em canal que não escala (indicação) não é acionável — não adianta "investir mais" onde o volume não responde a verba.</div>
        </div>
      )}

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
              {[
                ["Subtotal Self paid", "#0F5F4E", D.histSelfPaid, D.projSelfPaid],
                ["Subtotal FIES", "#8A6100", D.histFies, D.projFies],
                ["Subtotal Transferência", "#6B4A8A", D.histTransf, D.projTransf],
                ["Subtotal Transferência FIES", "#6B4A8A", D.histTransfFies, D.projTransfFies],
                ["Subtotal Recuperado", "#2E6DA4", D.histRecuperado, D.projRecuperado],
              ].filter(([, , h, p]) => h > 0 || p > 0).map(([rot, cor, h, p], i) => (
                <tr key={i}>
                  <td style={{ ...tdLsub, color: cor }}>{rot}</td>
                  <td style={tdsub}>{f0(h)}</td>
                  <td style={tdsub}>{pct(div(h, D.histTotal))}</td>
                  <td style={tdsub}>—</td>
                  <td style={{ ...tdsub, background: "#F5F9F8" }}>{f0(p)}</td>
                  <td style={{ ...tdsub, background: "#F5F9F8" }}>{pct(div(p, D.projTotal))}</td>
                  <td style={{ ...tdsub, background: "#F5F9F8" }}>—</td>
                </tr>
              ))}
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

      </>)}
      {/* ===== FIM CONTEÚDO EXECUTIVO (parte 1) ===== */}

      {/* ===== BLOCO FUNIL (aba Funil) ===== */}
      {modo === "funil" && (<>
      {/* Visão de funil por etapa x processo */}
      <div style={card}>
        <div style={cardH}>Funil por etapa — {D.cicloHist} · {D.nomeUni}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Etapa</th>
              {D.funilEtapas.map((p, i) => <th key={i} style={th}>{p.nome}</th>)}
              <th style={thP}>Total</th>
            </tr></thead>
            <tbody>
              {[
                ["Inscritos", "insc"],
                ["Inscritos pagos", "pagas"],
                ["Aprovados", "aprov"],
                ["Convocados", "conv"],
                ["Matriculados", "matric"],
              ].map(([rot, campo], ri) => (
                <tr key={ri}>
                  <td style={tdL}>{rot}</td>
                  {D.funilEtapas.map((p, i) => <td key={i} style={td}>{p[campo] > 0 ? f0(p[campo]) : "—"}</td>)}
                  <td style={{ ...td, background: "#F5F9F8", fontWeight: 700 }}>{D.funilTotal[campo] > 0 ? f0(D.funilTotal[campo]) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={legenda}>Etapas nas linhas, processos nas colunas. Aprovados e convocados aparecem quando preenchidos na aba Sistema. Troque o ciclo no filtro acima.</div>
      </div>

      {/* Evolução do funil por etapa ao longo dos ciclos */}
      <div style={card}>
        <div style={cardH}>Evolução do funil por ciclo — {D.nomeUni}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Etapa</th>
              {D.ciclosFunil.map((c) => <th key={c} style={th}>{c}</th>)}
              <th style={thP}>Var. homólogo</th>
            </tr></thead>
            <tbody>
              {D.evolFunilTotal.map((e, ri) => (
                <tr key={ri}>
                  <td style={tdL}>{e.rot}</td>
                  {D.ciclosFunil.map((c) => {
                    const cell = e.cells.find((x) => x.ciclo === c);
                    return <td key={c} style={td}>{funilCell(cell)}</td>;
                  })}
                  <td style={{ ...td, background: "#F5F9F8", fontWeight: 700, color: e.varFinal > 0 ? "#0F5F4E" : e.varFinal < 0 ? "#9B1C1C" : "#4A5C57" }}>
                    {e.varFinal != null ? (e.varFinal > 0 ? "▲ " : e.varFinal < 0 ? "▼ " : "") + pct(Math.abs(e.varFinal), 0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={legenda}>Cada número comparado ao <b>ciclo homólogo</b> (mesmo semestre do ano anterior): <span style={{ color: "#0F5F4E" }}>▲ verde subiu</span>, <span style={{ color: "#9B1C1C" }}>▼ vermelho caiu</span>. A última coluna é a variação da etapa no ciclo mais recente vs seu homólogo. Compara .1 com .1 e .2 com .2, nunca início com meio de ano.</div>
      </div>

      {/* Evolução do funil por PROCESSO */}
      {D.evolFunilPorProc.map((proc, pi) => (
        <div key={pi} style={card}>
          <div style={cardH}>Funil por ciclo — {proc.nome}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Etapa</th>
                {D.ciclosFunil.map((c) => <th key={c} style={th}>{c}</th>)}
                <th style={thP}>Var. homólogo</th>
              </tr></thead>
              <tbody>
                {proc.linhas.map((e, ri) => (
                  <tr key={ri}>
                    <td style={tdL}>{e.rot}</td>
                    {D.ciclosFunil.map((c) => {
                      const cell = e.cells.find((x) => x.ciclo === c);
                      return <td key={c} style={td}>{funilCell(cell)}</td>;
                    })}
                    <td style={{ ...td, background: "#F5F9F8", fontWeight: 700, color: e.varFinal > 0 ? "#0F5F4E" : e.varFinal < 0 ? "#9B1C1C" : "#4A5C57" }}>
                      {e.varFinal != null ? (e.varFinal > 0 ? "▲ " : e.varFinal < 0 ? "▼ " : "") + pct(Math.abs(e.varFinal), 0) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      </>)}
      {/* ===== FIM BLOCO FUNIL ===== */}

      {/* ===== CONTEÚDO EXECUTIVO (parte 2) ===== */}
      {modo === "executivo" && (<>
      {/* Matriz share por periodo */}
      <div style={card}>
        <div style={cardH}>Evolução do share por processo — todos os ciclos + previsão {D.alvo}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Processo</th>
              {D.ciclosHistoricos.map((c) => <th key={c} style={th}>{c}</th>)}
              <th style={thP}>Prev. {D.alvo}</th>
            </tr></thead>
            <tbody>
              {D.matrizShare.map((r, i) => (
                <tr key={i}>
                  <td style={tdL}><span style={{ ...dot, background: r.cor }} />{r.nome}</td>
                  {r.porCiclo.map((v, j) => <td key={j} style={td}>{isFinite(v) ? pct(v) : "—"}</td>)}
                  <td style={{ ...td, background: "#F5F9F8", fontWeight: 700 }}>{isFinite(r.prevShare) ? pct(r.prevShare) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={legenda}>Cada célula é a participação do processo no total de matrículas daquele ciclo. A última coluna é a projeção do modelo para {D.alvo}, calculada a partir do histórico.</div>
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
      </>)}
      {/* ===== FIM CONTEÚDO EXECUTIVO (parte 2) ===== */}
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
const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 };
const kpiCard = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "14px 16px" };
const kpiRot = { fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "#4A5C57", fontWeight: 700 };
const kpiVal = { fontFamily: "ui-monospace,Menlo,monospace", fontSize: 24, fontWeight: 700, marginTop: 5, fontVariantNumeric: "tabular-nums" };
const kpiSub = { fontSize: 11, color: "#4A5C57", marginTop: 3 };
const tdsub = { ...td, background: "#FCFCFB", fontWeight: 600, borderBottom: "1px solid #EDF1F0", fontSize: 11.5 };
const tdLsub = { ...tdL, background: "#FCFCFB", fontWeight: 700, fontSize: 11.5 };
