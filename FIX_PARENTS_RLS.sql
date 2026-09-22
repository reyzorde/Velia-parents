-- Velia Parents RLS fix — run once in Supabase SQL Editor

DROP POLICY IF EXISTS students_access ON students;
CREATE POLICY students_access ON students FOR ALL TO authenticated
  USING (
    is_platform_admin()
    OR center_role(center_id) IN ('owner', 'administrator')
    OR (
      center_role(center_id) = 'teacher'
      AND id IN (
        SELECT gs.student_id FROM group_students gs
        JOIN groups g ON g.id = gs.group_id
        WHERE g.teacher_id = auth.uid()
      )
    )
    OR is_center_member(center_id)
    OR EXISTS (
      SELECT 1 FROM parent_links pl
      WHERE pl.student_id = students.id AND pl.parent_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_platform_admin()
    OR center_role(center_id) IN ('owner', 'administrator', 'teacher')
  );

DROP POLICY IF EXISTS students_parent_email_select ON students;
CREATE POLICY students_parent_email_select ON students FOR SELECT TO authenticated
  USING (
    email IS NOT NULL
    AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS parent_links_access ON parent_links;
CREATE POLICY parent_links_access ON parent_links FOR ALL TO authenticated
  USING (parent_user_id = auth.uid() OR is_platform_admin())
  WITH CHECK (parent_user_id = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS parent_links_center ON parent_links;
CREATE POLICY parent_links_center ON parent_links FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = parent_links.student_id AND is_center_member(s.center_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = parent_links.student_id
        AND center_role(s.center_id) IN ('owner', 'administrator')
    )
  );

DROP POLICY IF EXISTS attendance_access ON attendance;
CREATE POLICY attendance_access ON attendance FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id))
    OR EXISTS (
      SELECT 1 FROM parent_links pl
      WHERE pl.student_id = attendance.student_id AND pl.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS attendance_write ON attendance;
CREATE POLICY attendance_write ON attendance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM groups g WHERE g.id = attendance.group_id AND is_center_member(g.center_id)));

DROP POLICY IF EXISTS payments_access ON student_payments;
CREATE POLICY payments_access ON student_payments FOR SELECT TO authenticated
  USING (
    is_center_member(center_id) OR is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM parent_links pl
      WHERE pl.student_id = student_payments.student_id AND pl.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payments_write ON student_payments;
CREATE POLICY payments_write ON student_payments FOR ALL TO authenticated
  USING (is_center_member(center_id) OR is_platform_admin())
  WITH CHECK (is_center_member(center_id) OR is_platform_admin());

DROP POLICY IF EXISTS msg_access ON student_messages;
CREATE POLICY msg_access ON student_messages FOR SELECT TO authenticated
  USING (
    is_center_member(center_id)
    OR EXISTS (
      SELECT 1 FROM parent_links pl
      WHERE pl.student_id = student_messages.student_id AND pl.parent_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS msg_write ON student_messages;
CREATE POLICY msg_write ON student_messages FOR ALL TO authenticated
  USING (is_center_member(center_id)) WITH CHECK (is_center_member(center_id));

DROP POLICY IF EXISTS mock_att_access ON mock_attempts;
CREATE POLICY mock_att_access ON mock_attempts FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM students
      WHERE center_id IN (SELECT center_id FROM center_members WHERE user_id = auth.uid())
    )
    OR external_user_id = auth.uid()
    OR is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM parent_links pl
      WHERE pl.student_id = mock_attempts.student_id AND pl.parent_user_id = auth.uid()
    )
  );

INSERT INTO profiles (id, full_name, email)
SELECT u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
