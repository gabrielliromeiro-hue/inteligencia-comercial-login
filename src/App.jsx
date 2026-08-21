import React, { useState, useEffect } from "react";
import { supabase, supabaseConfigurado } from "./lib/supabase.js";
import Login from "./Login.jsx";
import Admin from "./Admin.jsx";
import Planejamento from "./Planejamento.jsx";
import Executivo from "./Executivo.jsx";
import Insights from "./Insights.jsx";
import { meuPerfil, sair } from "./lib/dados.js";

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("executivo");

  useEffect(() => {
    if (!supabaseConfigurado) { setCarregando(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setCarregando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessao) meuPerfil().then(setPerfil);
    else setPerfil(null);
  }, [sessao]);

  if (!supabaseConfigurado) return (
    <div style={center}><div style={card}>
      <h2 style={{ fontFamily: "Georgia,serif", color: "#9B1C1C", margin: 0 }}>Chaves nao configuradas</h2>
      <p style={{ fontSize: 13, color: "#4A5C57", lineHeight: 1.5 }}>
        Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variaveis de ambiente do Netlify e republique.
      </p>
    </div></div>
  );

  if (carregando) return <div style={center}><div style={{ color: "#4A5C57" }}>Carregando...</div></div>;
  if (!sessao) return <Login aoEntrar={() => {}} />;
  if (!perfil) return <div style={center}><div style={{ color: "#4A5C57" }}>Carregando perfil...</div></div>;

  if (!perfil.ativo) return (
    <div style={center}><div style={card}>
      <h2 style={{ fontFamily: "Georgia,serif", margin: 0 }}>Acesso desativado</h2>
      <p style={{ fontSize: 13, color: "#4A5C57" }}>Seu acesso foi desativado. Fale com o administrador.</p>
      <button style={btnGhost} onClick={() => sair()}>Sair</button>
    </div></div>
  );

  const ehAdmin = perfil.papel === "admin";
  const podeEditar = perfil.papel === "admin" || perfil.papel === "editor";
  const papelLabel = { admin: "Administrador", editor: "Editor", leitor: "Leitor" }[perfil.papel];

  return (
    <div style={{ minHeight: "100vh", background: "#F1F4F3", fontFamily: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
      <div style={topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontFamily: "Georgia,serif", fontSize: 16, color: "#fff" }}>Inteligencia Comercial</span>
          <nav style={{ display: "flex", gap: 4 }}>
            <TabBtn on={aba === "executivo"} onClick={() => setAba("executivo")}>Visão Executiva</TabBtn>
            <TabBtn on={aba === "funil"} onClick={() => setAba("funil")}>Funil</TabBtn>
            <TabBtn on={aba === "insights"} onClick={() => setAba("insights")}>Insights</TabBtn>
            <TabBtn on={aba === "sistema"} onClick={() => setAba("sistema")}>Sistema</TabBtn>
            {ehAdmin && <TabBtn on={aba === "admin"} onClick={() => setAba("admin")}>Acessos do time</TabBtn>}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12.5, color: "#EAF0EE" }}>{perfil.nome || perfil.email}</div>
            <div style={{ fontSize: 10.5, color: "#9DB0AB" }}>{papelLabel}</div>
          </div>
          <button style={btnSair} onClick={() => sair()}>Sair</button>
        </div>
      </div>

      <div style={{ padding: "20px", maxWidth: 1500, margin: "0 auto" }}>
        {aba === "admin" && ehAdmin && <Admin meuId={perfil.id} />}
        {aba === "executivo" && <Executivo />}
        {aba === "funil" && <Executivo modo="funil" />}
        {aba === "insights" && <Insights />}
        {aba === "sistema" && <Planejamento podeEditar={podeEditar} />}
      </div>
    </div>
  );
}

function TabBtn({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: 0, borderBottom: on ? "2px solid #4FD1A5" : "2px solid transparent",
      color: on ? "#fff" : "#9DB0AB", padding: "6px 12px", fontSize: 12.5, cursor: "pointer", fontWeight: 500,
    }}>{children}</button>
  );
}

const center = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F4F3", fontFamily: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: 20 };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: 24, width: "100%", maxWidth: 460 };
const topbar = { background: "#0E1F1B", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" };
const btnSair = { background: "transparent", border: "1px solid #3A4A45", color: "#EAF0EE", borderRadius: 4, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 };
const btnGhost = { marginTop: 14, background: "#fff", border: "1px solid #D8E0DD", borderRadius: 4, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
