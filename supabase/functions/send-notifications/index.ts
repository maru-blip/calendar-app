import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// pg_cronから15分おきに呼ばれる。verify_jwtは無効にし、代わりにx-cron-secretヘッダーで
// 自作の共有シークレットを検証する（シークレットはSupabase Vault経由でcronジョブに渡している）。

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function computeTriggerAt(dueDate: string, dueTime: string | null, daysBefore: number, hoursBefore: number): Date {
  const timePart = dueTime || "00:00:00";
  const dueAt = new Date(dueDate + "T" + timePart + "+09:00");
  return new Date(dueAt.getTime() - daysBefore * 86400000 - hoursBefore * 3600000);
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: pending, error: pendingErr } = await admin
    .from("todo_notifications")
    .select("id, days_before, hours_before, todos(id, title, due_date, due_time, completed)")
    .is("sent_at", null);
  if (pendingErr) {
    return new Response(JSON.stringify({ error: pendingErr.message }), { status: 500 });
  }

  const now = new Date();
  const due = (pending || []).filter((n: any) => {
    const todo = n.todos;
    if (!todo || todo.completed || !todo.due_date) return false;
    const triggerAt = computeTriggerAt(todo.due_date, todo.due_time, n.days_before, n.hours_before);
    return triggerAt <= now;
  });

  if (due.length === 0) {
    return new Response(JSON.stringify({ checked: (pending || []).length, sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: subs, error: subsErr } = await admin.from("push_subscriptions").select("*");
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 });
  }

  let sentCount = 0;
  const staleEndpoints = new Set<string>();

  for (const n of due) {
    const todo = (n as any).todos;
    const payload = JSON.stringify({
      title: "期限のお知らせ",
      body: todo.title,
      url: "/",
    });
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sentCount++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          staleEndpoints.add(sub.endpoint);
        }
      }
    }
    await admin.from("todo_notifications").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
  }

  if (staleEndpoints.size > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", Array.from(staleEndpoints));
  }

  return new Response(
    JSON.stringify({ checked: (pending || []).length, triggered: due.length, sent: sentCount, cleaned: staleEndpoints.size }),
    { headers: { "Content-Type": "application/json" } }
  );
});
