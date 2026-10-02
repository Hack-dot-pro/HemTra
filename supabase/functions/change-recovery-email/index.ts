// P3-T8 — change-recovery-email: ĐỔI EMAIL KHÔI PHỤC ("đổi key admin"),
// design §4.4 + Q-005 (state.json → decisions.admin_transfer).
//
// Bắt buộc ĐỦ 2 ĐIỀU KIỆN, server tự kiểm cả 2 (không tin client):
//   1) Mật khẩu admin hiện tại VÀ OTP gửi tới email HIỆN TẠI (app_meta.admin_email)
//   2) OTP email MỚI → đặt mật khẩu mới + ghi đè app_meta.admin_email
// Thiếu bất kỳ điều kiện nào → từ chối, không thay đổi gì.
//
// verify_jwt = false — tự xác thực access_token; CHỈ role=admin mới gọi được
// (kiểm qua profiles phía server, không tin claim). Trạng thái 2 bước giữ ở
// client (stateless): complete nhận CẢ 2 OTP + mật khẩu và kiểm 1 lượt.
//
// request-new dùng signInWithOtp(shouldCreateUser=true) để gửi OTP cho email
// chưa có user → có thể sinh "user tạm"; complete xác thực xong sẽ XOÁ user
// tạm này (chỉ khi không có profiles — email thật của user khác bị TỪ CHỐI).

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
  notAdmin: "Chỉ admin mới dùng chức năng này",
  noAdminEmail: "Hệ thống chưa cấu hình email khôi phục",
  wrongPassword: "Mật khẩu admin không đúng",
  sameEmail: "Email mới phải khác email hiện tại",
  emailTaken: "Email mới đã được dùng cho tài khoản khác",
  otp: "Mã OTP không đúng hoặc đã hết hạn",
  rateLimited: "Quá nhiều yêu cầu, thử lại sau",
  done: "Đã đổi email khôi phục. Hãy đăng nhập bằng mật khẩu mới.",
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

const requestCurrentSchema = z.object({ password: z.string().min(1).max(256) });
const requestNewSchema = z.object({ new_email: z.string().email().max(254) });
const completeSchema = z.object({
  password: z.string().min(1).max(256),
  current_token: z.string().regex(/^\d{6}$/),
  new_email: z.string().email().max(254),
  new_token: z.string().regex(/^\d{6}$/),
  new_password: z.string().min(6).max(256),
});

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

type Caller = { id: string };

// Xác thực user qua access_token + ÉP role=admin từ profiles (service_role).
async function requireAdmin(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
): Promise<Caller | Response> {
  const token = bearerToken(req);
  if (!token) return json(req, { error: MSG.noSession }, 401);
  const { data: authData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !authData?.user?.id) return json(req, { error: MSG.noSession }, 401);

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (pErr) throw new Error(`profiles read: ${pErr.message}`);
  if (!profile || profile.role !== "admin") return json(req, { error: MSG.notAdmin }, 403);
  return { id: authData.user.id };
}

async function getAdminEmail(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from("app_meta").select("admin_email").eq("id", 1).single();
  if (error) throw new Error(`app_meta read: ${error.message}`);
  const email = (data as { admin_email: string | null }).admin_email;
  return email ? email.trim().toLowerCase() : null;
}

async function handleRequestCurrent(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  const caller = await requireAdmin(req, admin, anon);
  if (caller instanceof Response) return caller;

  const parsed = requestCurrentSchema.safeParse(raw ?? {});
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  const currentEmail = await getAdminEmail(admin);
  if (!currentEmail) return json(req, { error: MSG.noAdminEmail }, 400);

  const { error: pwErr } = await anon.auth.signInWithPassword({
    email: currentEmail,
    password: parsed.data.password,
  });
  if (pwErr) {
    if (pwErr.status === 429) return json(req, { error: MSG.rateLimited }, 429);
    return json(req, { error: MSG.wrongPassword }, 401);
  }

  // Gửi OTP tới email HIỆN TẠI (admin đã tồn tại → không cần tạo user).
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email: currentEmail,
    shouldCreateUser: false,
  });
  if (otpErr) console.error("change-recovery-email: otp hiện tại:", otpErr.message);
  return json(req, { ok: true });
}

