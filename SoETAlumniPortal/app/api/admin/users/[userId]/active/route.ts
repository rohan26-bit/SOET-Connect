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
    const activeParam = searchParams.get('is_active');
    const isActive = activeParam === 'true';

    await supabaseServer
      .from('users')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userId);

    return NextResponse.json({
      message: `User active status updated to ${isActive}.`,
      user_id: userId,
      is_active: isActive,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Update failed.' }, { status: 500 });
  }
}
