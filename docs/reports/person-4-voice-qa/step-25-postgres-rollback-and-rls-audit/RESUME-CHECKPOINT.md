# Checkpoint DB đa trang — 09/10/2026

- Root `D:\Users\BT\N3_K1\AFL\AFL-Platform`; nhánh `codex/form-recognition-and-multiline`. Step-14 đến step-25 chưa commit/push. Không reset/clean/stash, không dùng Dely theo yêu cầu trước của người dùng.
- Đọc `MULTIPAGE-DB-ROLLBACK-AND-RLS-AUDIT.md`. Test opt-in ở `tests/integration/multipage-db-rollback.test.ts`, lệnh `$env:AFL_TEST_DB_ROLLBACK='1'; npm run test:recognition:db-rollback`.
- Postgres thật: saveDraft → getReview → saveReview → approve âm tính khi thiếu ảnh trang 2 → approve thành công → public read, tất cả trong transaction rollback. 1/1 PASS; sau rollback không còn form thử. Không gọi cloud hoặc dùng PII.
- Metadata DB: 7 bảng form `public` RLS=false, policy=0, `anon`/`authenticated` không có CRUD grants; cả `DATABASE_URL` và `DIRECT_URL` có `BYPASSRLS=true`. Chưa kiểm tra dashboard Data API, view/function và các vai trò khác. Tech Lead cần chốt cả quyền tài khoản ứng dụng lẫn RLS trên staging trước khi mở quyền trực tiếp.
- Còn lại: staging commit + HTTP API thật, browser citizen/Voice dùng workflow DB ACTIVE, shared asset storage/orphan cleanup, benchmark độc lập và PDF nhiều trang nếu cần. Không coi rollback là nghiệm thu production.