async function handleRequestNew(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  const caller = await requireAdmin(req, admin, anon);
  if (caller instanceof Response) return caller;

  const body = (raw ?? {}) as Record<string, unknown>;
  const parsed = requestNewSchema.safeParse({ new_email: normalizeEmail(body.new_email) });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  const currentEmail = await getAdminEmail(admin);
  if (!currentEmail) return json(req, { error: MSG.noAdminEmail }, 400);
  if (parsed.data.new_email === currentEmail) {
    return json(req, { error: MSG.sameEmail }, 400);
  }

  // Email chưa có user → nên cần tạo user tạm để nhận OTP (complete sẽ xoá).
  // Email đã có user thật (có profiles) → từ chối ngay, không gửi OTP.
  const { data: junkList, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (lErr) throw new Error(`listUsers: ${lErr.message}`);
  const existing = junkList?.users?.find((u) => (u.email ?? "").toLowerCase() === parsed.data.new_email);
  if (existing) {
    const { data: p } = await admin
      .from("profiles")
      .select("id")
      .eq("id", existing.id)
      .maybeSingle();
    if (p) return json(req, { error: MSG.emailTaken }, 409);
  }

  const { error: otpErr } = await anon.auth.signInWithOtp({
    email: parsed.data.new_email,
    shouldCreateUser: true,
  });
  if (otpErr) console.error("change-recovery-email: otp mới:", otpErr.message);
  return json(req, { ok: true });
}

async function handleComplete(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  const caller = await requireAdmin(req, admin, anon);
  if (caller instanceof Response) return caller;

  const body = (raw ?? {}) as Record<string, unknown>;
  const parsed = completeSchema.safeParse({
    password: typeof body.password === "string" ? body.password : "",
    current_token: typeof body.current_token === "string" ? body.current_token.trim() : "",
    new_email: normalizeEmail(body.new_email),
    new_token: typeof body.new_token === "string" ? body.new_token.trim() : "",
    new_password: typeof body.new_password === "string" ? body.new_password : "",
  });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { password, current_token, new_email, new_token, new_password } = parsed.data;

  const currentEmail = await getAdminEmail(admin);
  if (!currentEmail) return json(req, { error: MSG.noAdminEmail }, 400);
  if (new_email === currentEmail) return json(req, { error: MSG.sameEmail }, 400);

  try {
    // ── Điều kiện 1: mật khẩu admin hiện tại ──
    const { data: granted, error: pwErr } = await anon.auth.signInWithPassword({
      email: currentEmail,
      password,
    });
    if (pwErr || !granted.session) {
      if (pwErr?.status === 429) return json(req, { error: MSG.rateLimited }, 429);
      return json(req, { error: MSG.wrongPassword }, 401);
    }
    // Invariant: người trả mật khẩu phải CHÍNH admin đang gọi (token vs password grant).
    if (granted.session.user?.id !== caller.id) return json(req, { error: MSG.notAdmin }, 403);

    // ── Điều kiện 1 (nốt): OTP email hiện tại ──
    const { error: curErr } = await anon.auth.verifyOtp({
      email: currentEmail,
      token: current_token,
      type: "email",
    });
    if (curErr) return json(req, { error: MSG.otp }, 401);

    // ── Điều kiện 2: OTP email mới ──
    const { data: newOtp, error: newErr } = await anon.auth.verifyOtp({
      email: new_email,
      token: new_token,
      type: "email",
    });
    if (newErr || !newOtp?.user) return json(req, { error: MSG.otp }, 401);
    const targetId = newOtp.user.id;

    // User tạm (do request-new sinh) → xoá trước khi đổi email (tránh trùng unique).
    // Email đã thuộc user KHÁC có profiles → từ chối (emailTaken).
    if (targetId !== caller.id) {
      const { data: targetProfile, error: tpErr } = await admin
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();
      if (tpErr) throw new Error(`profiles(target): ${tpErr.message}`);
      if (targetProfile) return json(req, { error: MSG.emailTaken }, 409);
      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) {
        console.error("change-recovery-email: xoa user tam:", delErr.message);
        return json(req, { error: MSG.generic }, 500);
      }
    }

    // ── Ghi app_meta TRƯỚC (bảng của mình, service_role = gần như không lỗi),
    //    rồi đổi auth.users.email + mật khẩu; nếu bước auth lỗi → rollback.
    const { error: metaErr } = await admin
      .from("app_meta")
      .update({ admin_email: new_email })
      .eq("id", 1);
    if (metaErr) {
      console.error("change-recovery-email: app_meta:", metaErr.message);
      return json(req, { error: MSG.generic }, 500);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(caller.id, {
      email: new_email,
      email_confirm: true,
      password: new_password,
    });
    if (updErr) {
      console.error("change-recovery-email: updateUserById:", updErr.message);
      const { error: rbErr } = await admin
        .from("app_meta")
        .update({ admin_email: currentEmail })
        .eq("id", 1);
      if (rbErr) console.error("change-recovery-email: rollback admin_email:", rbErr.message);
      return json(req, { error: MSG.generic }, 500);
    }

    return json(req, { ok: true, message: MSG.done });
  } catch (e) {
    console.error("change-recovery-email: unhandled:", e);
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
    if (action === "request-current") return await handleRequestCurrent(req, admin, anon, body);
    if (action === "request-new") return await handleRequestNew(req, admin, anon, body);
    if (action === "complete") return await handleComplete(req, admin, anon, body);
    return json(req, { error: MSG.bad }, 400);
  } catch (e) {
    console.error("change-recovery-email: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
});
