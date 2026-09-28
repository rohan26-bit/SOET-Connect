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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Navigation */}
      <nav className="h-16 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center gap-3 font-semibold text-lg">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md shadow-blue-600/30">
            SP
          </div>
          SOET Connect
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Sign in</Link>
          <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold text-sm shadow-sm transition">
            Create account
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-8 py-20 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="text-blue-600 font-semibold tracking-wide uppercase text-sm">School of Engineering & Technology</div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight tracking-tight">
              Your career network, <br/>built for SOET Connect.
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl leading-relaxed">
              Connect with alumni, apply for roles, and join events — one portal for students, graduates, and administrators.
            </p>
            <div className="flex items-center gap-4 pt-4">
              <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center gap-2 transition">
                Create free account <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="#how-it-works" className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-6 py-3 rounded-xl font-bold shadow-sm transition">
                How it works
              </Link>
            </div>
          </div>
          
          {/* Hero Right Panel */}
          <div className="w-full md:w-80 bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Live Preview</div>
            <div className="space-y-4">
              {[
                { name: 'Nisha Verma', role: 'SDE', company: 'Google', verified: true },
                { name: 'Rohan Desai', role: 'Product', company: 'Amazon', verified: true },
                { name: 'Amit Patel', role: 'Frontend', company: 'Atlassian', verified: false }
              ].map((a, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">
                      {a.name.split(' ').map(n=>n[0]).join('')}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-gray-900">{a.name}</div>
                      <div className="text-xs text-gray-500">{a.role} · {a.company}</div>
                    </div>
                  </div>
                  {a.verified && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full uppercase">Verified</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-white border-y border-gray-200 py-24" id="how-it-works">
          <div className="max-w-6xl mx-auto px-8">
            <div className="mb-12">
              <div className="text-blue-600 font-semibold uppercase tracking-wide text-sm mb-2">Features</div>
              <h2 className="text-3xl font-bold text-gray-900">Everything you need after campus</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {features.map((f, i) => (
                <div key={i} className="p-8 rounded-2xl border border-gray-100 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-500/5 transition bg-gray-50/50">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center mb-6 shadow-md shadow-blue-600/20">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{f.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 bg-gray-900 text-white">
          <div className="max-w-6xl mx-auto px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-gray-800">
              {stats.map((s, i) => (
                <div key={i} className="px-6 text-center md:text-left">
                  <div className="text-4xl font-black text-blue-400 mb-2 tracking-tight">{s.value}</div>
                  <div className="font-bold text-gray-300 mb-1">{s.label}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest">{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 max-w-6xl mx-auto px-8">
          <div className="bg-blue-600 rounded-3xl p-12 flex flex-col md:flex-row items-center justify-between gap-8 text-white shadow-2xl shadow-blue-600/20">
            <div>
              <h2 className="text-3xl font-bold mb-3">Ready to join the network?</h2>
              <p className="text-blue-100 max-w-md">Register as a student or alumnus. Demo logins available on the login page for evaluators.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/register" className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 rounded-xl font-bold shadow-lg transition">Register now</Link>
              <Link href="/login" className="bg-blue-700 hover:bg-blue-800 text-white px-8 py-4 rounded-xl font-bold border border-blue-500 transition">Login</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
