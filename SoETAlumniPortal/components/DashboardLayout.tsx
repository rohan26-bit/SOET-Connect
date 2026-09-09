'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { 
  Home, Users, Briefcase, Calendar, 
  MessageSquare, Bell, User, Settings, Info, 
  Search, Moon, LogOut, Shield, BarChart3, GraduationCap, Megaphone
} from 'lucide-react';

const mainNavItems = [
  { name: 'Dashboard', icon: Home, href: '/student' },
  { name: 'Alumni Directory', icon: Users, href: '/student/alumni' },
  { name: 'Jobs & Internships', icon: Briefcase, href: '/student/jobs' },
  { name: 'Events', icon: Calendar, href: '/student/events' },
  { name: 'Notifications', icon: Bell, href: '/student/notifications' },
  { name: 'My Profile', icon: User, href: '/student/profile' },
];

const studentMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/student/settings' },
  { name: 'About SOET', icon: Info, href: '/student/about' },
];

const alumniNavItems = [
  { name: 'Dashboard', icon: Home, href: '/alumni' },
  { name: 'Alumni Directory', icon: Users, href: '/student/alumni' },
  { name: 'Jobs & Internships', icon: Briefcase, href: '/student/jobs' },
  { name: 'Events', icon: Calendar, href: '/student/events' },
  { name: 'Notifications', icon: Bell, href: '/student/notifications' },
  { name: 'My Profile', icon: User, href: '/student/profile' },
];

const alumniMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/student/settings' },
  { name: 'About SOET', icon: Info, href: '/student/about' },
];

const adminNavItems = [
  { name: 'Dashboard', icon: Home, href: '/admin' },
  { name: 'Alumni Verification', icon: Shield, href: '/admin/verify' },
  { name: 'Students Management', icon: GraduationCap, href: '/admin/students' },
  { name: 'Alumni Management', icon: Users, href: '/admin/alumni' },
  { name: 'Job Approvals', icon: Briefcase, href: '/admin/jobs' },
  { name: 'Events', icon: Calendar, href: '/admin/events' },
  { name: 'Announcements', icon: Megaphone, href: '/admin/announcements' },
  { name: 'Reports & Analytics', icon: BarChart3, href: '/admin/reports' },
];

const adminMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/admin/settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getFirstName = (name: string) => {
    if (!name) return 'User';
    return name.trim().split(' ')[0];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-medium">
        Loading SOET Portal...
      </div>
    );
  }

  const userName = user?.full_name || 'User';
  const userInitials = getInitials(userName);
  const firstName = getFirstName(userName);
  const userEmail = user?.email || '';
  const isAdmin = user?.role === 'admin';
  const isAlumni = user?.role === 'alumni';
  const navItems = isAdmin ? adminNavItems : isAlumni ? alumniNavItems : mainNavItems;
  const moreItems = isAdmin ? adminMoreNavItems : isAlumni ? alumniMoreNavItems : studentMoreNavItems;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0B1528] text-gray-300 flex flex-col hidden md:flex shrink-0 h-full">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold mr-3 shadow-md shadow-blue-600/30">
            SOET
          </div>
          <div>
            <h1 className="text-white font-bold leading-tight tracking-wide">Alumni Portal</h1>
            <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">{user?.role || 'Student'}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-6 dark-scrollbar">
          <p className="text-xs font-semibold text-gray-500 mb-4 px-2 tracking-wider uppercase">Main Menu</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.name} 
                  href={item.href}
                  className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-150 ${
                    isActive ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20' : 'hover:bg-gray-800 hover:text-white text-gray-300'
                  }`}
                >
                  <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <p className="text-xs font-semibold text-gray-500 mt-8 mb-4 px-2 tracking-wider uppercase">Preferences</p>
          <nav className="space-y-1">
            {moreItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.name} 
                  href={item.href}
                  className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-150 ${
                    isActive ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20' : 'hover:bg-gray-800 hover:text-white text-gray-300'
                  }`}
                >
                  <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Profile Section */}
        <div className="p-4 bg-[#080F1E] border-t border-gray-800 shrink-0">
          <div className="flex items-center mb-3">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={userName} className="w-10 h-10 rounded-full object-cover mr-3 border border-gray-700" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold mr-3 shadow">
                {userInitials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight truncate">{userName}</p>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="flex items-center justify-center text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors w-full px-3 py-2 rounded-lg"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-800 text-sm hidden sm:inline">SOET Connect</span>
          </div>
          <div className="flex items-center space-x-6">
            <Link href="/student/notifications" className="text-gray-500 hover:text-gray-700 relative p-1">
              <Bell className="w-5 h-5" />
            </Link>
            <div className="flex items-center space-x-2 border-l border-gray-200 pl-6">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={userName} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                  {userInitials}
                </div>
              )}
              <span className="text-sm font-semibold text-gray-800">{firstName}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 light-scrollbar bg-[#F8FAFC]">
          {children}
        </div>
      </main>
    </div>
  );
}
