import { SignJWT, jwtVerify } from 'jose';
import { argon2Verify, argon2id } from 'hash-wasm';
import crypto from 'crypto';
import { supabaseServer } from './supabaseServer';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET_KEY || 'soet-connect-jwt-secret-key-production-32chars'
);

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    if (hash.startsWith('$argon2')) {
      return await argon2Verify({ password, hash });
    }
    // Fallback equality check for plain passwords in legacy or test entries
    return password === hash;
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return await argon2id({
    password,
    salt,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function createAccessToken(userId: string, role: string): Promise<string> {
  return await new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return {
      userId: payload.sub as string,
      role: (payload.role as string) || '',
    };
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenPayload = await verifyAccessToken(token);
  if (!tokenPayload) return null;

  const { data: user } = await supabaseServer
    .from('users')
    .select('*')
    .eq('id', tokenPayload.userId)
    .single();

  if (!user || user.is_active === false) return null;
  return user;
}

export async function formatUserResponse(userRow: any) {
  if (!userRow) return null;
  const userId = String(userRow.id);

  let studentProfile = null;
  let alumniProfile = null;

  if (userRow.role === 'student') {
    const { data: s } = await supabaseServer
      .from('student_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (s) {
      studentProfile = {
        student_id: s.student_id,
        department: s.department,
        course: s.course,
        academic_year: s.academic_year,
        graduation_year: s.graduation_year,
        phone: s.phone,
      };
    }
  } else if (userRow.role === 'alumni') {
    const { data: a } = await supabaseServer
      .from('alumni_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (a) {
      alumniProfile = {
        alumni_id: a.alumni_id,
        department: a.department,
        degree: a.degree,
        graduation_year: a.graduation_year,
        company: a.company,
        designation: a.designation,
        industry: a.industry,
        location: a.location,
        skills: a.skills,
        linkedin: a.linkedin,
        github: a.github,
        website: a.website,
        bio: a.bio,
        verification_status: a.verification_status,
      };
    }
  }

  return {
    id: userId,
    name: userRow.name || '',
    email: userRow.email || '',
    role: userRow.role,
    avatar_url: userRow.avatar_url,
    is_active: userRow.is_active ?? true,
    is_verified: userRow.is_verified ?? false,
    verification_status: userRow.verification_status || 'pending',
    created_at: userRow.created_at,
    student_profile: studentProfile,
    alumni_profile: alumniProfile,
  };
}
