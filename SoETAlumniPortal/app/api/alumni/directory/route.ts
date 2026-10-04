import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');
    const search = searchParams.get('search');

    let query = supabaseServer
      .from('users')
      .select('id, name, email, avatar_url, is_verified, verification_status, alumni_profiles(*)')
      .eq('role', 'alumni')
      .eq('is_verified', true);

    const { data: users, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    let results = (users || []).map((u: any) => {
      const p = (Array.isArray(u.alumni_profiles) ? u.alumni_profiles[0] : u.alumni_profiles) || {};
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url,
        is_verified: u.is_verified,
        role: 'alumni',
        alumni_profile: {
          alumni_id: p.alumni_id,
          department: p.department,
          degree: p.degree,
          graduation_year: p.graduation_year,
          company: p.company,
          designation: p.designation,
          industry: p.industry,
          location: p.location,
          skills: p.skills || [],
          linkedin: p.linkedin,
          github: p.github,
          website: p.website,
          bio: p.bio,
        },
      };
    });

    if (department && department !== 'All') {
      results = results.filter((r) => r.alumni_profile.department === department);
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.alumni_profile.company || '').toLowerCase().includes(q) ||
          (r.alumni_profile.designation || '').toLowerCase().includes(q)
      );
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error fetching alumni directory.' },
      { status: 500 }
    );
  }
}
