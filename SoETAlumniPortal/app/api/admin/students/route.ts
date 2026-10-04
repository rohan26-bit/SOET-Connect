import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ detail: 'Admin privileges required.' }, { status: 403 });
    }

    const { data: students, error } = await supabaseServer
      .from('users')
      .select('id, name, email, avatar_url, is_active, created_at, student_profiles(*)')
      .eq('role', 'student');

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const results = (students || []).map((s: any) => {
      const p = (Array.isArray(s.student_profiles) ? s.student_profiles[0] : s.student_profiles) || {};
      return {
        id: s.id,
        _id: s.id,
        name: s.name,
        email: s.email,
        avatar_url: s.avatar_url,
        is_active: s.is_active ?? true,
        created_at: s.created_at,
        student_profile: {
          student_id: p.student_id,
          department: p.department,
          course: p.course,
          academic_year: p.academic_year,
          graduation_year: p.graduation_year,
          phone: p.phone,
        },
      };
    });

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching students.' }, { status: 500 });
  }
}
