import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Thiếu cấu hình Supabase')
  process.exit(1)
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  console.log('=== BẮT ĐẦU CHẠY KIỂM THỬ KỊCH BẢN TẤN CÔNG BẢO MẬT P10 ===\n')
  let passed = 0
  let failed = 0

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`)
      passed++
    } else {
      console.error(`[FAIL] ${message}`)
      failed++
    }
  }

  // Tạo tài khoản staff tạm thời để thử nghiệm tấn công
  const staffUsername = `staff_atk_${Date.now()}`
  const staffEmail = `${staffUsername}@hem.local`
  const staffPass = 'TempPass!123456'

  const { data: staffUser, error: staffErr } = await adminClient.auth.admin.createUser({
    email: staffEmail,
    password: staffPass,
    email_confirm: true,
  })
  if (staffErr) {
    console.error('Lỗi tạo staff test:', staffErr)
    process.exit(1)
  }

  await adminClient.from('profiles').insert({
    id: staffUser.user.id,
    username: staffUsername,
    display_name: 'Attacker Staff',
    role: 'staff',
    must_change_password: false,
  })

  // Đăng nhập bằng staff
  const staffSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: staffSession, error: loginErr } = await staffSupabase.auth.signInWithPassword({
    email: staffEmail,
    password: staffPass,
  })
  if (loginErr || !staffSession.session) {
    console.error('Staff login error:', loginErr)
    process.exit(1)
  }

  const staffToken = staffSession.session.access_token

  try {
    // -------------------------------------------------------------
    // Kịch bản 1: [SEC-005] Staff cố tình DELETE nhóm sản phẩm (categories)
    // -------------------------------------------------------------
    console.log('--- Kịch bản 1: Tấn công DELETE categories ---')
    // Thử xóa danh mục bất kỳ qua REST
    const catDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/categories?id=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${staffToken}`,
      },
    })
    const catDeleteJson = await catDeleteRes.json().catch(() => ({}))
    assert(
      catDeleteRes.status === 401 || catDeleteRes.status === 403 || catDeleteJson.code === '42501' || (catDeleteRes.status === 400 && String(catDeleteJson.message).includes('permission denied')),
      `Staff DELETE categories bị chặn ở DB/REST (Status: ${catDeleteRes.status}, Code: ${catDeleteJson.code}, Msg: ${catDeleteJson.message})`
    )

    // -------------------------------------------------------------
    // Kịch bản 2: [IDOR] Staff cố tình DELETE hoặc UPDATE bảng bills
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 2: IDOR / Sửa đổi trái phép bảng bills ---')
    const billDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/bills?id=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${staffToken}`,
      },
    })
    const billDeleteJson = await billDeleteRes.json().catch(() => ({}))
    assert(
      billDeleteRes.status === 401 || billDeleteRes.status === 403 || billDeleteJson.code === '42501' || (billDeleteRes.status === 400 && String(billDeleteJson.message).includes('permission denied')),
      `Staff DELETE bills bị chặn (Status: ${billDeleteRes.status}, Code: ${billDeleteJson.code}, Msg: ${billDeleteJson.message})`
    )

    const billUpdateRes = await fetch(`${SUPABASE_URL}/rest/v1/bills?id=not.is.null`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ total: 0 }),
    })
    const billUpdateJson = await billUpdateRes.json().catch(() => ({}))
    assert(
      billUpdateRes.status === 401 || billUpdateRes.status === 403 || billUpdateJson.code === '42501' || (billUpdateRes.status === 400 && String(billUpdateJson.message).includes('permission denied')),
      `Staff UPDATE bills bị chặn (Status: ${billUpdateRes.status}, Code: ${billUpdateJson.code}, Msg: ${billUpdateJson.message})`
    )

    // -------------------------------------------------------------
    // Kịch bản 3: [Leo thang đặc quyền] Staff cố tình nâng role lên 'admin'
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 3: Nâng quyền staff -> admin ---')
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${staffUser.user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${staffToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'admin' }),
    })
    // Phải bị từ chối hoặc không có dòng nào bị cập nhật
    const { data: checkRole } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', staffUser.user.id)
      .single()
    assert(
      checkRole?.role === 'staff',
      `Staff không thể nâng quyền lên admin qua REST (role hiện tại vẫn là: ${checkRole?.role})`
    )

    // -------------------------------------------------------------
    // Kịch bản 4: [Giả mạo / Sửa JWT] Gọi API bằng JWT bị sửa đổi chữ ký
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 4: Giả mạo / sửa đổi chữ ký JWT ---')
    const tamperedToken = staffToken.slice(0, -6) + 'xxxxxx'
    const tamperedRes = await fetch(`${SUPABASE_URL}/rest/v1/bills?select=id`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${tamperedToken}`,
      },
    })
    assert(
      tamperedRes.status === 401,
      `JWT bị sửa đổi chữ ký bị từ chối 401 Unauthorized (kết quả: ${tamperedRes.status})`
    )

    // -------------------------------------------------------------
    // Kịch bản 5: [SEC-006] Chiếm đoạt đường dẫn Storage của mã bill chưa phát sinh
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 5: [SEC-006] Upload PNG vào mã bill chưa phát sinh ---')
    const fakePath = '2026/10/HT-261004-9999.png'
    const fakePngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const { error: uploadErr } = await staffSupabase.storage
      .from('bills')
      .upload(fakePath, fakePngBytes, { contentType: 'image/png' })

    assert(
      Boolean(uploadErr),
      `Upload PNG mã bill chưa tồn tại bị RLS Storage chặn thành công (Lỗi: ${uploadErr?.message})`
    )

    // -------------------------------------------------------------
    // Kịch bản 6: [SEC-009/SEC-010] set_bill_image từ chối người không phải chủ bill
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 6: [SEC-009/SEC-010] set_bill_image kiểm tra tác giả ---')
    // Thử gọi rpc set_bill_image với mã bill của người khác hoặc không tồn tại
    const { error: linkErr } = await staffSupabase.rpc('set_bill_image', {
      p_code: 'HT-261004-0001',
      p_path: '2026/10/HT-261004-0001.png',
    })
    // HT-261004-0001 không phải do staff_atk tạo -> phải bị lỗi
    assert(
      Boolean(linkErr),
      `set_bill_image chặn staff không phải chủ bill thành công (Lỗi: ${linkErr?.message})`
    )

    // -------------------------------------------------------------
    // Kịch bản 7: [SEC-008] Rate limit create_bill cho offline và online
    // -------------------------------------------------------------
    console.log('\n--- Kịch bản 7: [SEC-008] Rate limit create_bill ---')
    const { data: realProduct } = await adminClient
      .from('products')
      .select('id, price')
      .eq('is_active', true)
      .limit(1)
      .single()

    const { data: appMeta } = await adminClient
      .from('app_meta')
      .select('menu_version')
      .eq('id', 1)
      .single()

    let rateLimitedHit = false
    let lastErr = null
    for (let i = 0; i < 15; i++) {
      const { error: rpcErr } = await staffSupabase.rpc('create_bill', {
        p_client_uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        p_items: [{ product_id: realProduct.id, qty: 1 }],
        p_menu_version: appMeta.menu_version,
        p_is_offline: false,
        p_phone_note: 'test rate limit',
      })
      if (rpcErr) {
        lastErr = rpcErr.message
        if (rpcErr.message.includes('rate_limited')) {
          rateLimitedHit = true
          break
        }
      }
    }
    assert(
      rateLimitedHit,
      `create_bill chạm rate_limited khi tạo quá 10 bill online/phút (Lỗi cuối: ${lastErr})`
    )

  } finally {
    // Dọn dẹp tài khoản test
    await adminClient.from('bills').delete().eq('created_by', staffUser.user.id)
    await adminClient.from('profiles').delete().eq('id', staffUser.user.id)
    await adminClient.auth.admin.deleteUser(staffUser.user.id)
    console.log('\nĐã dọn dẹp sạch sẽ tài khoản staff test.')
  }

  console.log(`\n=== TỔNG KẾT: ${passed} PASS, ${failed} FAIL ===`)
  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('Lỗi thực thi kiểm thử bảo mật:', err)
  process.exit(1)
})
