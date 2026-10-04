import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const { data: announcements, error } = await supabaseServer
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(announcements || []);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching announcements.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ detail: 'Admin privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const { data: announcement, error } = await supabaseServer
      .from('announcements')
      .insert({
        created_by: user.id,
        title: body.title,
        content: body.content,
        target_role: body.target_role || 'all',
        category: body.category || 'General',
        priority: body.priority || 'Normal',
        expires_at: body.expires_at || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(announcement, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error creating announcement.' }, { status: 500 });
  }
}
