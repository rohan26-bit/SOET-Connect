import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ detail: 'Admin privileges required.' }, { status: 403 });
    }

    const { userId } = await params;
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status') || 'approved';
    const isApproved = statusParam === 'approved';

    await supabaseServer
      .from('users')
      .update({
        is_verified: isApproved,
        verification_status: statusParam,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    await supabaseServer
      .from('alumni_profiles')
      .update({ verification_status: statusParam })
      .eq('user_id', userId);

    return NextResponse.json({
      message: `Alumni verification status updated to ${statusParam}.`,
      user_id: userId,
      status: statusParam,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Verification update failed.' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  return PATCH(req, context);
}
