// P9-T2 — admin-users: Edge Function quản lý user
// (design.md §4.1, §4.3, §7.3 menu 5)
//
// Quyền theo ma trận §4.1:
// - create-user: cả admin & staff đều được tạo user mới (role: 'staff')
// - reset-password: chỉ admin; sinh mật khẩu tạm, đặt must_change_password = true; chặn tác động lên admin
// - set-password: chỉ admin; đặt mật khẩu trực tiếp, must_change_password = true; chặn tác động lên admin
// - delete-user: chỉ admin; xóa user trong auth + profiles (cascade); chặn xóa chính mình và xóa admin
// - P9-T4: Chặn mọi thao tác lên tài khoản admin từ non-admin (cả UI và server)

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
  noSession: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
  forbidden: "Bạn không có quyền thực hiện thao tác này",
  userNotFound: "Không tìm thấy người dùng",
  usernameTaken: "Tên đăng nhập đã tồn tại",
  cannotTargetAdmin: "Không thể thao tác lên tài khoản admin",
  cannotDeleteSelf: "Không thể tự xóa tài khoản của chính mình",
  staffCannotCreateAdmin: "Chỉ có thể tạo tài khoản nhân viên",
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

function makeClients(): { admin: SupabaseClient } {
  const url = env("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const serviceKey = secretKeys
    ? JSON.parse(secretKeys)["default"]
    : env("SUPABASE_SERVICE_ROLE_KEY");
  return {
    admin: createClient(url, serviceKey),
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token || null;
}

function generateTemporaryPassword(length = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

const createUserSchema = z.object({
  action: z.literal("create-user"),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{2,30}$/, "Tên đăng nhập từ 2-30 ký tự (chữ thường, số, ., _, -)"),
  display_name: z.string().trim().max(50).optional(),
  password: z.string().min(6).max(256).optional(),
  role: z.enum(["admin", "staff"]).optional().default("staff"),
});

const resetPasswordSchema = z.object({
  action: z.literal("reset-password"),
  user_id: z.string().uuid("user_id không hợp lệ"),
});

const setPasswordSchema = z.object({
  action: z.literal("set-password"),
  user_id: z.string().uuid("user_id không hợp lệ"),
  new_password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(256),
});

const deleteUserSchema = z.object({
  action: z.literal("delete-user"),
  user_id: z.string().uuid("user_id không hợp lệ"),
});

type Caller = {
  id: string;
  role: "admin" | "staff";
  username: string;
};

async function authenticateCaller(req: Request, admin: SupabaseClient): Promise<{ caller?: Caller; errorResponse?: Response }> {
  const token = bearerToken(req);
  if (!token) {
    return { errorResponse: json(req, { error: MSG.noSession }, 401) };
  }

  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { errorResponse: json(req, { error: MSG.noSession }, 401) };
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role, username")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return { errorResponse: json(req, { error: MSG.noSession }, 401) };
  }

  return {
    caller: {
      id: profile.id,
      role: profile.role as "admin" | "staff",
      username: profile.username,
    },
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: MSG.bad }, 400);
  }

  const { admin } = makeClients();
  const { caller, errorResponse } = await authenticateCaller(req, admin);
  if (errorResponse) return errorResponse;
  if (!caller) return json(req, { error: MSG.noSession }, 401);

  const action = (body as Record<string, unknown>)?.action;

  try {
    if (action === "create-user") {
      const parsed = createUserSchema.safeParse(body);
      if (!parsed.success) {
        return json(req, { error: parsed.error.issues[0]?.message ?? MSG.bad }, 400);
      }

      // Chỉ admin mới có thể tạo admin; staff chỉ được tạo staff (§4.1)
      if (parsed.data.role === "admin" && caller.role !== "admin") {
        return json(req, { error: MSG.staffCannotCreateAdmin }, 403);
      }

      const username = parsed.data.username;
      const displayName = parsed.data.display_name?.trim() || username;
      const initialPassword = parsed.data.password || generateTemporaryPassword(8);
      const isTemporary = !parsed.data.password;
      const targetRole = parsed.data.role || "staff";

      // Kiểm tra username trùng lặp
      const { data: dup } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (dup) {
        return json(req, { error: MSG.usernameTaken }, 409);
      }

      // Tạo user qua Supabase Auth Admin API
      const authEmail = `${username}@hem.local`;
      const { data: newUser, error: createAuthErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          username,
          display_name: displayName,
        },
      });

      if (createAuthErr || !newUser?.user) {
        console.error("admin-users: createUser auth error:", createAuthErr);
        if (createAuthErr?.message?.toLowerCase().includes("already registered")) {
          return json(req, { error: MSG.usernameTaken }, 409);
        }
        return json(req, { error: MSG.generic }, 500);
      }

      const uid = newUser.user.id;

      // Chèn profile vào bảng profiles
      const { error: insProfileErr } = await admin.from("profiles").insert({
        id: uid,
        username,
        display_name: displayName,
        role: targetRole,
        must_change_password: isTemporary,
        created_by: caller.id,
      });

      if (insProfileErr) {
        console.error("admin-users: insert profile error:", insProfileErr);
        // Rollback xóa auth user nếu chèn profile thất bại
        await admin.auth.admin.deleteUser(uid);
        if (insProfileErr.code === "23505") {
          return json(req, { error: MSG.usernameTaken }, 409);
        }
        return json(req, { error: MSG.generic }, 500);
      }

      return json(req, {
        ok: true,
        user: {
          id: uid,
          username,
          display_name: displayName,
          role: targetRole,
          must_change_password: isTemporary,
          created_by: caller.id,
        },
        temporary_password: isTemporary ? initialPassword : null,
      });
    }

    if (action === "reset-password") {
      // Chỉ admin mới có quyền cấp lại mật khẩu người khác (§4.1)
      if (caller.role !== "admin") {
        return json(req, { error: MSG.forbidden }, 403);
      }

      const parsed = resetPasswordSchema.safeParse(body);
      if (!parsed.success) {
        return json(req, { error: parsed.error.issues[0]?.message ?? MSG.bad }, 400);
      }

      const targetId = parsed.data.user_id;

      // Kiểm tra đối tượng mục tiêu
      const { data: targetProfile, error: targetErr } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", targetId)
        .maybeSingle();

      if (targetErr || !targetProfile) {
        return json(req, { error: MSG.userNotFound }, 404);
      }

      // P9-T4: Chặn mọi thao tác lên tài khoản admin
      if (targetProfile.role === "admin") {
        return json(req, { error: MSG.cannotTargetAdmin }, 403);
      }

      const temporaryPassword = generateTemporaryPassword(8);

      const { error: updAuthErr } = await admin.auth.admin.updateUserById(targetId, {
        password: temporaryPassword,
      });

      if (updAuthErr) {
        console.error("admin-users: reset-password updateAuth error:", updAuthErr);
        return json(req, { error: MSG.generic }, 500);
      }

      const { error: updProfileErr } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId);

      if (updProfileErr) {
        console.error("admin-users: reset-password updateProfile error:", updProfileErr);
      }

      return json(req, {
        ok: true,
        temporary_password: temporaryPassword,
      });
    }

    if (action === "set-password") {
      // Chỉ admin mới có quyền đặt mật khẩu cho người khác (§4.1)
      if (caller.role !== "admin") {
        return json(req, { error: MSG.forbidden }, 403);
      }

      const parsed = setPasswordSchema.safeParse(body);
      if (!parsed.success) {
        return json(req, { error: parsed.error.issues[0]?.message ?? MSG.bad }, 400);
      }

      const targetId = parsed.data.user_id;
      const newPassword = parsed.data.new_password;

      const { data: targetProfile, error: targetErr } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", targetId)
        .maybeSingle();

      if (targetErr || !targetProfile) {
        return json(req, { error: MSG.userNotFound }, 404);
      }

      // P9-T4: Chặn mọi thao tác lên tài khoản admin
      if (targetProfile.role === "admin") {
        return json(req, { error: MSG.cannotTargetAdmin }, 403);
      }

      const { error: updAuthErr } = await admin.auth.admin.updateUserById(targetId, {
        password: newPassword,
      });

      if (updAuthErr) {
        console.error("admin-users: set-password updateAuth error:", updAuthErr);
        return json(req, { error: MSG.generic }, 500);
      }

      await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId);

      return json(req, { ok: true });
    }

    if (action === "delete-user") {
      // Chỉ admin mới có quyền xóa user (§4.1)
      if (caller.role !== "admin") {
        return json(req, { error: MSG.forbidden }, 403);
      }

      const parsed = deleteUserSchema.safeParse(body);
      if (!parsed.success) {
        return json(req, { error: parsed.error.issues[0]?.message ?? MSG.bad }, 400);
      }

      const targetId = parsed.data.user_id;

      // Chặn tự xóa chính mình
      if (targetId === caller.id) {
        return json(req, { error: MSG.cannotDeleteSelf }, 400);
      }

      const { data: targetProfile, error: targetErr } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", targetId)
        .maybeSingle();

      if (targetErr || !targetProfile) {
        return json(req, { error: MSG.userNotFound }, 404);
      }

      // P9-T4: Chặn mọi thao tác lên tài khoản admin
      if (targetProfile.role === "admin") {
        return json(req, { error: MSG.cannotTargetAdmin }, 403);
      }

      const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetId);
      if (delAuthErr) {
        console.error("admin-users: deleteUser error:", delAuthErr);
        return json(req, { error: MSG.generic }, 500);
      }

      // Profile sẽ tự xóa do ON DELETE CASCADE, nhưng đảm bảo xóa sạch
      await admin.from("profiles").delete().eq("id", targetId);

      return json(req, { ok: true });
    }

    return json(req, { error: `Hành động không được hỗ trợ: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users: unhandled error:", err);
    return json(req, { error: MSG.generic }, 500);
  }
}

Deno.serve(handler);
