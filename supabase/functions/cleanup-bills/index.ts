// P7-T3 — cleanup-bills: dọn bill quá 15 ngày (design §6.1, §7.4 tag
// "tự xóa sau N ngày", backend/skill §Storage).
//
// verify_jwt = false (config.toml) — pg_cron gọi bằng net.http_post nên không
// có user JWT. Bảo vệ bằng secret CRON_SECRET ở header Authorization (so sánh
// không rò rỉ theo timing; thiếu CRON_SECRET ở env = fail-closed 401).
//
// Thứ tự BẮT BUỘC (design §150): xóa file Storage qua Storage API TRƯỚC, xóa
// dòng bills/bill_items SAU. Xóa file lỗi → giữ nguyên dòng để lần chạy sau
// thử lại (idempotent: file đã mất thì remove vẫn không lỗi). KHÔNG đụng
// stats_* — trigger INSERT đã ghi báo cáo, bill xong nghĩa vụ (AGENT.md §11.4).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

const BILL_BUCKET = "bills";

/** Số bill tối đa mỗi lần gọi — job chạy hằng ngày; sót lại thì lần sau xử lý. */
const BATCH_LIMIT = 200;

const MSG = {
  method: "Chỉ chấp nhận POST.",
  unauthorized: "Không có quyền gọi hàm này.",
  generic: "Lỗi máy chủ, thử lại sau.",
} as const;

type ExpiredBill = { id: string; image_path: string };

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173") {
    headers["Access-Control-Allow-Origin"] = origin;
  }
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
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** So sánh chuỗi theo thời gian cố định — không lộ secret qua timing. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return false; // fail-closed: chưa cấu hình secret thì không ai gọi được
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(token, secret);
}

export type CleanupSummary = {
  /** Số bill quá hạn đã đọc trong lần gọi này. */
  scanned: number
  /** Số file PNG gửi đi xóa (bucket `bills`). */
  filesRemoved: number
  /** Số dòng bills đã xóa (bill_items theo cascade). */
  rowsDeleted: number
  /** true = chạm BATCH_LIMIT, lần gọi sau xử lý tiếp. */
  hasMore: boolean
};

async function cleanupExpiredBills(client: SupabaseClient): Promise<CleanupSummary> {
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("bills")
    .select("id,image_path")
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(`bills_select_failed: ${error.message}`);

  const bills = (data ?? []) as ExpiredBill[];
  if (bills.length === 0) {
    return { scanned: 0, filesRemoved: 0, rowsDeleted: 0, hasMore: false };
  }

  // 1) File trước — lỗi ở đây thì KHÔNG xóa dòng, lần sau thử lại.
  const paths = bills.map((bill) => bill.image_path).filter((path) => path !== "");
  if (paths.length > 0) {
    const { error: removeError } = await client.storage.from(BILL_BUCKET).remove(paths);
    if (removeError) throw new Error(`storage_remove_failed: ${removeError.message}`);
  }

  // 2) Dòng DB sau — bill_items cascade (on delete cascade theo bill_id).
  //    service_role bypass RLS; chỉ đụng bảng bills, tuyệt đối không đụng stats_*.
  const { error: deleteError, count } = await client
    .from("bills")
    .delete({ count: "exact" })
    .in("id", bills.map((bill) => bill.id));
  if (deleteError) throw new Error(`bills_delete_failed: ${deleteError.message}`);

  return {
    scanned: bills.length,
    filesRemoved: paths.length,
    rowsDeleted: count ?? bills.length,
    hasMore: bills.length === BATCH_LIMIT,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: MSG.method }, 405);
  if (!isAuthorized(req)) return json(req, { error: MSG.unauthorized }, 401);

  try {
    const summary = await cleanupExpiredBills(makeClient());
    console.log("cleanup-bills:", JSON.stringify(summary));
    return json(req, summary, 200);
  } catch (error) {
    // Chỉ ghi thông điệp lỗi (không có path/id bill) — security/skill §không log nhạy cảm.
    console.error("cleanup-bills:", error instanceof Error ? error.message : "unknown");
    return json(req, { error: MSG.generic }, 500);
  }
});
