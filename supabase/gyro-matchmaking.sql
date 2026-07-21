-- Gyro Clash automatic ranked matchmaking.
-- Run this once after supabase/gyro-ranking.sql in Supabase Dashboard > SQL Editor.

create table if not exists public.gyro_matchmaking_matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code) = 8),
  player_one uuid not null references public.gyro_players(id) on delete restrict,
  player_two uuid not null references public.gyro_players(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  check (player_one <> player_two)
);

create table if not exists public.gyro_matchmaking_queue (
  player_id uuid primary key references public.gyro_players(id) on delete cascade,
  rating integer not null check (rating between 100 and 5000),
  status text not null default 'waiting' check (status in ('waiting', 'matched')),
  match_id uuid references public.gyro_matchmaking_matches(id) on delete set null,
  joined_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds')
);

create index if not exists gyro_matchmaking_waiting_idx
  on public.gyro_matchmaking_queue (status, expires_at, rating, joined_at);

alter table public.gyro_matchmaking_matches enable row level security;
alter table public.gyro_matchmaking_queue enable row level security;

create or replace function public.join_gyro_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rating integer;
  v_candidate uuid;
  v_candidate_rating integer;
  v_challenge boolean := random() < 0.20;
  v_match public.gyro_matchmaking_matches;
  v_room_code text;
begin
  if v_user is null then raise exception 'sign in required'; end if;
  select rating into v_rating from public.gyro_players where id = v_user;
  if not found then raise exception 'ranked profile missing'; end if;

  -- One lock makes a player available to at most one new automatic match.
  perform pg_advisory_xact_lock(hashtextextended('gyro-clash-matchmaking', 0));
  delete from public.gyro_matchmaking_queue
  where (status = 'waiting' and expires_at < now()) or player_id = v_user;

  -- Lower-rated waiting players are considered first. Most matches are close in rating;
  -- every fifth search may select a stronger waiting player as a challenge match.
  select q.player_id, p.rating into v_candidate, v_candidate_rating
  from public.gyro_matchmaking_queue q
  join public.gyro_players p on p.id = q.player_id
  where q.status = 'waiting' and q.expires_at >= now() and q.player_id <> v_user
  order by
    case when v_challenge and p.rating > v_rating then 0 else 1 end,
    case when v_challenge and p.rating > v_rating then p.rating else abs(p.rating - v_rating) end,
    p.rating asc,
    q.joined_at asc
  limit 1;

  if v_candidate is null then
    insert into public.gyro_matchmaking_queue (player_id, rating)
    values (v_user, v_rating);
    return jsonb_build_object(
      'status', 'waiting',
      'expires_at', now() + interval '30 seconds'
    );
  end if;

  v_room_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.gyro_matchmaking_matches (room_code, player_one, player_two)
  values (v_room_code, v_candidate, v_user)
  returning * into v_match;

  insert into public.gyro_matchmaking_queue (player_id, rating, status, match_id, expires_at)
  values (v_user, v_rating, 'matched', v_match.id, v_match.expires_at);
  update public.gyro_matchmaking_queue
  set status = 'matched', match_id = v_match.id, expires_at = v_match.expires_at
  where player_id = v_candidate;

  return jsonb_build_object(
    'status', 'matched',
    'match_id', v_match.id,
    'room_code', v_match.room_code,
    'opponent_id', v_candidate,
    'is_host', false,
    'challenge', v_candidate_rating > v_rating
  );
end;
$$;

create or replace function public.get_gyro_matchmaking_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_queue public.gyro_matchmaking_queue;
  v_match public.gyro_matchmaking_matches;
  v_opponent uuid;
  v_my_rating integer;
  v_opponent_rating integer;
begin
  if v_user is null then raise exception 'sign in required'; end if;
  select * into v_queue from public.gyro_matchmaking_queue where player_id = v_user;
  if not found then return jsonb_build_object('status', 'idle'); end if;

  if v_queue.status = 'waiting' and v_queue.expires_at < now() then
    delete from public.gyro_matchmaking_queue where player_id = v_user;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_queue.status = 'waiting' then
    return jsonb_build_object('status', 'waiting', 'expires_at', v_queue.expires_at);
  end if;

  select * into v_match from public.gyro_matchmaking_matches where id = v_queue.match_id;
  if not found or v_match.expires_at < now() then
    delete from public.gyro_matchmaking_queue where player_id = v_user;
    return jsonb_build_object('status', 'expired');
  end if;
  v_opponent := case when v_match.player_one = v_user then v_match.player_two else v_match.player_one end;
  select rating into v_my_rating from public.gyro_players where id = v_user;
  select rating into v_opponent_rating from public.gyro_players where id = v_opponent;
  return jsonb_build_object(
    'status', 'matched',
    'match_id', v_match.id,
    'room_code', v_match.room_code,
    'opponent_id', v_opponent,
    'is_host', v_match.player_one = v_user,
    'challenge', v_opponent_rating > v_my_rating
  );
end;
$$;

create or replace function public.cancel_gyro_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'sign in required'; end if;
  delete from public.gyro_matchmaking_queue where player_id = v_user and status = 'waiting';
  return jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on public.gyro_matchmaking_matches, public.gyro_matchmaking_queue from anon, authenticated;
grant execute on function public.join_gyro_matchmaking() to authenticated;
grant execute on function public.get_gyro_matchmaking_status() to authenticated;
grant execute on function public.cancel_gyro_matchmaking() to authenticated;
