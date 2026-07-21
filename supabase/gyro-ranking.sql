-- Gyro Clash public ranking, test season.
-- Run once in Supabase Dashboard > SQL Editor.
-- Also enable Authentication > Providers > Anonymous Sign-Ins before publishing.

create table if not exists public.gyro_players (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 16),
  rating integer not null default 1000 check (rating between 100 and 5000),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  matches integer not null default 0 check (matches >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gyro_rank_reports (
  match_id uuid not null,
  player_id uuid not null references public.gyro_players(id) on delete cascade,
  opponent_id uuid not null references public.gyro_players(id) on delete cascade,
  player_score smallint not null check (player_score between 0 and 12),
  opponent_score smallint not null check (opponent_score between 0 and 12),
  reported_at timestamptz not null default now(),
  primary key (match_id, player_id),
  check (player_id <> opponent_id),
  check (player_score <> opponent_score)
);

create table if not exists public.gyro_rank_matches (
  match_id uuid primary key,
  player_one uuid not null references public.gyro_players(id) on delete restrict,
  player_two uuid not null references public.gyro_players(id) on delete restrict,
  player_one_score smallint not null,
  player_two_score smallint not null,
  winner_id uuid not null references public.gyro_players(id) on delete restrict,
  player_one_delta integer not null,
  player_two_delta integer not null,
  verified_at timestamptz not null default now(),
  check (player_one <> player_two),
  check (player_one_score <> player_two_score)
);

create index if not exists gyro_players_rank_idx on public.gyro_players (rating desc, wins desc, updated_at asc);
create index if not exists gyro_rank_reports_match_idx on public.gyro_rank_reports (match_id);

alter table public.gyro_players enable row level security;
alter table public.gyro_rank_reports enable row level security;
alter table public.gyro_rank_matches enable row level security;

drop policy if exists "Leaderboard is public" on public.gyro_players;
create policy "Leaderboard is public" on public.gyro_players for select using (true);
drop policy if exists "Verified matches are public" on public.gyro_rank_matches;
create policy "Verified matches are public" on public.gyro_rank_matches for select using (true);

create or replace view public.gyro_leaderboard as
select display_name, rating, wins, losses, matches
from public.gyro_players
order by rating desc, wins desc, updated_at asc;

create or replace function public.set_gyro_nickname(p_display_name text)
returns public.gyro_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(p_display_name);
  v_player public.gyro_players;
begin
  if v_user is null then raise exception 'sign in required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 16 then raise exception 'nickname must be 2 to 16 characters'; end if;
  insert into public.gyro_players (id, display_name)
  values (v_user, v_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now()
  returning * into v_player;
  return v_player;
end;
$$;

create or replace function public.report_gyro_rank_match(
  p_match_id uuid,
  p_opponent uuid,
  p_my_score smallint,
  p_opponent_score smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_other public.gyro_rank_reports;
  v_me_rating integer;
  v_opponent_rating integer;
  v_my_delta integer;
  v_opponent_delta integer;
  v_expected numeric;
  v_winner uuid;
begin
  if v_me is null then raise exception 'sign in required'; end if;
  if p_opponent is null or p_opponent = v_me then raise exception 'invalid opponent'; end if;
  if p_my_score is null or p_opponent_score is null or p_my_score < 0 or p_opponent_score < 0 or p_my_score > 12 or p_opponent_score > 12 or p_my_score = p_opponent_score then raise exception 'invalid score'; end if;
  if not exists (select 1 from public.gyro_players where id = v_me) or not exists (select 1 from public.gyro_players where id = p_opponent) then raise exception 'ranked profile missing'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));
  if exists (select 1 from public.gyro_rank_matches where match_id = p_match_id) then
    return jsonb_build_object('status', 'already_verified');
  end if;

  insert into public.gyro_rank_reports (match_id, player_id, opponent_id, player_score, opponent_score)
  values (p_match_id, v_me, p_opponent, p_my_score, p_opponent_score)
  on conflict (match_id, player_id) do nothing;

  select * into v_other from public.gyro_rank_reports
  where match_id = p_match_id and player_id = p_opponent and opponent_id = v_me;
  if not found then return jsonb_build_object('status', 'waiting'); end if;
  if v_other.player_score <> p_opponent_score or v_other.opponent_score <> p_my_score then raise exception 'score reports do not match'; end if;

  select rating into v_me_rating from public.gyro_players where id = v_me for update;
  select rating into v_opponent_rating from public.gyro_players where id = p_opponent for update;
  v_expected := 1.0 / (1.0 + power(10.0, (v_opponent_rating - v_me_rating)::numeric / 400.0));
  v_my_delta := round(32.0 * ((case when p_my_score > p_opponent_score then 1.0 else 0.0 end) - v_expected));
  v_opponent_delta := -v_my_delta;
  v_winner := case when p_my_score > p_opponent_score then v_me else p_opponent end;

  update public.gyro_players set rating = rating + v_my_delta, wins = wins + case when v_winner = v_me then 1 else 0 end, losses = losses + case when v_winner <> v_me then 1 else 0 end, matches = matches + 1, updated_at = now() where id = v_me;
  update public.gyro_players set rating = rating + v_opponent_delta, wins = wins + case when v_winner = p_opponent then 1 else 0 end, losses = losses + case when v_winner <> p_opponent then 1 else 0 end, matches = matches + 1, updated_at = now() where id = p_opponent;

  insert into public.gyro_rank_matches (match_id, player_one, player_two, player_one_score, player_two_score, winner_id, player_one_delta, player_two_delta)
  values (p_match_id, v_me, p_opponent, p_my_score, p_opponent_score, v_winner, v_my_delta, v_opponent_delta);
  return jsonb_build_object('status', 'verified', 'rating_delta', v_my_delta);
end;
$$;

revoke all on public.gyro_players, public.gyro_rank_reports, public.gyro_rank_matches from anon, authenticated;
grant select on public.gyro_leaderboard to anon, authenticated;
grant execute on function public.set_gyro_nickname(text) to authenticated;
grant execute on function public.report_gyro_rank_match(uuid, uuid, smallint, smallint) to authenticated;
