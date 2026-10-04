/** Retired unsafe file publisher. Approval is handled by authenticated forms APIs. */
export async function POST(): Promise<Response> {
  return Response.json({ success: false, error: { code: 'LEGACY_PUBLISH_RETIRED',
    message_vi: 'Endpoint xuất bản file đã ngừng dùng. Lưu bản nháp và phê duyệt qua /api/admin/forms/[formCode]/workflow và /approve với khóa quản trị.' } },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
