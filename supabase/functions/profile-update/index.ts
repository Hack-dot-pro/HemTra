// P12-T9 — profile-update: ADMIN sửa hồ sơ của CHÍNH mình, MỌI thay đổi phải
// xác nhận bằng OTP gửi về email admin (quyết định user 2026-10-04 —
// state.json → decisions.p12_user_requests_2026_10_04).
//
// verify_jwt = false (config.toml) — EF tự xác thực access_token như các EF khác.
//
// action = "request-otp":
//   1) token hợp lệ → user, profiles.role = 'admin' (service_role đọc)
//   2) đọc app_meta.admin_email rồi gửi OTP 6 số (GoTrue signInWithOtp,
//      shouldCreateUser=false — cùng đường với EF admin-recovery)
//
// action = "apply":
//   1) token hợp lệ → admin
//   2) verifyOtp(email = app_meta.admin_email, token 6 số) → sai → 401
//   3) áp dụng từng trường có mặt trong body:
//        - display_name / username  → UPDATE profiles (username đã check trùng)
//        - password                 → auth.admin.updateUserById (bỏ cờ
//                                     must_change_password)
//        - avatar_data_url          → decode base64, upload bucket `avatars`
//                                     (upsert theo <uid>.<ext>, dọn ảnh cũ)
//
// Lưu ý: ĐỔI EMAIL KHÔI PHỤC không nằm ở đây — dùng EF change-recovery-email
// (OTP gửi về ĐÚNG email mới để chứng minh quyền sở hữu — design §4.4).
// service_role chỉ nằm trong file này (Deno.env, secrets do runtime cấp).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@3.23.8";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 500 * 1024; // 500KB trước khi base64 (~667KB chuỗi)

const ALLOWED_ORIGINS = [
  "https://hemtra.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const MSG = {
  bad: "Dữ liệu không hợp lệ",
  generic: "Lỗi máy chủ, thử lại sau",
  noSession: "Phiên đăng nhập không hợp lệ, đăng nhập lại",
  forbidden: "Chỉ admin mới được sửa hồ sơ này",
  otp: "Mã OTP không đúng hoặc đã hết hạn",
  rate: "Quá nhiều yêu cầu gửi OTP — thử lại sau ít phút.",
  usernameTaken: "Tên đăng nhập đã tồn tại",
  avatarBad: "Ảnh đại diện không hợp lệ (PNG/JPG/WEBP, tối đa 500KB)",
  empty: "Chưa có thay đổi nào",
  done: "Đã cập nhật hồ sơ",
} as const;

const USERNAME_RE = /^[a-z0-9._-]{2,30}$/;

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

const applySchema = z.object({
  token: z.string().regex(/^\d{6}$/),
  display_name: z.string().trim().min(1).max(50).optional(),
  username: z.string().trim().toLowerCase().regex(USERNAME_RE).optional(),
  password: z.string().min(6).max(256).optional(),
  avatar_data_url: z.string().min(1).max(900_000).optional(),
});

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

async function requireAdmin(
  admin: SupabaseClient,
  anon: SupabaseClient,
  req: Request,
): Promise<{ userId: string; email: string } | Response> {
  const token = bearerToken(req);
  if (!token) return json(req, { error: MSG.noSession }, 401);
  const { data, error } = await anon.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) return json(req, { error: MSG.noSession }, 401);

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileErr) {
    console.error("profile-update: profiles:", profileErr.message);
    return json(req, { error: MSG.generic }, 500);
  }
  if ((profile as { role: string } | null)?.role !== "admin") {
    return json(req, { error: MSG.forbidden }, 403);
  }
  return { userId: user.id, email: user.email };
}

async function getAdminEmail(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from("app_meta").select("admin_email").eq("id", 1).single();
  if (error) throw new Error(`app_meta read: ${error.message}`);
  const email = (data as { admin_email: string | null }).admin_email;
  return email ? email.trim().toLowerCase() : null;
}

async function handleRequestOtp(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
): Promise<Response> {
  const who = await requireAdmin(admin, anon, req);
  if (who instanceof Response) return who;
  try {
    const expected = await getAdminEmail(admin);
    if (!expected) return json(req, { error: MSG.generic }, 500);
    // Email đã tồn tại (admin) → signInWithOtp không tạo user mới.
    const { error } = await anon.auth.signInWithOtp({ email: expected });
    if (error) {
      console.error("profile-update: signInWithOtp:", error.message);
      // GoTrue chặn gửi trùng trong 60s/email → trả 429 rõ ràng thay vì 500 mơ hồ.
      if (error.code === "over_email_send_rate_limit") return json(req, { error: MSG.rate }, 429);
      return json(req, { error: MSG.generic }, 500);
    }
    return json(req, { ok: true, message: "Đã gửi mã OTP tới email admin." });
  } catch (e) {
    console.error("profile-update: request-otp:", e instanceof Error ? e.message : "unknown");
    return json(req, { error: MSG.generic }, 500);
  }
}

type AvatarUpload = { bytes: Uint8Array; ext: string; mime: string };

