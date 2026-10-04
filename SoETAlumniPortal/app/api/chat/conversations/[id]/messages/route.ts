import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const { data: messages, error } = await supabaseServer
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json(messages || []);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching messages.' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const content = String(body.content || '').trim();

    if (!content) {
      return NextResponse.json({ detail: 'Content is required.' }, { status: 400 });
    }

    const { data: message, error } = await supabaseServer
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id: user.id,
        content,
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    await supabaseServer
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json(message, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error sending message.' }, { status: 500 });
  }
}
