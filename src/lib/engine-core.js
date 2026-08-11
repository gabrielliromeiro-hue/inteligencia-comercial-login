/* ============================================================
   ENGINE — motor de cálculo do planejamento comercial
   Funções puras, sem dependência de React ou browser.
   Este arquivo é testado em Node e embutido literalmente no app.
   ============================================================ */

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  var s = String(v).trim().replace(/\s|R\$/g, "");
  // formato BR: remove ponto de milhar (ponto seguido de exatamente 3 dígitos), vírgula vira decimal
  s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function safeDiv(a, b) {
  return b > 0 ? a / b : NaN;
}

/* pesos efetivos: recorta o vetor de pesos para n ciclos com dado e renormaliza para somar 1 */
function effectiveWeights(n, pesos) {
  var w = [];
  for (var i = 0; i < n; i++) w.push(pesos[i] !== undefined && pesos[i] !== null ? pesos[i] : 0.1);
  var s = w.reduce(function (a, b) { return a + b; }, 0);
  return s > 0 ? w.map(function (x) { return x / s; }) : w.map(function () { return 0; });
}

/* normaliza um mapa {id: share} para somar 1; se soma 0, devolve zeros */
function normalizeShares(map) {
  var ids = Object.keys(map);
  var s = ids.reduce(function (a, id) { return a + (isFinite(map[id]) ? map[id] : 0); }, 0);
  var out = {};
  ids.forEach(function (id) { out[id] = s > 0 ? (isFinite(map[id]) ? map[id] : 0) / s : 0; });
  return out;
}

/* média ponderada ignorando pontos sem base (NaN); devolve NaN se nenhum ponto válido */
function weightedMean(pairs) {
  var num = 0, den = 0;
  pairs.forEach(function (p) {
    if (isFinite(p.value) && isFinite(p.weight)) { num += p.weight * p.value; den += p.weight; }
  });
  return den > 0 ? num / den : NaN;
}

/* funil reverso: matrículas -> inscrições pagas -> inscrições
   conv = paga->matrícula histórica; ganho = fator multiplicador (1 = sem ganho)
   taxaPag = inscrição->paga histórica */
function funnelReverse(metaMatric, conv, taxaPag, ganho) {
  var g = isFinite(ganho) && ganho > 0 ? ganho : 1;
  var convEf = isFinite(conv) && conv > 0 ? Math.min(conv * g, 1) : NaN;
  var pagas = isFinite(convEf) ? metaMatric / convEf : NaN;
  var insc = isFinite(pagas) && isFinite(taxaPag) && taxaPag > 0 ? pagas / taxaPag : NaN;
  return { convEf: convEf, pagas: pagas, insc: insc };
}

/* CAC projetado: base × (1+inflação)^anos × fator de saturação
   saturação: 1 + beta × crescimento (crescimento = meta/base - 1, piso 0) */
function projectCAC(cacBase, inflacao, anos, beta, metaVol, baseVol, saturacaoOn) {
  if (!isFinite(cacBase) || cacBase <= 0) return { cacProj: NaN, cresc: NaN, fatSat: 1 };
  var cresc = baseVol > 0 ? Math.max(0, metaVol / baseVol - 1) : 0;
  var fatSat = saturacaoOn ? 1 + (beta || 0) * cresc : 1;
  var cacProj = cacBase * Math.pow(1 + (inflacao || 0), Math.max(0, anos || 0)) * fatSat;
  return { cacProj: cacProj, cresc: cresc, fatSat: fatSat };
}

/* referência de funil por processo a partir de ciclos históricos
   cycles: [{ porProc: {procId: {insc,pagas,matric}}, totalMatric }] mais recente primeiro
   devolve por processo: share normalizado, taxaPag, conv */
function buildFunnelRef(cycles, procIds, pesos) {
  var w = effectiveWeights(cycles.length, pesos);
  var rawShare = {}, taxaPag = {}, conv = {};
  procIds.forEach(function (pid) {
    rawShare[pid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porProc[pid] || {};
      return { value: c.totalMatric > 0 ? (l.matric || 0) / c.totalMatric : NaN, weight: w[i] };
    }));
    taxaPag[pid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porProc[pid] || {};
      return { value: (l.insc || 0) > 0 ? (l.pagas || 0) / l.insc : NaN, weight: w[i] };
    }));
    conv[pid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porProc[pid] || {};
      return { value: (l.pagas || 0) > 0 ? (l.matric || 0) / l.pagas : NaN, weight: w[i] };
    }));
    if (!isFinite(rawShare[pid])) rawShare[pid] = 0;
  });
  return { share: normalizeShares(rawShare), taxaPag: taxaPag, conv: conv };
}

