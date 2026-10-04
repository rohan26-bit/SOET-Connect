import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser, formatUserResponse } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { detail: 'Could not validate credentials.' },
        { status: 401 }
      );
    }

    const formatted = await formatUserResponse(user);
    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error fetching profile.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { detail: 'Could not validate credentials.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const userId = user.id;

    if (body.name) {
      await supabaseServer
        .from('users')
        .update({ name: String(body.name).trim(), updated_at: new Date().toISOString() })
        .eq('id', userId);
    }

    if (user.role === 'student' && body.student_profile) {
      await supabaseServer
        .from('student_profiles')
        .update(body.student_profile)
        .eq('user_id', userId);
    } else if (user.role === 'alumni' && body.alumni_profile) {
      await supabaseServer
        .from('alumni_profiles')
        .update(body.alumni_profile)
        .eq('user_id', userId);
    }

    const { data: updatedUser } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const formatted = await formatUserResponse(updatedUser);
    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'Error updating profile.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  return PUT(req);
}
