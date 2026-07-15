import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 既にログイン中の許可メンバーだけが、新しいメールアドレスを共有メンバーとして招待できる。
// 招待されたメールアドレスはパスワードなしのAuthユーザーとして事前作成し、
// 以後はマジックリンクでログインできるようにする（新規サインアップは無効化したまま）。

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user?.email) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const callerEmail = userData.user.email;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: allowedRow } = await admin
    .from("allowed_emails")
    .select("email")
    .eq("email", callerEmail)
    .maybeSingle();
  if (!allowedRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }
  const newEmail = (body.email || "").trim().toLowerCase();
  if (!newEmail || !newEmail.includes("@")) {
    return new Response(JSON.stringify({ error: "invalid email" }), { status: 400 });
  }

  const { data: existingUsers, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), { status: 500 });
  }
  const already = existingUsers.users.find((u) => (u.email || "").toLowerCase() === newEmail);

  if (!already) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: newEmail,
      email_confirm: true,
    });
    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 500 });
    }
  }

  const { error: insertErr } = await admin
    .from("allowed_emails")
    .upsert({ email: newEmail }, { onConflict: "email" });
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, email: newEmail }), {
    headers: { "Content-Type": "application/json" },
  });
});
