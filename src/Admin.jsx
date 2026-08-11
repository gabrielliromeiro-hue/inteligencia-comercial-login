import React, { useState, useEffect } from "react";
import { listarUsuarios, mudarPapel, mudarAtivo } from "./lib/dados.js";

export default function Admin({ meuId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");

  const recarregar = async () => {
    setCarregando(true); setErro("");
    try { setUsuarios(await listarUsuarios()); }
    catch (e) { setErro("Não foi possível carregar os usuários: " + (e.message || e)); }
    setCarregando(false);
  };
  useEffect(() => { recarregar(); }, []);

  const trocarPapel = async (id, papel) => {
    setSalvando(id);
    try { await mudarPapel(id, papel); await recarregar(); }
    catch (e) { setErro(e.message || String(e)); }
    setSalvando("");
  };
  const trocarAtivo = async (id, ativo) => {
    setSalvando(id);
    try { await mudarAtivo(id, ativo); await recarregar(); }
    catch (e) { setErro(e.message || String(e)); }
    setSalvando("");
  };

  const papelLabel = { admin: "Administrador", editor: "Editor", leitor: "Leitor" };
  const papelCor = { admin: "#0F5F4E", editor: "#8A6100", leitor: "#4A5C57" };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={box}>
        <h2 style={h2}>Acessos do time</h2>
        <p style={nota}>
          Cada pessoa entra pelo link do sistema e clica em <b>Criar conta</b>. Todos começam como <b>Leitor</b>.
          Aqui você promove quem precisa preencher dados para <b>Editor</b>, ou desativa quem saiu.
        </p>
        <div style={{ ...nota, background: "#E4EFEB", padding: "8px 10px", borderRadius: 4, borderLeft: "3px solid #0F5F4E" }}>
          <b>Editor</b> preenche e edita os dados. <b>Leitor</b> só visualiza. <b>Administrador</b> (você) faz tudo e gerencia acessos.
        </div>
      </div>

      {erro && <div style={erroBox}>{erro}</div>}

      <div style={{ ...box, padding: 0, overflow: "hidden" }}>
        {carregando ? (
          <div style={{ padding: 20, color: "#4A5C57" }}>Carregando...</div>
        ) : (
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Nome</th><th style={th}>Email</th><th style={th}>Papel</th>
                <th style={th}>Situação</th><th style={{ ...th, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const euMesmo = u.id === meuId;
                return (
                  <tr key={u.id} style={{ opacity: u.ativo ? 1 : 0.5 }}>
                    <td style={td}>{u.nome || "—"} {euMesmo && <span style={pill}>você</span>}</td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: papelCor[u.papel] }}>{papelLabel[u.papel]}</span>
                    </td>
                    <td style={td}>{u.ativo ? "Ativo" : "Desativado"}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {euMesmo ? (
                        <span style={{ fontSize: 11, color: "#8496910" }}>—</span>
                      ) : (
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <select
                            value={u.papel}
                            disabled={salvando === u.id}
                            onChange={(e) => trocarPapel(u.id, e.target.value)}
                            style={sel}
                          >
                            <option value="leitor">Leitor</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Administrador</option>
                          </select>
                          <button
                            style={{ ...btn, ...(u.ativo ? {} : { color: "#0F5F4E", borderColor: "#0F5F4E" }) }}
                            disabled={salvando === u.id}
                            onClick={() => trocarAtivo(u.id, !u.ativo)}
                          >
                            {u.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {usuarios.length === 0 && (
                <tr><td style={td} colSpan={5}>Nenhum usuário ainda além de você.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...box, background: "#FBF2DC", borderColor: "#E8D9A8" }}>
        <div style={{ fontSize: 12.5, color: "#6B5200", lineHeight: 1.5 }}>
          <b>Como adicionar alguém do time:</b> mande o link do sistema para a pessoa, peça que ela clique em
          "Criar conta" e se cadastre com o email dela. Assim que ela aparecer nesta lista (como Leitor),
          você define o papel dela aqui. Você não precisa criar a senha dela — ela cria a própria.
        </div>
      </div>
    </div>
  );
}

const box = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 6, padding: 16, marginBottom: 14 };
const h2 = { fontFamily: "Georgia,serif", fontSize: 16, margin: 0, color: "#0E1F1B" };
const nota = { fontSize: 12.5, color: "#4A5C57", marginTop: 8, lineHeight: 1.5 };
const erroBox = { background: "#FBE9E9", color: "#9B1C1C", fontSize: 12.5, padding: "10px 12px", borderRadius: 4, marginBottom: 14, borderLeft: "3px solid #9B1C1C" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "9px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "#4A5C57", fontWeight: 700, borderBottom: "1px solid #D8E0DD", background: "#FAFBFB" };
const td = { padding: "9px 12px", borderBottom: "1px solid #EDF1F0", color: "#0E1F1B" };
const sel = { border: "1px solid #D8E0DD", borderRadius: 3, padding: "4px 6px", fontSize: 12, background: "#fff" };
const btn = { border: "1px solid #D8E0DD", background: "#fff", borderRadius: 3, padding: "4px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", color: "#0E1F1B" };
const pill = { display: "inline-block", padding: "1px 6px", borderRadius: 9, fontSize: 10, fontWeight: 700, background: "#E4EFEB", color: "#0F5F4E", marginLeft: 4 };
