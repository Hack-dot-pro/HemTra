// P3-T6 — admin-recovery: khôi phục mật khẩu admin qua OTP email (design §4.4).
//
// verify_jwt = false (chưa có phiên) — bảo vệ bằng:
//   1) email BẮT BUỘC trùng `app_meta.admin_email` (chỉ service_role đọc được) —
//      thiếu ràng buộc này thì email nào cũng reset được mật khẩu admin (đúng
//      cảnh báo design §4.4)
//   2) request-otp LUÔN trả {ok:true} cho mọi email hợp lệ (anti-oracle: không
//      lộ email admin; email sai → không gửi gì)
//   3) verify OTP server-side, KHÔNG trả session cho client (client đăng nhập
//      lại bằng mật khẩu mới — design §4.4)
//   4) rate limit OTP của GoTrue (60s/email, 30/h)
//
// Staff không tự khôi phục (không có trong admin_email) → UI hiện "Liên hệ admin".
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
  otp: "Mã OTP không đúng hoặc đã hết hạn",
  done: "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.",
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

const requestOtpSchema = z.object({ email: z.string().email().max(254) });
const verifySchema = z.object({
  email: z.string().email().max(254),
  token: z.string().regex(/^\d{6}$/),
  // 6 = độ dài tối thiểu mặc định của GoTrue (MIN_PASSWORD_LENGTH phía client)
  password: z.string().min(6).max(256),
});

function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

// app_meta.admin_email: null khi chưa bootstrap → mọi yêu cầu coi như không khớp.
async function getAdminEmail(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from("app_meta").select("admin_email").eq("id", 1).single();
  if (error) throw new Error(`app_meta read: ${error.message}`);
  const email = (data as { admin_email: string | null }).admin_email;
  return email ? email.trim().toLowerCase() : null;
}

// LUÔN 200 cho email hợp lệ — email đúng thì gửi OTP, email sai không gửi gì.
// Không phán đúng/sai, không lộ email admin (anti-oracle như bootstrap-admin).
async function handleRequestOtp(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = requestOtpSchema.safeParse({ email: normalizeEmail((raw as Record<string, unknown>).email) });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  try {
    const expected = await getAdminEmail(admin);
    if (expected && parsed.data.email === expected) {
      // shouldCreateUser=false: recovery không phải đường signup
      const { error } = await anon.auth.signInWithOtp({
        email: parsed.data.email,
        shouldCreateUser: false,
      });
      if (error) console.error("admin-recovery: signInWithOtp:", error.message);
    }
  } catch (e) {
    console.error("admin-recovery: request-otp:", e);
    return json(req, { error: MSG.generic }, 500);
  }
  return json(req, { ok: true });
}

async function handleVerify(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const body = raw as Record<string, unknown>;
  const parsed = verifySchema.safeParse({
    email: normalizeEmail(body.email),
    token: typeof body.token === "string" ? body.token.trim() : "",
    password: body.password,
  });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { email, token, password } = parsed.data;

  try {
    // Check TRƯỚC verifyOtp: email không phải admin → 401 cùng thông điệp với
    // OTP sai (không phân biệt trong response, không cho email lạ tiêu quota GoTrue).
    // (Timing oracle không đáng kể với dự án cá nhân — ghi evidence.)
    const expected = await getAdminEmail(admin);
    if (!expected || email !== expected) return json(req, { error: MSG.otp }, 401);

    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (verifyErr || !verified?.user) {
      console.error("admin-recovery: verifyOtp:", verifyErr?.message);
      return json(req, { error: MSG.otp }, 401);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(verified.user.id, {
      password,
    });
    if (updErr) {
      console.error("admin-recovery: updateUserById:", updErr.message);
      return json(req, { error: MSG.generic }, 500);
    }
    return json(req, { ok: true, message: MSG.done });
  } catch (e) {
    console.error("admin-recovery: verify:", e);
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
    const action = (body as Record<string, unknown>).action;
    if (action === "request-otp") return await handleRequestOtp(req, admin, anon, body);
    if (action === "verify") return await handleVerify(req, admin, anon, body);
    return json(req, { error: MSG.bad }, 400);
  } catch (e) {
    console.error("admin-recovery: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
});
