import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ detail: 'Admin privileges required.' }, { status: 403 });
    }

    const { data: users, error } = await supabaseServer
      .from('users')
      .select('id, name, email, avatar_url, created_at, verification_status, alumni_profiles(*)')
      .eq('role', 'alumni')
      .eq('is_verified', false);

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const results = (users || []).map((u: any) => {
      const p = (Array.isArray(u.alumni_profiles) ? u.alumni_profiles[0] : u.alumni_profiles) || {};
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url,
        created_at: u.created_at,
        verification_status: u.verification_status || 'pending',
        alumni_profile: {
          alumni_id: p.alumni_id,
          department: p.department,
          degree: p.degree,
          graduation_year: p.graduation_year,
          company: p.company,
          designation: p.designation,
          linkedin: p.linkedin,
          github: p.github,
        },
      };
    });

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching pending alumni.' }, { status: 500 });
  }
}
