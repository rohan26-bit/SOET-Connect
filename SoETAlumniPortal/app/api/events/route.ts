import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const department = searchParams.get('department');
    const search = searchParams.get('search');

    let query = supabaseServer
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }
    if (department && department !== 'All') {
      query = query.eq('department', department);
    }

    const { data: events, error } = await query;
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    let results = events || [];
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (e: any) =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.location || '').toLowerCase().includes(q)
      );
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching events.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || (user.role !== 'alumni' && user.role !== 'admin')) {
      return NextResponse.json({ detail: 'Only alumni or admins can create events.' }, { status: 403 });
    }

    const body = await req.json();
    const { data: event, error } = await supabaseServer
      .from('events')
      .insert({
        created_by: user.id,
        title: body.title,
        description: body.description,
        date: body.date,
        time: body.time,
        location: body.location,
        type: body.type || 'In-Person',
        category: body.category || 'General',
        capacity: body.capacity || 100,
        registered_count: 0,
        speakers: body.speakers || [],
        agenda: body.agenda || [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(event, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error creating event.' }, { status: 500 });
  }
}
