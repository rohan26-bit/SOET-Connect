import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F7F4EF] flex flex-col font-sans text-[#222222] overflow-x-hidden">
      {/* Navigation */}
      <nav className="py-2.5 sm:py-3 px-6 sm:px-8 bg-white/95 backdrop-blur-md border-b border-[#DDD7D2] sticky top-0 z-40 shadow-sm flex items-center">
        <div className="flex items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-xl flex items-center justify-center p-1 shadow-sm border border-[#DDD7D2] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-base sm:text-lg text-[#4A3832] leading-tight">
              SOET Connect - Alumni Portal
            </span>
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/login"
                className="text-[#6B6B6B] hover:text-[#4A3832] font-medium text-xs sm:text-sm transition"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="bg-[#F28C38] hover:bg-[#E07D2E] text-white px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg font-semibold text-xs sm:text-sm shadow-sm transition"
              >
                Create account
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Full-Width Campus Photo with Layered Gradient Overlay */}
      <main className="flex-1 flex flex-col">
        <section className="relative w-full flex-1 min-h-[520px] sm:min-h-[580px] lg:min-h-[620px] flex items-center bg-[#211510] overflow-hidden">
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

          {/* Hero Typography */}
          <div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 py-16 lg:py-24">
            <div className="max-w-xl space-y-5">
              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight drop-shadow-md">
                SOET Connect - Alumni Portal
              </h1>

              <p className="text-base sm:text-lg text-[#F7F4EF]/95 max-w-xl leading-relaxed">
                Connecting SOET students and alumni through opportunities, events, and career updates.
              </p>
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
