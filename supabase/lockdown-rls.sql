-- SiamPOS Pro (version beta 0.3.6): ปิดการเข้าถึงฐานข้อมูลแบบสาธารณะ
-- รันใน Supabase SQL Editor หลังจากรัน supabase/schema.sql (ส่วน A ของ beta 0.3.6) แล้ว
-- =================================================================================
-- beta 0.3.6 (ส่วน B): ปิดการเข้าถึงแบบสาธารณะ ต้องล็อกอินบัญชีร้านก่อนจึงอ่าน/เขียนข้อมูลได้
-- !! ทำตามลำดับเท่านั้น ไม่งั้นแอปจะเข้าถึงข้อมูลไม่ได้ !!
--   1) Supabase > Authentication > Users > Add user สร้างบัญชีร้าน (อีเมล + รหัสผ่าน)
--   2) Supabase > Authentication > Sign In / Providers ปิด "Allow new users to sign up"
--      (ถ้าไม่ปิด ใครก็สมัครบัญชีเองผ่าน key ที่อยู่ในเว็บ แล้วเข้าถึงข้อมูลได้)
--   3) Deploy แอป beta 0.3.6 ขึ้นไป แล้วล็อกอินบัญชีร้านในทุกเครื่อง
--   4) รันส่วนนี้
-- ตารางที่เพิ่มหลังจากนี้ ให้สร้าง policy แบบ TO authenticated (ไม่ใช้ USING (true) แบบสาธารณะ)
-- =================================================================================
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public access to ' || t.tablename, t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated access to ' || t.tablename, t.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'Authenticated access to ' || t.tablename, t.tablename
    );
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION create_order(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION void_order(UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION siampos_apply_lot_deltas(JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION siampos_insert_ledger(JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_order(JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION void_order(UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION siampos_apply_lot_deltas(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION siampos_insert_ledger(JSONB, JSONB, TEXT) TO authenticated;
