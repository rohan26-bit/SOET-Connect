import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ detail: 'Admin privileges required.' }, { status: 403 });
    }

    const [usersRes, pendingRes, jobsRes, eventsRes] = await Promise.all([
      supabaseServer.from('users').select('role, is_verified'),
      supabaseServer.from('users').select('id', { count: 'exact', head: true }).eq('role', 'alumni').eq('is_verified', false),
      supabaseServer.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseServer.from('events').select('id', { count: 'exact', head: true }),
    ]);

    const users = usersRes.data || [];
    const total_students = users.filter((u) => u.role === 'student').length;
    const total_alumni = users.filter((u) => u.role === 'alumni').length;
    const pending_verifications = pendingRes.count || 0;
    const active_jobs = jobsRes.count || 0;
    const upcoming_events = eventsRes.count || 0;

    return NextResponse.json({
      total_users: users.length,
      total_students,
      total_alumni,
      pending_verifications,
      active_jobs,
      upcoming_events,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching metrics.' }, { status: 500 });
  }
}
