// P3-T7 — change-password: ĐỔI MẬT KHẨU BẢN THÂN, bắt buộc nhập mật khẩu cũ
// (design §4.1 "Đổi mật khẩu của chính mình (nhập mật khẩu cũ)" — cả admin & staff).
//
// verify_jwt = false — nhận user access_token ở header Authorization và tự xác
// thực; CHỈ đổi được mật khẩu của CHÍNH user trong token (không có tham số id —
// đổi người khác nằm ở EF admin-users, P9).
//
// Luồng:
//   1) token hợp lệ (auth.getUser) → 401 nếu thiếu/sai/hết hạn
//   2) kiểm tra mật khẩu CŨ bằng password grant phía server (signInWithPassword)
//      → sai → 401 "Mật khẩu cũ không đúng"
//   3) admin.updateUserById(id, {password: mới})
//   4) profiles.must_change_password = false (bỏ cờ "bắt buộc đổi lần đầu")
//
// service_role chỉ nằm trong file này (Deno.env, secrets do runtime cấp).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://hemtra.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const MSG = {
  bad: "Dữ liệu không hợp lệ",
  generic: "Lỗi máy chủ, thử lại sau",
  noSession: "Phiên đăng nhập không hợp lệ, đăng nhập lại",
  wrongCurrent: "Mật khẩu cũ không đúng",
  samePassword: "Mật khẩu mới phải khác mật khẩu cũ",
  rateLimited: "Quá nhiều yêu cầu, thử lại sau",
  done: "Đã đổi mật khẩu",
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

const changeSchema = z.object({
  current_password: z.string().min(1).max(256),
  // 6 = độ dài tối thiểu mặc định của GoTrue (MIN_PASSWORD_LENGTH phía client)
  new_password: z.string().min(6).max(256),
});

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

async function handleChange(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  // 1) Xác thực user qua access_token của CHÍNH họ — không tin id trong body.
  const token = bearerToken(req);
  if (!token) return json(req, { error: MSG.noSession }, 401);
  const { data: authData, error: userErr } = await anon.auth.getUser(token);
  const user = authData?.user;
  if (userErr || !user?.email) return json(req, { error: MSG.noSession }, 401);

  const body = raw as Record<string, unknown>;
  const parsed = changeSchema.safeParse({
    current_password: typeof body.current_password === "string" ? body.current_password : "",
    new_password: typeof body.new_password === "string" ? body.new_password : "",
  });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { current_password, new_password } = parsed.data;
  if (current_password === new_password) {
    return json(req, { error: MSG.samePassword }, 400);
  }

  try {
    // 2) Mật khẩu cũ phải đúng — password grant phía server (không ảnh hưởng
    //    phiên client; lockout 5/15 là của EF auth-login, không áp ở đây).
    const { error: currentErr } = await anon.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    });
    if (currentErr) {
      if (currentErr.status === 429) return json(req, { error: MSG.rateLimited }, 429);
      return json(req, { error: MSG.wrongCurrent }, 401);
    }

    // 3) Đặt mật khẩu mới.
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      password: new_password,
    });
    if (updErr) {
      console.error("change-password: updateUserById:", updErr.message);
      return json(req, { error: MSG.generic }, 500);
    }

    // 4) Bỏ cờ "bắt buộc đổi lần đầu" (must_change_password) — service_role.
    //    Không chặn luồng nếu update 0 dòng (user chưa có profile): password đã
    //    đổi thành công, guard vẫn cho vào sau khi đổi (ghi evidence).
    const { error: flagErr } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (flagErr) console.error("change-password: must_change_password:", flagErr.message);

    return json(req, { ok: true, message: MSG.done });
  } catch (e) {
    console.error("change-password: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
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
    return await handleChange(req, admin, anon, body);
  } catch (e) {
    console.error("change-password: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
});
