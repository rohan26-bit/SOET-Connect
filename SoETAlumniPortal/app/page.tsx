import Link from 'next/link';
import { ArrowRight, Users, Briefcase, Calendar, MessageSquare } from 'lucide-react';

export default function LandingPage() {
  const stats = [
    { label: 'Verified alumni', value: '1,240', note: 'Global network' },
    { label: 'Active students', value: '3,680', note: 'Engaged users' },
    { label: 'Open roles', value: '86', note: 'Posted by alumni' },
    { label: 'Events / year', value: '42', note: 'Workshops & meetups' },
  ];

  const features = [
    { icon: Users, title: 'Alumni network', body: 'Search verified graduates by batch, company, and skills. Connect instantly.' },
    { icon: Briefcase, title: 'Jobs & internships', body: 'Browse roles posted by alumni and partners. Apply with your SOET profile.' },
    { icon: Calendar, title: 'Campus events', body: 'Meetups, workshops, and AMAs — register and get reminders in your feed.' },
    { icon: MessageSquare, title: 'Secure messaging', body: 'Chat with alumni and peers inside the portal — no personal number required.' },
  ];

  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col font-sans text-[#222222] overflow-x-hidden">
      {/* Navigation */}
      <nav className="h-16 flex items-center justify-between px-6 sm:px-8 bg-white/95 backdrop-blur-md border-b border-[#DDD7D2] sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3 font-semibold text-base sm:text-lg text-[#4A3832]">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-xl flex items-center justify-center p-1 shadow-sm border border-[#DDD7D2] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="truncate">SOET Connect - Alumni Portal</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link href="/login" className="text-[#6B6B6B] hover:text-[#4A3832] font-medium text-sm transition">
            Sign in
          </Link>
          <Link href="/register" className="bg-[#F28C38] hover:bg-[#E07D2E] text-white px-4 sm:px-5 py-2 rounded-lg font-semibold text-sm shadow-sm transition">
            Create account
          </Link>
        </div>
      </nav>

      {/* Hero Section - Full-Width Campus Photo with Layered Gradient Overlay */}
      <main className="flex-1">
        <section className="relative w-full min-h-[520px] sm:min-h-[580px] lg:min-h-[620px] flex items-center bg-[#211510] overflow-hidden">
          {/* Integrated SOET Building Photo dominating the right side */}
          <div className="absolute inset-y-0 right-0 w-full lg:w-[60%] xl:w-[58%] z-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/soet-building.jpg"
              alt="School of Engineering and Technology, MGM University"
              className="w-full h-full object-cover object-center"
            />

            {/* Localized SVG mask covering small MGM logo on signboard */}
            <svg
              viewBox="0 0 725 467"
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden="true"
            >
              <defs>
                <filter id="soft-signboard-edge" x="-10%" y="-10%" width="120%" height="120%">
                  <feGaussianBlur stdDeviation="0.7" />
                </filter>
              </defs>
              <rect
                x="176"
                y="182"
                width="68"
                height="36"
                rx="3"
                ry="3"
                fill="#EEEFEA"
                filter="url(#soft-signboard-edge)"
              />
            </svg>

            {/* Layered Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#211510]/95 via-[#211510]/80 to-[#211510]/40 lg:from-[#211510] lg:via-[#211510]/30 lg:to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#211510]/60 to-transparent pointer-events-none" />
          </div>

          {/* Hero Typography & CTAs */}
          <div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 py-16 lg:py-24">
            <div className="max-w-xl space-y-5">
              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md">
                SOET Connect - Alumni Portal
              </h1>

              <p className="text-base sm:text-lg text-[#F7F4EF]/95 max-w-xl leading-relaxed">
                Connecting SOET students and alumni through opportunities, events, and career updates.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 pt-3">
                <Link
                  href="/register"
                  className="bg-[#F28C38] hover:bg-[#E07D2E] text-white px-7 py-3.5 rounded-xl font-bold shadow-md shadow-black/20 flex items-center justify-center gap-2 transition hover:-translate-y-0.5 text-center"
                >
                  Create account <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="bg-white/90 hover:bg-white text-[#4A3832] border border-white/60 backdrop-blur-md px-7 py-3.5 rounded-xl font-bold shadow-md shadow-black/15 transition hover:-translate-y-0.5 text-center flex items-center justify-center"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-white border-y border-[#DDD7D2] py-20">
          <div className="max-w-6xl mx-auto px-6 sm:px-8">
            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#4A3832]">Portal Features</h2>
              <p className="text-xs sm:text-sm text-[#6B6B6B] mt-1">Core services for students, alumni, and administrators.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {features.map((f, i) => (
                <div key={i} className="p-6 rounded-2xl border border-[#DDD7D2] bg-[#FBFAF8]">
                  <div className="w-10 h-10 bg-[#F28C38] text-white rounded-xl flex items-center justify-center mb-4 shadow-sm">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#4A3832] mb-2">{f.title}</h3>
                  <p className="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-14 bg-[#4A3832] text-white">
          <div className="max-w-6xl mx-auto px-6 sm:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-y md:divide-y-0 md:divide-x divide-[#6B5147]">
              {stats.map((s, i) => (
                <div key={i} className="px-4 py-2 text-center md:text-left">
                  <div className="text-3xl font-black text-[#F6A15A] mb-1 tracking-tight">{s.value}</div>
                  <div className="text-sm font-bold text-[#DDD7D2]">{s.label}</div>
                  <div className="text-[10px] text-[#DDD7D2]/60 uppercase tracking-widest mt-0.5">{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Access CTA */}
        <section className="py-16 max-w-6xl mx-auto px-6 sm:px-8">
          <div className="bg-gradient-to-r from-[#4A3832] to-[#6B5147] rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 text-white shadow-lg">
            <div>
              <h2 className="text-2xl font-bold mb-2">SOET Connect - Alumni Portal</h2>
              <p className="text-xs sm:text-sm text-[#DDD7D2] max-w-md">
                Connecting students and alumni across MGM University.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/register" className="bg-[#F28C38] text-white hover:bg-[#E07D2E] px-6 py-3 rounded-xl font-bold text-xs sm:text-sm shadow-md transition">
                Create account
              </Link>
              <Link href="/login" className="bg-[#3D2E28] hover:bg-[#2F231E] text-white px-6 py-3 rounded-xl font-bold text-xs sm:text-sm border border-[#6B5147] transition">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#DDD7D2] bg-white py-6 px-6 sm:px-8 text-center text-xs text-[#6B6B6B]">
        <p>&copy; {new Date().getFullYear()} SOET Connect - Alumni Portal. All rights reserved.</p>
      </footer>
    </div>
  );
}
