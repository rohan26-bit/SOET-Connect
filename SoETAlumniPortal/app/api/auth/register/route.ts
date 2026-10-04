import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { hashPassword } from '@/lib/authUtils';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || '').toLowerCase();

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { detail: 'Name, email, password, and role are required.' },
        { status: 400 }
      );
    }

    if (!['student', 'alumni', 'admin'].includes(role)) {
      return NextResponse.json(
        { detail: 'Invalid registration role.' },
        { status: 403 }
      );
    }

    if (role === 'admin') {
      const adminSecret = body.admin_secret;
      const expectedSecret = process.env.ADMIN_REGISTRATION_SECRET || 'soet_admin_secret_2026';
      if (!adminSecret || adminSecret !== expectedSecret) {
        return NextResponse.json(
          { detail: 'Invalid admin registration secret.' },
          { status: 403 }
        );
      }
    }

    // Check duplicate email
    const { data: existing } = await supabaseServer
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { detail: 'A user with this email address already exists.' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const isVerified = role === 'student' || role === 'admin';
    const verificationStatus = isVerified ? 'approved' : 'pending';

    const { data: newUser, error: userError } = await supabaseServer
      .from('users')
      .insert({
        name,
        email,
        password_hash: hashedPassword,
        role,
        is_active: true,
        is_verified: isVerified,
        verification_status: verificationStatus,
      })
      .select()
      .single();

    if (userError || !newUser) {
      return NextResponse.json(
        { detail: userError?.message || 'Failed to create user record.' },
        { status: 500 }
      );
    }

    const userId = newUser.id;

    if (role === 'student') {
      await supabaseServer.from('student_profiles').insert({
        user_id: userId,
        student_id: body.student_id || null,
        department: body.department || null,
        course: body.course || null,
        academic_year: body.academic_year || null,
        graduation_year: body.graduation_year || null,
        phone: body.phone || null,
      });
    } else if (role === 'alumni') {
      await supabaseServer.from('alumni_profiles').insert({
        user_id: userId,
        alumni_id: body.alumni_id || null,
        department: body.department || null,
        degree: body.degree || null,
        graduation_year: body.graduation_year || null,
        company: body.company || null,
        designation: body.designation || null,
        industry: body.industry || null,
        location: body.location || null,
        skills: body.skills || [],
        linkedin: body.linkedin || null,
        github: body.github || null,
        website: body.website || null,
        bio: body.bio || null,
        verification_status: 'pending',
      });
    }

    return NextResponse.json(
      {
        message: 'Registration successful.',
        user_id: userId,
        role: newUser.role,
        is_verified: isVerified,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Registration route error:', err);
    return NextResponse.json(
      { detail: err?.message || 'Registration failed.' },
      { status: 500 }
    );
  }
}
