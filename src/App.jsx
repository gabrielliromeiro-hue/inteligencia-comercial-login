import React, { useState, useEffect } from "react";
import Admin from "./Admin.jsx";
import { supabase, supabaseConfigurado } from "./lib/supabase.js";
import Login from "./Login.jsx";
import { meuPerfil, sair } from "./lib/dados.js";

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!supabaseConfigurado) { setCarregando(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessao) meuPerfil().then(setPerfil);
    else setPerfil(null);
  }, [sessao]);

  // App não configurado (faltam as chaves) — mensagem clara
  if (!supabaseConfigurado) {
    return (
      <div style={box}>
        <div style={card}>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#9B1C1C", margin: 0 }}>Chaves não configuradas</h2>
          <p style={{ fontSize: 13, color: "#4A5C57", lineHeight: 1.5 }}>
            O app subiu, mas ainda não recebeu as chaves do banco. Isso é esperado neste passo.
            Configure <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> nas variáveis de ambiente do Netlify e republique.
          </p>
        </div>
      </div>
    );
  }

  if (carregando) return <div style={box}><div style={{ color: "#4A5C57" }}>Carregando...</div></div>;

  if (!sessao) return <Login aoEntrar={() => {}} />;

  // Logado — tela de confirmação do pedaço 2
  const papelLabel = { admin: "Administrador", editor: "Editor", leitor: "Leitor" }[perfil?.papel] || "—";
  return (
    <div style={box}>
      <div style={card}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "#0E1F1B" }}>Login funcionando ✓</div>
        <p style={{ fontSize: 13, color: "#4A5C57", marginTop: 6 }}>Você está autenticado no sistema.</p>
        <div style={info}>
          <div><span style={k}>Email</span><span style={v}>{perfil?.email || sessao.user.email}</span></div>
          <div><span style={k}>Nome</span><span style={v}>{perfil?.nome || "—"}</span></div>
          <div><span style={k}>Papel</span><span style={{ ...v, fontWeight: 700, color: "#0F5F4E" }}>{papelLabel}</span></div>
        </div>
        <p style={{ fontSize: 12, color: "#4A5C57", marginTop: 14, lineHeight: 1.5 }}>
          Se o seu papel aparece como <b>Administrador</b>, você é o primeiro usuário e o dono do sistema.
          No próximo pedaço, você vai criar os acessos do time.
        </p>
        <button style={btn} onClick={() => sair()}>Sair</button>
      </div>
    </div>
  );
}

const box = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F4F3", fontFamily: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: 20 };
const card = { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "28px", width: 400, maxWidth: "100%" };
const info = { marginTop: 14, borderTop: "1px solid #EDF1F0" };
const k = { display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5C57", fontWeight: 700, marginTop: 12 };
const v = { display: "block", fontSize: 14, color: "#0E1F1B", marginTop: 2 };
const btn = { marginTop: 18, background: "#fff", color: "#0E1F1B", border: "1px solid #D8E0DD", borderRadius: 4, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
