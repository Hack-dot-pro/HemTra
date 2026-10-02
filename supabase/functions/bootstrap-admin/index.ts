// P3-T2 — bootstrap-admin: luồng bootstrap admin dau tien (design §4.2).
//
// verify_jwt = false (chua co phien) — bao ve bang 4 lop:
//   1) co bootstrapped (chay 1 lan / moi moi truong)
//   2) email phai trung secret BOOTSTRAP_ADMIN_EMAIL
//   3) OTP 6 so xac minh SERVER-SIDE (khong tra session/OTP ve client)
//   4) rate limit OTP cua GoTrue (60s/email, 30/h)
//
// Service_role va MGMT_ACCESS_TOKEN chi nam trong file nay, doc qua Deno.env
// (bi set qua `supabase secrets set` — xem plan.md P3-T2).

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
  done: "Hệ thống đã được thiết lập",
  forbidden: "Không thể xử lý yêu cầu",
  otp: "Mã OTP không đúng hoặc đã hết hạn",
  usernameTaken: "Tên đăng nhập đã tồn tại",
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
    anon: createClient(url, publishableKey),
  };
}

function normalize(v: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["email", "token", "username", "password"]) {
    const raw = v[key];
    if (typeof raw === "string") out[key] = key === "password" ? raw : raw.trim().toLowerCase();
  }
  return out;
}

const requestOtpSchema = z.object({ email: z.string().email().max(254) });
const completeSchema = z.object({
  email: z.string().email().max(254),
  token: z.string().regex(/^\d{6}$/),
  username: z.string().regex(/^[a-z0-9._-]{2,30}$/),
  password: z.string().min(1).max(256),
});

async function getBootstrapped(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("app_meta").select("bootstrapped").eq("id", 1).single();
  if (error || !data) throw new Error(`app_meta read: ${error?.message}`);
  return data.bootstrapped === true;
}

// Dat signup cong khai = true sau khi bootstrap (design §4.2.5) qua Management API.
// Fail = complete that bai truoc buoc ghi co → retry duoc (chua bootstrapped).
async function disablePublicSignup(): Promise<boolean> {
  const token = Deno.env.get("MGMT_ACCESS_TOKEN");
  // Ten bat buoc khong duoc tien to SUPABASE_ (reserved prefix cua runtime).
  const projectRef = Deno.env.get("HEMTRA_PROJECT_REF");
  if (!token || !projectRef) {
    console.error("bootstrap-admin: missing MGMT_ACCESS_TOKEN/HEMTRA_PROJECT_REF");
    return false;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ disable_signup: true }),
  });
  if (!res.ok) {
    console.error("bootstrap-admin: PATCH auth config failed:", res.status, await res.text());
    return false;
  }
  return true;
}

// Tra ve {ok:true} MOI TRUONG cho email hop le — khong cho phep do ra email nao
// khop secret (email dung gui OTP that, email sai khong gui gi).
async function handleRequestOtp(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = requestOtpSchema.safeParse(normalize((raw ?? {}) as Record<string, unknown>));
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);

  try {
    if (await getBootstrapped(admin)) return json(req, { error: MSG.done }, 409);

    const expected = Deno.env.get("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
    if (!expected) {
      console.error("bootstrap-admin: BOOTSTRAP_ADMIN_EMAIL not set");
      return json(req, { error: MSG.generic }, 500);
    }
    if (parsed.data.email === expected) {
      const { error } = await anon.auth.signInWithOtp({ email: parsed.data.email, shouldCreateUser: true });
      if (error) console.error("bootstrap-admin: signInWithOtp:", error.message);
    }
  } catch (e) {
    console.error("bootstrap-admin: request-otp:", e);
    return json(req, { error: MSG.generic }, 500);
  }
  return json(req, { ok: true });
}

async function handleComplete(req: Request, admin: SupabaseClient, anon: SupabaseClient, raw: unknown): Promise<Response> {
  const parsed = completeSchema.safeParse(normalize((raw ?? {}) as Record<string, unknown>));
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { email, token, username, password } = parsed.data;

  try {
    if (await getBootstrapped(admin)) return json(req, { error: MSG.done }, 409);

    // Xac minh OTP server-side; khong tra session cho client (client dang nhap bang
    // username + mat khau sau do — design §4.2/§4.3).
    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (verifyErr || !verified?.user) {
      console.error("bootstrap-admin: verifyOtp:", verifyErr?.message);
      return json(req, { error: MSG.otp }, 401);
    }
    const uid = verified.user.id;

    // Chac chan email = email admin (dat SAU verify → khong tao oracle cho
    // nguoi khong co OTP).
    const expected = env("BOOTSTRAP_ADMIN_EMAIL").trim().toLowerCase();
    if (email !== expected) return json(req, { error: MSG.forbidden }, 403);

    const { data: dup } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (dup && dup.id !== uid) return json(req, { error: MSG.usernameTaken }, 409);

    const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("bootstrap-admin: updateUserById:", updErr.message);
      return json(req, { error: MSG.generic }, 500);
    }

    if (!(await disablePublicSignup())) return json(req, { error: MSG.generic }, 500);

    if (!dup) {
      const { error: insErr } = await admin.from("profiles").insert({
        id: uid,
        username,
        display_name: username,
        role: "admin",
      });
      if (insErr) {
        console.error("bootstrap-admin: insert profile:", insErr.message);
        if (insErr.code === "23505") return json(req, { error: MSG.usernameTaken }, 409);
        return json(req, { error: MSG.generic }, 500);
      }
    }

    // Ghi co cuoi cung — guard bootstrapped=false de phong race.
    const { data: updated, error: flagErr } = await admin
      .from("app_meta")
      .update({ bootstrapped: true, admin_email: email })
      .eq("id", 1)
      .eq("bootstrapped", false)
      .select("id");
    if (flagErr) {
      console.error("bootstrap-admin: app_meta update:", flagErr.message);
      return json(req, { error: MSG.generic }, 500);
    }
    if (!updated || updated.length === 0) return json(req, { error: MSG.done }, 409);

    return json(req, { ok: true });
  } catch (e) {
    console.error("bootstrap-admin: complete:", e);
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
    if (action === "complete") return await handleComplete(req, admin, anon, body);
    return json(req, { error: MSG.bad }, 400);
  } catch (e) {
    console.error("bootstrap-admin: unhandled:", e);
    return json(req, { error: MSG.generic }, 500);
  }
});
