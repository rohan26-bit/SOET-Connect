import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyPassword, createAccessToken, formatUserResponse } from '@/lib/authUtils';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const selectedRole = body.role;

    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json(
        { detail: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      return NextResponse.json(
        { detail: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { detail: 'This account has been deactivated.' },
        { status: 403 }
      );
    }

    if (selectedRole && user.role !== selectedRole) {
      return NextResponse.json(
        {
          detail: `Access denied. Your account is registered as "${user.role.toUpperCase()}", not "${selectedRole.toUpperCase()}". Please select the correct role.`,
        },
        { status: 403 }
      );
    }

    const formattedUser = await formatUserResponse(user);
    const accessToken = await createAccessToken(String(user.id), user.role);

    return NextResponse.json({
      message: 'Login successful.',
      access_token: accessToken,
      token_type: 'bearer',
      user: formattedUser,
    });
  } catch (err: any) {
    console.error('Login route error:', err);
    return NextResponse.json(
      { detail: err?.message || 'Internal server error during authentication.' },
      { status: 500 }
    );
  }
}
