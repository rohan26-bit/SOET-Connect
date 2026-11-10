-- Login throttling state is isolated in a non-exposed schema.
-- Only the backend's Supabase service role can access it.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.login_rate_limits (
    key_hash text primary key
        check (key_hash ~ '^[0-9a-f]{64}$'),
    attempts integer not null default 0
        check (attempts >= 0),
    window_started_at timestamptz not null,
    blocked_until timestamptz,
    updated_at timestamptz not null default now()
);

alter table private.login_rate_limits enable row level security;

revoke all on table private.login_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.login_rate_limits to service_role;

-- Internal upsert helper. It is SECURITY INVOKER and runs with the
-- service_role permissions of the calling backend request.
create or replace function private.bump_login_rate_limit(
    p_key_hash text,
    p_now timestamptz,
    p_window_seconds integer,
    p_lock_seconds integer,
    p_max_attempts integer
)
returns table (
    attempts integer,
    blocked_until timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_attempts integer;
    v_blocked_until timestamptz;
begin
    if p_key_hash is null
       or p_key_hash !~ '^[0-9a-f]{64}$'
       or p_now is null
       or p_window_seconds < 1
       or p_lock_seconds < 1
       or p_max_attempts < 1 then
        raise exception 'Invalid login rate-limit parameters.';
    end if;

    insert into private.login_rate_limits as existing (
        key_hash,
        attempts,
        window_started_at,
        blocked_until,
        updated_at
    )
    values (
        p_key_hash,
        1,
        p_now,
        case
            when 1 >= p_max_attempts
                then p_now + (p_lock_seconds * interval '1 second')
            else null
        end,
        p_now
    )
    on conflict (key_hash) do update
    set
        attempts = case
            when existing.window_started_at <= p_now - (p_window_seconds * interval '1 second')
                then 1
            else existing.attempts + 1
        end,
        window_started_at = case
            when existing.window_started_at <= p_now - (p_window_seconds * interval '1 second')
                then p_now
            else existing.window_started_at
        end,
        blocked_until = case
            when existing.blocked_until > p_now
                then existing.blocked_until
            when existing.window_started_at <= p_now - (p_window_seconds * interval '1 second')
                then case
                    when 1 >= p_max_attempts
                        then p_now + (p_lock_seconds * interval '1 second')
                    else null
                end
            when existing.attempts + 1 >= p_max_attempts
                then p_now + (p_lock_seconds * interval '1 second')
            else null
        end,
        updated_at = p_now
    returning existing.attempts, existing.blocked_until
    into v_attempts, v_blocked_until;

    return query select v_attempts, v_blocked_until;
end;
$function$;

-- This function is the only read path used by the backend before password
-- verification. A blocked account/IP bucket produces the same response.
create or replace function public.check_login_rate_limit(
    p_account_key_hash text,
    p_ip_key_hash text,
    p_account_ip_key_hash text,
    p_now timestamptz
)
returns table (
    is_blocked boolean,
    retry_after_seconds integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
    select
        coalesce(bool_or(l.blocked_until > p_now), false) as is_blocked,
        coalesce(
            greatest(
                0,
                ceil(extract(epoch from (max(l.blocked_until) - p_now)))::integer
            ),
            0
        ) as retry_after_seconds
    from private.login_rate_limits as l
    where l.key_hash = any (
        array[p_account_key_hash, p_ip_key_hash, p_account_ip_key_hash]::text[]
    )
      and l.blocked_until > p_now;
$function$;

-- Record a failed credential check in three independent buckets:
-- account-wide, source-IP-wide, and account/source-IP pair.
create or replace function public.record_login_failure(
    p_account_key_hash text,
    p_ip_key_hash text,
    p_account_ip_key_hash text,
    p_now timestamptz,
    p_window_seconds integer,
    p_lock_seconds integer,
    p_account_max_attempts integer,
    p_ip_max_attempts integer,
    p_account_ip_max_attempts integer
)
returns table (
    is_blocked boolean,
    retry_after_seconds integer,
    account_attempts integer,
    ip_attempts integer,
    account_ip_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_account_attempts integer;
    v_ip_attempts integer;
    v_account_ip_attempts integer;
    v_account_blocked_until timestamptz;
    v_ip_blocked_until timestamptz;
    v_account_ip_blocked_until timestamptz;
    v_blocked_until timestamptz;
begin
    select b.attempts, b.blocked_until
      into v_account_attempts, v_account_blocked_until
      from private.bump_login_rate_limit(
          p_account_key_hash, p_now, p_window_seconds,
          p_lock_seconds, p_account_max_attempts
      ) as b;

    select b.attempts, b.blocked_until
      into v_ip_attempts, v_ip_blocked_until
      from private.bump_login_rate_limit(
          p_ip_key_hash, p_now, p_window_seconds,
          p_lock_seconds, p_ip_max_attempts
      ) as b;

    select b.attempts, b.blocked_until
      into v_account_ip_attempts, v_account_ip_blocked_until
      from private.bump_login_rate_limit(
          p_account_ip_key_hash, p_now, p_window_seconds,
          p_lock_seconds, p_account_ip_max_attempts
      ) as b;

    select greatest(
        case when v_account_blocked_until > p_now then v_account_blocked_until end,
        case when v_ip_blocked_until > p_now then v_ip_blocked_until end,
        case when v_account_ip_blocked_until > p_now then v_account_ip_blocked_until end
    )
    into v_blocked_until;

    return query
    select
        (v_blocked_until is not null),
        case
            when v_blocked_until is null then 0
            else greatest(1, ceil(extract(epoch from (v_blocked_until - p_now)))::integer)
        end,
        v_account_attempts,
        v_ip_attempts,
        v_account_ip_attempts;
end;
$function$;

-- A correct password clears account and account/IP failures, but leaves the
-- IP-wide bucket intact so one successful login cannot erase a source's spray history.
create or replace function public.clear_login_account_failures(
    p_account_key_hash text,
    p_account_ip_key_hash text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
    delete from private.login_rate_limits
    where key_hash = any (
        array[p_account_key_hash, p_account_ip_key_hash]::text[]
    );
$function$;

-- Keep all internal functions inaccessible to public and user-facing API roles.
revoke all on function private.bump_login_rate_limit(text, timestamptz, integer, integer, integer)
    from public, anon, authenticated;
grant execute on function private.bump_login_rate_limit(text, timestamptz, integer, integer, integer)
    to service_role;

revoke all on function public.check_login_rate_limit(text, text, text, timestamptz)
    from public, anon, authenticated;
grant execute on function public.check_login_rate_limit(text, text, text, timestamptz)
    to service_role;

revoke all on function public.record_login_failure(text, text, text, timestamptz, integer, integer, integer, integer, integer)
    from public, anon, authenticated;
grant execute on function public.record_login_failure(text, text, text, timestamptz, integer, integer, integer, integer, integer)
    to service_role;

revoke all on function public.clear_login_account_failures(text, text)
    from public, anon, authenticated;
grant execute on function public.clear_login_account_failures(text, text)
    to service_role;

-- Login buckets are short-lived; remove stale fingerprints daily.
do $schedule$
declare
    v_job_id bigint;
begin
    for v_job_id in
        select jobid
        from cron.job
        where jobname = 'cleanup-soet-login-rate-limits'
    loop
        perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
        'cleanup-soet-login-rate-limits',
        '25 2 * * *',
        $command$
            delete from private.login_rate_limits
            where updated_at < now() - interval '48 hours';
        $command$
    );
end;
$schedule$;