/* referência de canal a partir de ciclos históricos
   cycles: [{ porCanal: {canId: {inv,leads,pagas,matric}}, totalMatric }] mais recente primeiro */
function buildChannelRef(cycles, canIds, pesos) {
  var w = effectiveWeights(cycles.length, pesos);
  var rawShare = {}, cac = {}, cpl = {}, cpip = {}, matBase = {}, invBase = {};
  canIds.forEach(function (cid) {
    rawShare[cid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porCanal[cid] || {};
      return { value: c.totalMatric > 0 ? (l.matric || 0) / c.totalMatric : NaN, weight: w[i] };
    }));
    cac[cid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porCanal[cid] || {};
      return { value: (l.matric || 0) > 0 && (l.inv || 0) > 0 ? l.inv / l.matric : NaN, weight: w[i] };
    }));
    cpl[cid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porCanal[cid] || {};
      return { value: (l.leads || 0) > 0 && (l.inv || 0) > 0 ? l.inv / l.leads : NaN, weight: w[i] };
    }));
    cpip[cid] = weightedMean(cycles.map(function (c, i) {
      var l = c.porCanal[cid] || {};
      return { value: (l.pagas || 0) > 0 && (l.inv || 0) > 0 ? l.inv / l.pagas : NaN, weight: w[i] };
    }));
    matBase[cid] = cycles.reduce(function (a, c, i) { return a + w[i] * ((c.porCanal[cid] || {}).matric || 0); }, 0);
    invBase[cid] = cycles.reduce(function (a, c, i) { return a + w[i] * ((c.porCanal[cid] || {}).inv || 0); }, 0);
    if (!isFinite(rawShare[cid])) rawShare[cid] = 0;
  });
  return { share: normalizeShares(rawShare), cac: cac, cpl: cpl, cpip: cpip, matBase: matBase, invBase: invBase };
}

/* resolve shares finais: começa da referência, aplica overrides do usuário (em %),
   e renormaliza APENAS os não sobrescritos para fechar 100%.
   Se overrides somam >= 100%, os não sobrescritos zeram e os overrides são renormalizados. */
function resolveShares(refShare, overridesPct, ids) {
  var out = {}, fixed = 0, freeIds = [];
  ids.forEach(function (id) {
    var ov = overridesPct[id];
    if (isFinite(ov) && ov > 0) { out[id] = ov / 100; fixed += ov / 100; }
    else freeIds.push(id);
  });
  if (fixed >= 1) {
    // overrides estouram 100%: renormaliza os próprios overrides, zera os livres
    ids.forEach(function (id) { out[id] = out[id] !== undefined ? out[id] / fixed : 0; });
    return { shares: out, overflow: fixed > 1.0001 };
  }
  var freeRefSum = freeIds.reduce(function (a, id) { return a + (refShare[id] || 0); }, 0);
  var rest = 1 - fixed;
  freeIds.forEach(function (id) {
    out[id] = freeRefSum > 0 ? ((refShare[id] || 0) / freeRefSum) * rest : rest / freeIds.length;
  });
  return { shares: out, overflow: false };
}

/* anos de reajuste entre o ciclo de referência mais recente e o alvo */
function yearsBetween(cicloRef, cicloAlvo) {
  if (!cicloRef) return 1;
  var a = parseInt(String(cicloAlvo).split(".")[0], 10);
  var r = parseInt(String(cicloRef).split(".")[0], 10);
  if (!isFinite(a) || !isFinite(r)) return 1;
  return Math.max(0, a - r);
}

/* validação de um plano de unidade: devolve lista de {sev,msg} */
function validatePlan(p) {
  var out = [];
  if (p.sharesProcSum !== undefined && Math.abs(p.sharesProcSum - 1) > 0.005)
    out.push({ sev: "b", msg: "Shares de processo somam " + (p.sharesProcSum * 100).toFixed(1) + "% (devem fechar 100%)" });
  if (p.sharesCanSum !== undefined && Math.abs(p.sharesCanSum - 1) > 0.005)
    out.push({ sev: "b", msg: "Shares de canal somam " + (p.sharesCanSum * 100).toFixed(1) + "% (devem fechar 100%)" });
  if (p.vagas > 0 && p.metaMatric / p.vagas > 1.02)
    out.push({ sev: "b", msg: "Meta acima das vagas disponíveis" });
  return out;
}



export {
  parseNum, safeDiv, effectiveWeights, normalizeShares, weightedMean,
  funnelReverse, projectCAC, buildFunnelRef, buildChannelRef,
  resolveShares, yearsBetween, validatePlan,
};
