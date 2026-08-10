-- ============================================================
-- INTELIGÊNCIA COMERCIAL — Banco de dados (Supabase / Postgres)
-- Modelo: 1 admin cria os acessos do time pela área de admin.
-- Papéis: admin (você) · editor (preenche) · leitor (só vê).
-- Segurança: RLS garante no BANCO quem vê e quem edita.
-- ============================================================
-- COMO USAR: cole este arquivo inteiro no SQL Editor do Supabase
-- e clique em Run. Ele cria tudo de uma vez.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- PERFIS DE USUÁRIO ----------
-- Cada pessoa que loga tem um perfil com um papel.
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  papel      text not null default 'leitor' check (papel in ('admin','editor','leitor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- helper: papel do usuário logado
create or replace function meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo = true
$$;

create or replace function sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'admin' from perfis where id = auth.uid() and ativo = true), false)
$$;

create or replace function posso_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('admin','editor') from perfis where id = auth.uid() and ativo = true), false)
$$;

-- ---------- CADASTROS ----------
create table if not exists unidades (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  mensalidade numeric(12,2) not null default 0,
  ativo       boolean not null default true,
  ordem       int not null default 0
);
create table if not exists processos (
  id    uuid primary key default uuid_generate_v4(),
  nome  text not null,
  ativo boolean not null default true,
  ordem int not null default 0
);
create table if not exists canais (
  id       uuid primary key default uuid_generate_v4(),
  nome     text not null,
  pago     boolean not null default true,
  beta     numeric(5,3) not null default 0.2,
  reajuste numeric(5,4) not null default 0.07,
  ativo    boolean not null default true,
  ordem    int not null default 0
);

-- ---------- FATOS HISTÓRICOS ----------
create table if not exists funil_hist (
  unidade_id  uuid not null references unidades(id) on delete cascade,
  processo_id uuid not null references processos(id) on delete cascade,
  ciclo       text not null,
  vagas       int not null default 0,
  inscricoes  int not null default 0,
  insc_pagas  int not null default 0,
  matriculas  int not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  primary key (unidade_id, processo_id, ciclo)
);
create table if not exists canal_hist (
  unidade_id   uuid not null references unidades(id) on delete cascade,
  canal_id     uuid not null references canais(id) on delete cascade,
  ciclo        text not null,
  investimento numeric(14,2) not null default 0,
  leads        int not null default 0,
  insc_pagas   int not null default 0,
  matriculas   int not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  primary key (unidade_id, canal_id, ciclo)
);

-- ---------- PLANO / METAS ----------
create table if not exists metas (
  unidade_id  uuid not null references unidades(id) on delete cascade,
  ciclo_alvo  text not null,
  vagas       int not null default 0,
  meta_matriculas int not null default 0,
  verba       numeric(14,2) not null default 0,
  shares_processo jsonb not null default '{}'::jsonb,
  shares_canal    jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, ciclo_alvo)
);

-- config global (uma linha)
create table if not exists config (
  id                int primary key default 1,
  somente_homologos boolean not null default true,
  saturacao         boolean not null default true,
  pesos             jsonb not null default '[0.5,0.3,0.2]'::jsonb,
  ganho_conv_pct    numeric(5,2) not null default 0,
  ciclos            jsonb not null default '["2024.1","2024.2","2025.1","2025.2","2026.1","2026.2"]'::jsonb,
  alvos             jsonb not null default '["2027.1","2027.2","2028.1"]'::jsonb,
  constraint config_uma_linha check (id = 1)
);
insert into config (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- SEGURANÇA (RLS) — o banco decide quem vê e quem edita
-- ============================================================
alter table perfis     enable row level security;
alter table unidades   enable row level security;
alter table processos  enable row level security;
alter table canais     enable row level security;
alter table funil_hist enable row level security;
alter table canal_hist enable row level security;
alter table metas      enable row level security;
alter table config     enable row level security;

-- PERFIS: cada um vê o próprio; admin vê e mexe em todos
drop policy if exists perfil_self on perfis;
create policy perfil_self on perfis for select using (id = auth.uid() or sou_admin());
drop policy if exists perfil_admin on perfis;
create policy perfil_admin on perfis for all using (sou_admin()) with check (sou_admin());

-- DADOS: todo usuário ativo LÊ; só admin/editor ESCREVE
do $$
declare t text;
begin
  foreach t in array array['unidades','processos','canais','funil_hist','canal_hist','metas','config']
  loop
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (meu_papel() is not null)', t, t);
    execute format('drop policy if exists %I_escrever on %I', t, t);
    execute format('create policy %I_escrever on %I for all using (posso_editar()) with check (posso_editar())', t, t);
  end loop;
end $$;

-- ============================================================
-- QUANDO ALGUÉM SE CADASTRA: cria o perfil automaticamente
-- O primeiro usuário do sistema vira admin. Os demais, leitor.
-- ============================================================
create or replace function ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare n_usuarios int;
begin
  select count(*) into n_usuarios from perfis;
  insert into perfis (id, email, nome, papel)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.email),
          case when n_usuarios = 0 then 'admin' else 'leitor' end);
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users
  for each row execute function ao_criar_usuario();

-- ============================================================
-- SEED opcional — unidades e canais genéricos (edite depois no app)
-- ============================================================
insert into processos (nome, ordem) values
  ('Vestibular Tradicional',1),('Vestibular Agendado / Online',2),('ENEM',3),('Transferência Externa',4)
on conflict do nothing;
insert into canais (nome, pago, beta, reajuste, ordem) values
  ('Meta Ads',true,0.35,0.07,1),('Google Ads',true,0.30,0.07,2),
  ('Mídia OFF',true,0.15,0.07,3),('Orgânico / Site',false,0,0,4),('Indicação / Base',false,0,0,5)
on conflict do nothing;

-- FIM. Clique em Run.
