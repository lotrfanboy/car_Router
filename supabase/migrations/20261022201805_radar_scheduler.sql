-- Run the Radar worker from Supabase without exposing its bearer token.
-- Deployment-specific values live in Supabase Vault under radar_app_url and
-- radar_cron_secret; this migration only defines the idempotent schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'radar-automotivo-tick';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'radar-automotivo-tick',
    '*/30 * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'radar_app_url'
        ) || '/api/radars/tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'radar_cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 900000
      ) as request_id;
    $job$
  );
end
$migration$;
