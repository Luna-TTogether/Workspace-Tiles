create schema if not exists private;

create table if not exists private.ai_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task text not null check (task in ('recommend_existing_workspace', 'suggest_workspace_draft')),
  idempotency_key text not null,
  usage_date date not null default (timezone('utc', now()))::date,
  status text not null check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task, idempotency_key)
);

alter table private.ai_requests enable row level security;
revoke all on table private.ai_requests from public, anon, authenticated;
grant all on table private.ai_requests to service_role;

create index if not exists ai_requests_user_task_date_idx
  on private.ai_requests (user_id, task, usage_date);

create or replace function public.claim_ai_request(
  p_user_id uuid,
  p_task text,
  p_idempotency_key text,
  p_daily_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  existing private.ai_requests%rowtype;
  used_count integer;
  next_reset timestamptz := (
    date_trunc('day', timezone('utc', now())) + interval '1 day'
  ) at time zone 'utc';
begin
  if p_task not in ('recommend_existing_workspace', 'suggest_workspace_draft')
    or p_daily_limit < 1
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 160 then
    raise exception 'invalid ai request claim';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_task || ':' || (timezone('utc', now()))::date::text,
    0
  ));

  update private.ai_requests
    set result = null
    where user_id = p_user_id
      and result is not null
      and updated_at < now() - interval '24 hours';
  delete from private.ai_requests
    where user_id = p_user_id
      and created_at < now() - interval '8 days';

  select * into existing
    from private.ai_requests
    where user_id = p_user_id
      and task = p_task
      and idempotency_key = p_idempotency_key;

  select count(*) into used_count
    from private.ai_requests
    where user_id = p_user_id
      and task = p_task
      and usage_date = (timezone('utc', now()))::date;

  if existing.request_id is not null then
    if existing.status = 'completed' and existing.result is not null then
      return jsonb_build_object(
        'claim', 'cached',
        'requestId', existing.request_id,
        'result', existing.result,
        'remaining', greatest(p_daily_limit - used_count, 0),
        'limit', p_daily_limit,
        'resetAt', next_reset
      );
    end if;
    if existing.status = 'processing' and existing.updated_at >= now() - interval '2 minutes' then
      return jsonb_build_object(
        'claim', 'processing',
        'requestId', existing.request_id,
        'remaining', greatest(p_daily_limit - used_count, 0),
        'limit', p_daily_limit,
        'resetAt', next_reset
      );
    end if;
    update private.ai_requests
      set status = 'processing', error_code = null, updated_at = now()
      where request_id = existing.request_id;
    return jsonb_build_object(
      'claim', 'granted',
      'requestId', existing.request_id,
      'remaining', greatest(p_daily_limit - used_count, 0),
      'limit', p_daily_limit,
      'resetAt', next_reset
    );
  end if;

  if used_count >= p_daily_limit then
    return jsonb_build_object(
      'claim', 'quota_exceeded',
      'remaining', 0,
      'limit', p_daily_limit,
      'resetAt', next_reset
    );
  end if;

  insert into private.ai_requests (user_id, task, idempotency_key, status)
    values (p_user_id, p_task, p_idempotency_key, 'processing')
    returning * into existing;

  return jsonb_build_object(
    'claim', 'granted',
    'requestId', existing.request_id,
    'remaining', greatest(p_daily_limit - used_count - 1, 0),
    'limit', p_daily_limit,
    'resetAt', next_reset
  );
end;
$$;

create or replace function public.complete_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.ai_requests
    set status = 'completed', result = p_result, error_code = null, updated_at = now()
    where request_id = p_request_id and user_id = p_user_id;
  return found;
end;
$$;

create or replace function public.fail_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.ai_requests
    set status = 'failed', result = null, error_code = left(p_error_code, 80), updated_at = now()
    where request_id = p_request_id and user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.claim_ai_request(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_ai_request(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_ai_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_request(uuid, text, text, integer) to service_role;
grant execute on function public.complete_ai_request(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_ai_request(uuid, uuid, text) to service_role;
