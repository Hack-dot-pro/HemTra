// P3-T4 — auth-login: đăng nhập bằng username + mật khẩu (design §4.3).
//
// verify_jwt = false (chưa có phiên) — bảo vệ bằng:
//   1) lockout 5 lần sai / 15 phút theo cặp (username, ip) — ghi login_attempts
//   2) thông báo lỗi LUÔN chung chung (không lộ user tồn tại hay không)
//   3) sai ≥ 5 lần → client gọi unlock-otp/unlock-verify để khôi phục lượt
//      đăng nhập bằng OTP email (user chọn 2026-10-02 thay Turnstile — decisions)
//   4) rate limit OTP của GoTrue (60s/email, 30/h)
//
// Username → email Auth: tìm profiles.username → auth.users (admin gốc có email
// thật từ bootstrap; staff là <username>@hem.local — không gửi mail thật, design §4.3).
// service_role chỉ nằm trong file này (Deno.env, secrets do runtime cấp).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@3.23.8";

const ALLOWED_ORIGINS = [
  "https://hemtra.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const LOCKOUT_LIMIT = 5;
const LOCKOUT_WINDOW_MIN = 15;
const PRUNE_AFTER_H = 24;

const MSG = {
  bad: "Dữ liệu không hợp lệ",
  countFail: "Không kiểm tra được lượt đăng nhập. Hãy thử lại sau.",
  generic: "Lỗi máy chủ, thử lại sau",
  invalid: "Tài khoản hoặc mật khẩu không đúng.",
  locked: "Sai mật khẩu quá 5 lần. Hãy khôi phục bằng OTP hoặc thử lại sau 15 phút.",
  otp: "Mã OTP không đúng hoặc đã hết hạn",
  otpSent: "Đã gửi mã OTP (nếu tài khoản có email khôi phục).",
  unlocked: "Đã khôi phục lượt đăng nhập. Hãy thử đăng nhập lại.",
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

function makeClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("missing env: SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const serviceKey = secretKeys
    ? JSON.parse(secretKeys)["default"]
    : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) throw new Error("missing service role key");
  return createClient(url, serviceKey);
}

// Anon client chỉ dùng cho verifyOtp (không cần quyền service_role).
function makeAnonClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const anonKey = publishableKeys
    ? JSON.parse(publishableKeys)["default"]
    : Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("missing anon config");
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
const usernameSchema = z.object({ username: z.string().min(1).max(64) });
const verifySchema = z.object({
  username: z.string().min(1).max(64),
  token: z.string().regex(/^\d{6}$/),
});

function normalizeUsername(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

// IP tin được: CF/ gateway set x-forwarded-for; rơi hết thì fallback an toàn.
function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (/^[0-9a-fA-F:.]+$/.test(first)) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real && /^[0-9a-fA-F:.]+$/.test(real)) return real;
  return "127.0.0.1";
}

// SEC-004: trả `null` khi không đếm được (DB lỗi / WAF chặn query nội bộ) —
// người gọi bắt buộc phải chặn đăng nhập (fail-closed), không được ném lỗi 500.
async function getFailedCount(
  admin: SupabaseClient,
  username: string,
  ip: string,
): Promise<number | null> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("username", username)
    .eq("ip", ip)
    .eq("success", false)
    .gt("at", since);
  if (error) {
    console.error("auth-login: getFailedCount:", error.message);
    return null;
  }
  return count ?? 0;
}

async function recordAttempt(
  admin: SupabaseClient,
  username: string,
  ip: string,
  success: boolean,
): Promise<void> {
  const { error } = await admin.from("login_attempts").insert({ username, ip, success });
  if (error) console.error("auth-login: recordAttempt:", error.message);
  // Dọn lượt cũ (bảng chỉ phục vụ lockout) — tham số idx (username, at)
  const cutoff = new Date(Date.now() - PRUNE_AFTER_H * 3_600_000).toISOString();
  await admin.from("login_attempts").delete().eq("username", username).lt("at", cutoff);
}

// profiles.username → auth email. Không lộ phân biệt "tồn tại/không" ra client.
async function resolveAuthEmail(
  admin: SupabaseClient,
  username: string,
): Promise<string | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return null;
  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  if (error || !data?.user?.email) {
    console.error("auth-login: getUserById:", error?.message);
    return null;
  }
  return data.user.email;
}

async function handleLogin(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = loginSchema.safeParse(raw ?? {});
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  const username = normalizeUsername(parsed.data.username);
  const ip = getClientIp(req);

  try {
    const failed = await getFailedCount(admin, username, ip);
    // SEC-004: không đếm được lượt sai → fail-closed, chặn đăng nhập (không 500).
    if (failed === null) {
      return json(req, { error: MSG.countFail, locked: true }, 429);
    }
    if (failed >= LOCKOUT_LIMIT) {
      return json(req, { error: MSG.locked, locked: true }, 429);
    }

    const email = await resolveAuthEmail(admin, username);
    if (email) {
      const { data, error } = await anon.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      if (!error && data.session) {
        await recordAttempt(admin, username, ip, true);
        return json(req, { ok: true, session: data.session });
      }
    }

    await recordAttempt(admin, username, ip, false);
    return json(req, { error: MSG.invalid, locked: false }, 401);
  } catch (e) {
    console.error("auth-login: login:", e);
    return json(req, { error: MSG.generic }, 500);
  }
}

// Gửi OTP khôi phục lượt đăng nhập. LUÔN trả {ok:true} dù email không tồn tại
// hay không gửi được (chống dò username qua phản hồi).
async function handleUnlockOtp(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = usernameSchema.safeParse(raw ?? {});
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  const username = normalizeUsername(parsed.data.username);
  try {
    const email = await resolveAuthEmail(admin, username);
    if (email) {
      const { error } = await anon.auth.signInWithOtp({ email, shouldCreateUser: false });
      if (error) console.error("auth-login: unlock signInWithOtp:", error.message);
    }
  } catch (e) {
    console.error("auth-login: unlock-otp:", e);
  }
  return json(req, { ok: true, message: MSG.otpSent });
}

// Xác minh OTP → xóa toàn bộ lượt sai của username (mọi IP) = mở khóa ngay.
async function handleUnlockVerify(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = verifySchema.safeParse(raw ?? {});
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  const username = normalizeUsername(parsed.data.username);
  try {
    const email = await resolveAuthEmail(admin, username);
    if (email) {
      const { data, error } = await anon.auth.verifyOtp({ email, token: parsed.data.token, type: "email" });
      if (!error && data?.user) {
        const { error: delError } = await admin
          .from("login_attempts")
          .delete()
          .eq("username", username)
          .eq("success", false);
        if (delError) {
          console.error("auth-login: unlock delete:", delError.message);
          return json(req, { error: MSG.generic }, 500);
        }
        return json(req, { ok: true, message: MSG.unlocked });
      }
    }
  } catch (e) {
    console.error("auth-login: unlock-verify:", e);
    return json(req, { error: MSG.generic }, 500);
  }
  return json(req, { error: MSG.otp }, 401);
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
    const admin = makeClient();
    const anon = makeAnonClient();
    const action = (body as Record<string, unknown>).action;
    if (action === "login") return await handleLogin(req, admin, anon, body);
    if (action === "unlock-otp") return await handleUnlockOtp(req, admin, anon, body);
    if (action === "unlock-verify") return await handleUnlockVerify(req, admin, anon, body);
    return json(req, { error: MSG.bad }, 400);
  } catch (e) {
    console.error("auth-login: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
});
