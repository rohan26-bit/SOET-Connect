import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
    }

    const { data: parts, error: partError } = await supabaseServer
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (partError || !parts || parts.length === 0) {
      return NextResponse.json([]);
    }

    const convIds = parts.map((p) => p.conversation_id);
    const { data: convs, error: convError } = await supabaseServer
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (convError) {
      return NextResponse.json({ detail: convError.message }, { status: 500 });
    }

    const results = await Promise.all(
      (convs || []).map(async (c: any) => {
        const { data: allParts } = await supabaseServer
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', c.id);

        const otherUserId = (allParts || [])
          .map((p) => p.user_id)
          .find((id) => id !== user.id);

        let otherUser = null;
        if (otherUserId) {
          const { data: u } = await supabaseServer
            .from('users')
            .select('id, name, email, avatar_url, role')
            .eq('id', otherUserId)
            .single();
          otherUser = u;
        }

        const { data: lastMsg } = await supabaseServer
          .from('messages')
          .select('*')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          id: c.id,
          _id: c.id,
          canonical_key: c.canonical_key,
          other_user: otherUser,
          last_message: lastMsg,
          updated_at: c.updated_at,
          created_at: c.created_at,
        };
      })
    );

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error fetching conversations.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const targetUserId = body.target_user_id || body.participant_id;

    if (!targetUserId) {
      return NextResponse.json({ detail: 'Target user ID is required.' }, { status: 400 });
    }

    const ids = [user.id, targetUserId].sort();
    const canonicalKey = `${ids[0]}_${ids[1]}`;

    let { data: existing } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('canonical_key', canonicalKey)
      .maybeSingle();

    if (!existing) {
      const { data: newConv, error: createError } = await supabaseServer
        .from('conversations')
        .insert({
          canonical_key: canonicalKey,
          hidden_for: [],
        })
        .select()
        .single();

      if (createError || !newConv) {
        return NextResponse.json({ detail: createError?.message || 'Failed to create conversation.' }, { status: 500 });
      }

      existing = newConv;

      await supabaseServer.from('conversation_participants').insert([
        { conversation_id: newConv.id, user_id: user.id },
        { conversation_id: newConv.id, user_id: targetUserId },
      ]);
    }

    return NextResponse.json(existing, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err?.message || 'Error starting conversation.' }, { status: 500 });
  }
}
