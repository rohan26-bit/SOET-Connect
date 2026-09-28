-- ==============================================================================
-- SOET ALUMNI PORTAL - AUTO PROFILE CREATION TRIGGER
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. Create the trigger function (runs as SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role_val public.user_role;
  user_full_name TEXT;
  user_dept TEXT;
BEGIN
  -- Determine role safely
  IF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    user_role_val := 'admin'::public.user_role;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'alumni' THEN
    user_role_val := 'alumni'::public.user_role;
  ELSE
    user_role_val := 'student'::public.user_role;
  END IF;

  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
  user_dept := COALESCE(NEW.raw_user_meta_data->>'department', 'Computer Engineering');

  -- Upsert base profile
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    user_role_val,
    user_full_name
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;

  -- If role is student, create/update student_profiles entry
  IF user_role_val = 'student'::public.user_role THEN
    INSERT INTO public.student_profiles (
      id,
      student_id,
      department,
      course,
      academic_year,
      graduation_year,
      phone
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'student_id',
      user_dept,
      NEW.raw_user_meta_data->>'course',
      NEW.raw_user_meta_data->>'academic_year',
      NEW.raw_user_meta_data->>'graduation_year',
      NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      department = EXCLUDED.department,
      student_id = COALESCE(EXCLUDED.student_id, student_profiles.student_id),
      course = COALESCE(EXCLUDED.course, student_profiles.course),
      academic_year = COALESCE(EXCLUDED.academic_year, student_profiles.academic_year),
      graduation_year = COALESCE(EXCLUDED.graduation_year, student_profiles.graduation_year),
      phone = COALESCE(EXCLUDED.phone, student_profiles.phone);
  END IF;

  -- If role is alumni, create/update alumni_profiles entry
  IF user_role_val = 'alumni'::public.user_role THEN
    INSERT INTO public.alumni_profiles (
      id,
      alumni_id,
      department,
      degree,
      graduation_year,
      company,
      designation,
      industry,
      location,
      bio,
      verification_status
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'alumni_id',
      user_dept,
      NEW.raw_user_meta_data->>'degree',
      COALESCE(NEW.raw_user_meta_data->>'graduation_year', '2024'),
      NEW.raw_user_meta_data->>'company',
      NEW.raw_user_meta_data->>'designation',
      NEW.raw_user_meta_data->>'industry',
      NEW.raw_user_meta_data->>'location',
      NEW.raw_user_meta_data->>'bio',
      'pending'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      department = EXCLUDED.department,
      graduation_year = EXCLUDED.graduation_year,
      company = COALESCE(EXCLUDED.company, alumni_profiles.company),
      designation = COALESCE(EXCLUDED.designation, alumni_profiles.designation),
      industry = COALESCE(EXCLUDED.industry, alumni_profiles.industry),
      location = COALESCE(EXCLUDED.location, alumni_profiles.location),
      bio = COALESCE(EXCLUDED.bio, alumni_profiles.bio);
  END IF;

  -- Auto-confirm email so users can sign in immediately
  UPDATE auth.users 
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Confirm all existing unconfirmed users
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