function parseAvatarDataUrl(value: string): AvatarUpload | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  if (binary.length > AVATAR_MAX_BYTES) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  return { bytes, ext, mime };
}

async function handleApply(
  req: Request,
  admin: SupabaseClient,
  anon: SupabaseClient,
  raw: unknown,
): Promise<Response> {
  const who = await requireAdmin(admin, anon, req);
  if (who instanceof Response) return who;

  const body = raw as Record<string, unknown>;
  const parsed = applySchema.safeParse({
    token: typeof body.token === "string" ? body.token.trim() : "",
    display_name: typeof body.display_name === "string" ? body.display_name : undefined,
    username: typeof body.username === "string" ? body.username : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    avatar_data_url: typeof body.avatar_data_url === "string" ? body.avatar_data_url : undefined,
  });
  if (!parsed.success) return json(req, { error: MSG.bad }, 400);
  const { token, display_name, username, password, avatar_data_url } = parsed.data;

  const hasChange =
    display_name !== undefined || username !== undefined || password !== undefined ||
    avatar_data_url !== undefined;
  if (!hasChange) return json(req, { error: MSG.empty }, 400);

  let avatar: AvatarUpload | null = null;
  if (avatar_data_url !== undefined) {
    avatar = parseAvatarDataUrl(avatar_data_url);
    if (!avatar) return json(req, { error: MSG.avatarBad }, 400);
  }

  try {
    // 1) Xác nhận OTP ở email admin — MỌI thay đổi đều phải qua bước này.
    const expected = await getAdminEmail(admin);
    if (!expected) return json(req, { error: MSG.generic }, 500);
    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      email: expected,
      token,
      type: "email",
    });
    if (verifyErr || !verified?.user) {
      console.error("profile-update: verifyOtp:", verifyErr?.message);
      return json(req, { error: MSG.otp }, 401);
    }

    // 2) Username trùng người khác → 409.
    if (username !== undefined) {
      const { data: taken } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", who.userId)
        .limit(1);
      if (taken && taken.length > 0) return json(req, { error: MSG.usernameTaken }, 409);
    }

    // 3) Avatar: upload trước (lỗi → chưa đụng profiles), dọn ảnh cũ cùng uid.
    let avatarPath: string | undefined;
    if (avatar) {
      const path = `${who.userId}.${avatar.ext}`;
      const { error: upErr } = await admin.storage
        .from(AVATAR_BUCKET)
        .upload(path, avatar.bytes, { contentType: avatar.mime, upsert: true });
      if (upErr) {
        console.error("profile-update: avatar upload:", upErr.message);
        return json(req, { error: MSG.avatarBad }, 400);
      }
      avatarPath = path;
      // Dọn ảnh cũ có đuôi khác (uid.png → uid.jpg thì file .png còn sót).
      const { data: oldOnes } = await admin.storage.from(AVATAR_BUCKET).list("", {
        search: `${who.userId}.`,
      });
      const stale = (oldOnes ?? [])
        .map((item) => item.name)
        .filter((name) => name !== path);
      if (stale.length > 0) await admin.storage.from(AVATAR_BUCKET).remove(stale);
    }

    // 4) UPDATE profiles.
    const patch: Record<string, unknown> = {};
    if (display_name !== undefined) patch.display_name = display_name;
    if (username !== undefined) patch.username = username;
    if (avatarPath !== undefined) patch.avatar_path = avatarPath;
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await admin
        .from("profiles")
        .update(patch)
        .eq("id", who.userId);
      if (updErr) {
        console.error("profile-update: profiles update:", updErr.message);
        return json(req, { error: MSG.generic }, 500);
      }
    }

    // 5) Mật khẩu (sau cùng — nếu các bước trên fail thì chưa đổi mật khẩu).
    if (password !== undefined) {
      const { error: pwdErr } = await admin.auth.admin.updateUserById(who.userId, {
        password,
      });
      if (pwdErr) {
        console.error("profile-update: updateUserById:", pwdErr.message);
        return json(req, { error: MSG.generic }, 500);
      }
      const { error: flagErr } = await admin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", who.userId);
      if (flagErr) console.error("profile-update: must_change_password:", flagErr.message);
    }

    const { data: fresh } = await admin
      .from("profiles")
      .select("username,display_name,avatar_path")
      .eq("id", who.userId)
      .single();

    console.log(
      "profile-update:",
      JSON.stringify({
        fields: Object.keys(patch).concat(password !== undefined ? ["password"] : []),
      }),
    );
    return json(req, { ok: true, message: MSG.done, profile: fresh ?? null });
  } catch (e) {
    console.error("profile-update: apply:", e instanceof Error ? e.message : "unknown");
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
    if (action === "request-otp") return await handleRequestOtp(req, admin, anon);
    if (action === "apply") return await handleApply(req, admin, anon, body);
    return json(req, { error: MSG.bad }, 400);
  } catch (e) {
    console.error("profile-update: unhandled:", e instanceof Error ? e.message : "unknown");
    return json(req, { error: MSG.generic }, 500);
  }
});
