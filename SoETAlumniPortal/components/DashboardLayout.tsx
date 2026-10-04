'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { 
  Home, Users, Briefcase, Calendar, 
  Bell, User, Settings, Info, 
  LogOut, Shield, BarChart3, GraduationCap, Megaphone,
  Menu, X, MessageSquare, Award
} from 'lucide-react';

const mainNavItems = [
  { name: 'Dashboard', icon: Home, href: '/student' },
  { name: 'Alumni Directory', icon: Users, href: '/student/alumni' },
  { name: 'Jobs & Internships', icon: Briefcase, href: '/student/jobs' },
  { name: 'Events', icon: Calendar, href: '/student/events' },
  { name: 'Messages & Chat', icon: MessageSquare, href: '/student/chat' },
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
  { name: 'Achievements', icon: Award, href: '/alumni/achievements' },
  { name: 'Messages & Chat', icon: MessageSquare, href: '/student/chat' },
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close mobile navigation on route changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  // Close mobile navigation on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#F7F4EF] text-[#6B5147] font-medium">
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

  const renderNavLinks = (onItemClick?: () => void) => (
    <div className="flex-1 overflow-y-auto px-4 py-6 dark-scrollbar">
      <p className="text-xs font-semibold text-[#DDD7D2]/60 mb-4 px-2 tracking-wider uppercase">Main Menu</p>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onItemClick}
              className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive ? 'bg-[#F28C38] text-white font-semibold shadow-md shadow-[#F28C38]/20' : 'hover:bg-[#5A453D] hover:text-white text-gray-200'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-[#DDD7D2]'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <p className="text-xs font-semibold text-[#DDD7D2]/60 mt-8 mb-4 px-2 tracking-wider uppercase">Preferences</p>
      <nav className="space-y-1">
        {moreItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onItemClick}
              className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive ? 'bg-[#F28C38] text-white font-semibold shadow-md shadow-[#F28C38]/20' : 'hover:bg-[#5A453D] hover:text-white text-gray-200'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-[#DDD7D2]'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  const renderUserProfile = (onSignOutClick?: () => void) => (
    <div className="p-4 bg-[#3D2E28] border-t border-[#6B5147] shrink-0">
      <div className="flex items-center mb-3">
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt={userName} className="w-10 h-10 rounded-full object-cover mr-3 border border-[#6B5147]" />
        ) : (
          <div className="w-10 h-10 bg-gradient-to-tr from-[#F28C38] to-[#F6A15A] rounded-full flex items-center justify-center text-white font-bold mr-3 shadow">
            {userInitials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight truncate">{userName}</p>
          <p className="text-xs text-[#DDD7D2]/70 truncate">{userEmail}</p>
        </div>
      </div>
      <button
        onClick={() => {
          if (onSignOutClick) onSignOutClick();
          logout();
        }}
        className="flex items-center justify-center text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors w-full px-3 py-2 rounded-lg"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#F7F4EF] overflow-hidden font-sans">
      {/* Mobile Navigation Drawer & Backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] bg-[#4A3832] text-gray-200 flex flex-col h-full shadow-2xl z-10">
            {/* Header / Logo + Close Button */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#6B5147] shrink-0">
              <div className="flex items-center">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center p-1 mr-3 shadow-md shrink-0">
                  <img
                    src="/mgm-university-logo.svg"
                    alt="MGM University Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-white font-bold leading-tight tracking-wide">Alumni Portal</h1>
                  <p className="text-xs text-[#F6A15A] font-medium uppercase tracking-wider">{user?.role || 'Student'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-[#5A453D] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav items */}
            {renderNavLinks(() => setIsMobileNavOpen(false))}

            {/* User profile */}
            {renderUserProfile(() => setIsMobileNavOpen(false))}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-[#4A3832] text-gray-200 flex-col hidden md:flex shrink-0 h-full">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[#6B5147] shrink-0">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center p-1 mr-3 shadow-md shrink-0">
            <img
              src="/mgm-university-logo.svg"
              alt="MGM University Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-white font-bold leading-tight tracking-wide">Alumni Portal</h1>
            <p className="text-xs text-[#F6A15A] font-medium uppercase tracking-wider">{user?.role || 'Student'}</p>
          </div>
        </div>

        {/* Navigation */}
        {renderNavLinks()}

        {/* User Profile Section */}
        {renderUserProfile()}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-[#DDD7D2] flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              className="md:hidden p-2 -ml-2 rounded-lg text-[#4A3832] hover:text-[#222222] hover:bg-[#F7F4EF] focus:outline-none focus:ring-2 focus:ring-[#F28C38]"
              aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isMobileNavOpen}
            >
              {isMobileNavOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <span className="font-semibold text-[#4A3832] text-sm">SOET Connect</span>
          </div>
          <div className="flex items-center space-x-4 sm:space-x-6">
            <Link href="/student/notifications" className="text-[#6B6B6B] hover:text-[#4A3832] relative p-1" aria-label="Notifications">
              <Bell className="w-5 h-5" />
            </Link>
            <div className="flex items-center space-x-2 border-l border-[#DDD7D2] pl-4 sm:pl-6">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={userName} className="w-8 h-8 rounded-full object-cover border border-[#DDD7D2]" />
              ) : (
                <div className="w-8 h-8 bg-[#F28C38] rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                  {userInitials}
                </div>
              )}
              <span className="text-sm font-semibold text-[#4A3832]">{firstName}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 light-scrollbar bg-[#F7F4EF]">
          {children}
        </div>
      </main>
    </div>
  );
}
