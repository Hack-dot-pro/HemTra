// P12-T10 — delete-bills: ADMIN xóa 1 bill + ảnh Storage + TRỪ stats
// (quyết định user 2026-10-04 — state.json decisions.p12_user_requests_2026_10_04;
//  thay cho "không ai được xóa" của AGENT.md §6/§11.4 — user tự sửa hiến pháp).
//
// verify_jwt = false (config.toml) — EF tự xác thực access_token như các EF khác.
//
// Thứ tự BẮT BUỘC (giống cleanup-bills — design §6.4):
//   1) token hợp lệ → user
//   2) profiles.role = 'admin' (service_role đọc, không tin claim)
//   3) body { bill_id (uuid), password } — zod validate
//   4) XÁC MINH MẬT KHẨU ADMIN server-side bằng password grant (signInWithPassword)
//      → sai → 401 "Mật khẩu admin không đúng" (staff không có mật khẩu admin = không xóa được)
//   5) đọc bill (không thấy → 404)
//   6) xóa file Storage TRƯỚC (lỗi → 500, GIỮ nguyên dòng)
//   7) RPC admin_delete_bill (service_role) — tự trừ stats_daily /
//      stats_product_monthly / stats_product_alltime rồi mới xóa bill + bill_items
//
// service_role chỉ nằm trong file này (Deno.env, secrets do runtime cấp).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@3.23.8";

const BILL_BUCKET = "bills";

const ALLOWED_ORIGINS = [
  "https://hemtra.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const MSG = {
  bad: "Dữ liệu không hợp lệ",
  generic: "Lỗi máy chủ, thử lại sau",
  noSession: "Phiên đăng nhập không hợp lệ, đăng nhập lại",
  forbidden: "Chỉ admin mới được xóa bill",
  wrongPassword: "Mật khẩu admin không đúng",
  notFound: "Không tìm thấy bill",
  storage: "Không xóa được ảnh bill — thử lại sau",
  done: "Đã xóa bill",
} as const;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  if (ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env: ${name}`);
  return value;
}

function makeClients(): { admin: SupabaseClient; anon: SupabaseClient } {
  const url = env("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey = secretKeys
    ? JSON.parse(secretKeys)["default"]
    : env("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = publishableKeys
    ? JSON.parse(publishableKeys)["default"]
    : env("SUPABASE_ANON_KEY");
  return {
    admin: createClient(url, serviceKey),
    anon: createClient(url, publishableKey, { auth: { persistSession: false } }),
  };
}

const deleteSchema = z.object({
  bill_id: z.string().uuid(),
  password: z.string().min(1).max(256),
});

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

type BillTarget = { id: string; code: string; image_path: string };

async function handleDelete(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  // 1) Xác thực phiên của CHÍNH người gọi.
  const token = bearerToken(req);
  if (!token) return json(req, { error: MSG.noSession }, 401);
  const { data: authData, error: userErr } = await anon.auth.getUser(token);
  const user = authData?.user;
  if (userErr || !user?.email) return json(req, { error: MSG.noSession }, 401);

  const body = raw as Record<string, unknown>;
  const parsed = deleteSchema.safeParse({
    bill_id: typeof body.bill_id === "string" ? body.bill_id : "",
    password: typeof body.password === "string" ? body.password : "",
  });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { bill_id, password } = parsed.data;

  // 2) Chỉ admin — đọc profiles bằng service_role (không tin role claim).
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileErr) {
    console.error("delete-bills: profiles:", profileErr.message);
    return json(req, { error: MSG.generic }, 500);
  }
  if ((profile as { role: string } | null)?.role !== "admin") {
    return json(req, { error: MSG.forbidden }, 403);
  }

  // 3) Xác minh mật khẩu ADMIN server-side (password grant — không đổi phiên client).
  const { error: pwdErr } = await anon.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (pwdErr) {
    if (pwdErr.status === 429) return json(req, { error: MSG.generic }, 429);
    return json(req, { error: MSG.wrongPassword }, 401);
  }

  // 4) Đọc bill.
  const { data: billRow, error: billErr } = await admin
    .from("bills")
    .select("id,code,image_path")
    .eq("id", bill_id)
    .maybeSingle();
  if (billErr) {
    console.error("delete-bills: bills_select:", billErr.message);
    return json(req, { error: MSG.generic }, 500);
  }
  if (!billRow) return json(req, { error: MSG.notFound }, 404);
  const bill = billRow as BillTarget;

  // 5) Ảnh Storage TRƯỚC — lỗi → không xóa dòng (idempotent, lần sau thử lại).
  if (bill.image_path) {
    const { error: removeErr } = await admin.storage.from(BILL_BUCKET).remove([bill.image_path]);
    if (removeErr) {
      console.error("delete-bills: storage_remove:", removeErr.message);
      return json(req, { error: MSG.storage }, 500);
    }
  }

  // 6) RPC service_role — trừ stats rồi xóa bill + bill_items (ON DELETE CASCADE).
  const { data: rpcData, error: rpcErr } = await admin.rpc("admin_delete_bill", {
    p_bill_id: bill_id,
  });
  if (rpcErr) {
    console.error("delete-bills: rpc:", rpcErr.message);
    return json(req, { error: MSG.generic }, 500);
  }
  const result = (rpcData ?? {}) as { ok?: boolean; rows?: number };
  if (!result.ok || !result.rows) return json(req, { error: MSG.notFound }, 404);

  console.log("delete-bills:", JSON.stringify({ code: bill.code, rows: result.rows }));
  return json(req, { ok: true, message: MSG.done, code: bill.code });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: MSG.bad }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: MSG.bad }, 400);
  }
  if (!body || typeof body !== "object") return json(req, { error: MSG.bad }, 400);

  try {
    const { admin, anon } = makeClients();
    return await handleDelete(req, admin, anon, body);
  } catch (e) {
    console.error("delete-bills: unhandled:", e instanceof Error ? e.message : "unknown");
    return json(req, { error: MSG.generic }, 500);
  }
});
