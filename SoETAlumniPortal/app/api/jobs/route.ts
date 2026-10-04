import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const department = searchParams.get('department');
    const search = searchParams.get('search');

    let query = supabaseServer
      .from('jobs')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (type && type !== 'all') {
      query = query.eq('type', type);
    }
    if (department && department !== 'All') {
      query = query.eq('department', department);
    }

    const { data: jobs, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    let results = jobs || [];
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (j: any) =>
          (j.title || '').toLowerCase().includes(q) ||
          (j.company || '').toLowerCase().includes(q) ||
          (j.description || '').toLowerCase().includes(q)
      );
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching jobs.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'alumni' && user.role !== 'admin')) {
      return NextResponse.json({ detail: 'Only alumni or admins can post jobs.' }, { status: 403 });
    }

    const body = await req.json();
    const { data: job, error } = await supabaseServer
      .from('jobs')
      .insert({
        posted_by: user.id,
        title: body.title,
        company: body.company,
        location: body.location,
        type: body.type || 'Full-time',
        workplace_type: body.workplace_type || 'On-site',
        description: body.description,
        requirements: body.requirements || [],
        skills_required: body.skills_required || body.skills || [],
        experience_level: body.experience_level || 'Entry',
        salary_range: body.salary_range || null,
        department: body.department || null,
        application_deadline: body.application_deadline || null,
        status: user.role === 'admin' ? 'active' : 'active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(job, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error creating job.' }, { status: 500 });
  }
}
