-- CarSwipe schema, part 8: live chat over Supabase Realtime Broadcast.
-- Each conversation is a private channel "conversation:<id>"; only its buyer
-- and the dealer's members may subscribe.

create or replace function public.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'conversation:' || new.conversation_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger messages_broadcast after insert on public.messages
  for each row execute function public.broadcast_message();

-- Per-user channel for offer / lead notifications.
create or replace function public.broadcast_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || new.user_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger notifications_broadcast after insert on public.notifications
  for each row execute function public.broadcast_notification();

create policy "participants receive conversation broadcasts" on realtime.messages
  for select to authenticated
  using (
    (realtime.topic() like 'conversation:%'
      and public.is_conversation_participant(nullif(split_part(realtime.topic(), ':', 2), '')::uuid))
    or realtime.topic() = 'user:' || (select auth.uid())::text
  );

revoke execute on function public.broadcast_message() from public, anon, authenticated;
revoke execute on function public.broadcast_notification() from public, anon, authenticated;
