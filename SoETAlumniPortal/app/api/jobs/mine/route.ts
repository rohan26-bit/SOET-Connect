import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
    }

    const { data: jobs, error } = await supabaseServer
      .from('jobs')
      .select('*')
      .eq('posted_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(jobs || []);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching user jobs.' }, { status: 500 });
  }
}
