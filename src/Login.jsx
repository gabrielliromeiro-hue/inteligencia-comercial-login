import React, { useState } from "react";
import { supabase } from "./lib/supabase.js";

export default function Login({ aoEntrar }) {
  const [modo, setModo] = useState("entrar"); // entrar | cadastrar
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submeter = async () => {
    setErro(""); setMsg(""); setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
        aoEntrar();
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(), password: senha,
          options: { data: { nome: nome.trim() } },
        });
        if (error) throw error;
        setMsg("Cadastro feito. Se a confirmação por email estiver ligada, verifique sua caixa de entrada. Depois entre normalmente.");
        setModo("entrar");
      }
    } catch (e) {
      const m = String(e.message || e);
      if (m.includes("Invalid login")) setErro("Email ou senha incorretos.");
      else if (m.includes("already registered")) setErro("Este email já tem cadastro. Faça login.");
      else if (m.includes("Password")) setErro("A senha precisa ter ao menos 6 caracteres.");
      else setErro(m);
    }
    setCarregando(false);
  };

  return (
    <div style={S.wrap}>
      <style>{CSS}</style>
      <div style={S.card}>
        <div style={S.brand}>Inteligência Comercial</div>
        <div style={S.sub}>Planejamento de captação · acesso restrito</div>

        {modo === "cadastrar" && (
          <label style={S.field}>
            <span style={S.lab}>Nome</span>
            <input style={S.input} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
          </label>
        )}
        <label style={S.field}>
          <span style={S.lab}>Email</span>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com" autoComplete="email"
            onKeyDown={(e) => e.key === "Enter" && submeter()} />
        </label>
        <label style={S.field}>
          <span style={S.lab}>Senha</span>
          <input style={S.input} type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••" autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && submeter()} />
        </label>

        {erro && <div style={S.erro}>{erro}</div>}
        {msg && <div style={S.msg}>{msg}</div>}

        <button style={{ ...S.btn, opacity: carregando ? 0.6 : 1 }} onClick={submeter} disabled={carregando}>
          {carregando ? "..." : modo === "entrar" ? "Entrar" : "Criar acesso"}
        </button>

        <div style={S.toggle}>
          {modo === "entrar" ? (
            <span>Primeiro acesso? <a style={S.link} onClick={() => { setModo("cadastrar"); setErro(""); }}>Criar conta</a></span>
          ) : (
            <span>Já tem acesso? <a style={S.link} onClick={() => { setModo("entrar"); setErro(""); }}>Entrar</a></span>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `input:focus{outline:none;border-color:#0F5F4E !important;box-shadow:0 0 0 3px #E4EFEB;}`;
const S = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F4F3", fontFamily: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", padding: 20 },
  card: { background: "#fff", border: "1px solid #D8E0DD", borderRadius: 8, padding: "30px 28px", width: 360, maxWidth: "100%", boxShadow: "0 4px 24px rgba(14,31,27,.06)" },
  brand: { fontFamily: "Georgia,serif", fontSize: 21, color: "#0E1F1B", fontWeight: 600 },
  sub: { fontSize: 12, color: "#4A5C57", marginTop: 4, marginBottom: 22 },
  field: { display: "block", marginBottom: 14 },
  lab: { display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#4A5C57", fontWeight: 700, marginBottom: 5 },
  input: { width: "100%", border: "1px solid #D8E0DD", borderRadius: 4, padding: "9px 11px", fontSize: 14, color: "#0E1F1B", boxSizing: "border-box" },
  btn: { width: "100%", background: "#0F5F4E", color: "#fff", border: 0, borderRadius: 4, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 6 },
  toggle: { fontSize: 12.5, color: "#4A5C57", textAlign: "center", marginTop: 16 },
  link: { color: "#0F5F4E", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  erro: { background: "#FBE9E9", color: "#9B1C1C", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 10, borderLeft: "3px solid #9B1C1C" },
  msg: { background: "#E4EFEB", color: "#0F5F4E", fontSize: 12.5, padding: "8px 10px", borderRadius: 4, marginBottom: 10, borderLeft: "3px solid #0F5F4E" },
};
