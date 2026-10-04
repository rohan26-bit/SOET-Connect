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
        <div className="flex items-center gap-3 font-semibold text-lg text-[#4A3832]">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-0.5 shadow-sm border border-[#DDD7D2]">
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
          SOET Connect
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[#6B6B6B] hover:text-[#4A3832] font-medium text-sm transition">Sign in</Link>
          <Link href="/register" className="bg-[#F28C38] hover:bg-[#E07D2E] text-white px-5 py-2 rounded-lg font-semibold text-sm shadow-sm transition">
            Create account
          </Link>
        </div>
      </nav>

      {/* Hero Section - Full-Width Campus Photo with Layered Gradient Overlay */}
      <main className="flex-1">
        <section className="relative w-full min-h-[580px] sm:min-h-[640px] lg:min-h-[700px] flex items-center bg-[#211510] overflow-hidden">
          {/* Integrated SOET Building Photo dominating the right side (58-60% on desktop, full-width on mobile) */}
          <div className="absolute inset-y-0 right-0 w-full lg:w-[60%] xl:w-[58%] z-0 overflow-hidden">
            <img
              src="/soet-building.jpg"
              alt="School of Engineering and Technology, MGM University"
              className="w-full h-full object-cover object-center"
            />

            {/* Localized non-destructive SVG mask aligned directly with the image coordinate space (725x467) to hide ONLY the small MGM logo on the signboard */}
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
              {/* Softly feathered patch covering ONLY the small MGM logo (x:176-244, y:182-218) without touching "SCHOOL OF ENGINEERING AND TECHNOLOGY" starting at x:252 */}
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

            {/* Layered Gradient Overlay: Dark brown fade melting left into hero background, transparent on right to showcase building & signboard */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#211510]/95 via-[#211510]/80 to-[#211510]/40 lg:from-[#211510] lg:via-[#211510]/30 lg:to-transparent pointer-events-none" />
            {/* Subtle bottom depth fade into page background */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#211510]/60 to-transparent pointer-events-none" />
          </div>

          {/* Hero Typography & CTAs directly over dark fade on the left */}
          <div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 py-20 lg:py-28">
            <div className="max-w-xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F28C38]/25 border border-[#F28C38]/40 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-[#F28C38] animate-pulse" />
                <span className="text-[#F6A15A] font-bold tracking-wider uppercase text-xs">
                  School of Engineering & Technology
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md">
                Your career network, <br className="hidden sm:inline" />built for SOET Connect.
              </h1>

              <p className="text-base sm:text-xl text-[#F7F4EF]/95 max-w-xl leading-relaxed drop-shadow">
                Connect with alumni, apply for roles, and join events — one portal for students, graduates, and administrators.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 pt-4">
                <Link
                  href="/register"
                  className="bg-[#F28C38] hover:bg-[#E07D2E] text-white px-7 py-3.5 rounded-xl font-bold shadow-xl shadow-black/25 flex items-center justify-center gap-2 transition hover:-translate-y-0.5 text-center"
                >
                  Create free account <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="bg-white/90 hover:bg-white text-[#4A3832] border border-white/60 backdrop-blur-md px-7 py-3.5 rounded-xl font-bold shadow-lg shadow-black/20 transition hover:-translate-y-0.5 text-center flex items-center justify-center"
                >
                  How it works
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-white border-y border-[#DDD7D2] py-24" id="how-it-works">
          <div className="max-w-6xl mx-auto px-8">
            <div className="mb-12">
              <div className="text-[#F28C38] font-semibold uppercase tracking-wide text-sm mb-2">Features</div>
              <h2 className="text-3xl font-bold text-[#4A3832]">Everything you need after campus</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {features.map((f, i) => (
                <div key={i} className="p-8 rounded-2xl border border-[#DDD7D2] hover:border-[#F28C38]/30 hover:shadow-lg hover:shadow-[#F28C38]/5 transition bg-[#FBFAF8]">
                  <div className="w-12 h-12 bg-[#F28C38] text-white rounded-xl flex items-center justify-center mb-6 shadow-md shadow-[#F28C38]/20">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-[#4A3832] mb-3">{f.title}</h3>
                  <p className="text-[#6B6B6B] leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 bg-[#4A3832] text-white">
          <div className="max-w-6xl mx-auto px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:divide-x divide-[#6B5147]">
              {stats.map((s, i) => (
                <div key={i} className="px-6 text-center md:text-left">
                  <div className="text-4xl font-black text-[#F6A15A] mb-2 tracking-tight">{s.value}</div>
                  <div className="font-bold text-[#DDD7D2] mb-1">{s.label}</div>
                  <div className="text-xs text-[#DDD7D2]/60 uppercase tracking-widest">{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 max-w-6xl mx-auto px-8">
          <div className="bg-gradient-to-r from-[#4A3832] to-[#6B5147] rounded-3xl p-12 flex flex-col md:flex-row items-center justify-between gap-8 text-white shadow-2xl shadow-[#4A3832]/25">
            <div>
              <h2 className="text-3xl font-bold mb-3">Ready to join the network?</h2>
              <p className="text-[#DDD7D2] max-w-md">Register as a student or alumnus. Demo logins available on the login page for evaluators.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/register" className="bg-[#F28C38] text-white hover:bg-[#E07D2E] px-8 py-4 rounded-xl font-bold shadow-lg shadow-[#F28C38]/20 transition">Register now</Link>
              <Link href="/login" className="bg-[#3D2E28] hover:bg-[#2F231E] text-white px-8 py-4 rounded-xl font-bold border border-[#6B5147] transition">Login</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
