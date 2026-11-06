'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { chatService } from '@/lib/services/chatService';
import LoadingState from '@/components/LoadingState';
import { 
  Home, Users, Briefcase, Calendar, 
  Bell, User, Settings, Info, 
  LogOut, Megaphone, ChevronDown,
  Menu, X, GraduationCap, UserCheck,
  Image as ImageIcon, MessageSquare, Award
} from 'lucide-react';

type NavItem =
  | { type?: 'link'; name: string; icon: React.ElementType; href: string }
  | {
      type: 'group';
      id: string;
      name: string;
      icon: React.ElementType;
      children: { name: string; href: string }[];
    };

const mainNavItems: NavItem[] = [
  { name: 'Dashboard', icon: Home, href: '/student' },
  { name: 'Alumni Directory', icon: Users, href: '/student/alumni' },
  { name: 'Jobs & Internships', icon: Briefcase, href: '/student/jobs' },
  { name: 'Events', icon: Calendar, href: '/student/events' },
  { name: 'Messages & Chat', icon: MessageSquare, href: '/student/chat' },
  {
    type: 'group',
    id: 'gallery',
    name: 'Gallery',
    icon: ImageIcon,
    children: [
      { name: 'Explore Gallery', href: '/gallery' },
      { name: 'Placement Celebrations', href: '/gallery/placements' },
    ],
  },
  { name: 'Notifications', icon: Bell, href: '/student/notifications' },
  { name: 'My Profile', icon: User, href: '/student/profile' },
];

const studentMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/student/settings' },
  { name: 'About SOET', icon: Info, href: '/student/about' },
];

const alumniNavItems: NavItem[] = [
  { name: 'Dashboard', icon: Home, href: '/alumni' },
  { name: 'Alumni Directory', icon: Users, href: '/student/alumni' },
  { name: 'Jobs & Internships', icon: Briefcase, href: '/student/jobs' },
  { name: 'Events', icon: Calendar, href: '/student/events' },
  { name: 'Achievements', icon: Award, href: '/alumni/achievements' },
  { name: 'Messages & Chat', icon: MessageSquare, href: '/student/chat' },
  {
    type: 'group',
    id: 'gallery',
    name: 'Gallery',
    icon: ImageIcon,
    children: [
      { name: 'Explore Gallery', href: '/gallery' },
      { name: 'My Submissions', href: '/gallery#mine' },
      { name: 'Placement Celebrations', href: '/gallery/placements' },
    ],
  },
  { name: 'Notifications', icon: Bell, href: '/student/notifications' },
  { name: 'My Profile', icon: User, href: '/student/profile' },
];

const alumniMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/student/settings' },
  { name: 'About SOET', icon: Info, href: '/student/about' },
];

const adminNavItems: NavItem[] = [
  { name: 'Dashboard', icon: Home, href: '/admin' },
  {
    type: 'group',
    id: 'alumni',
    name: 'Alumni',
    icon: Users,
    children: [
      { name: 'Verification', href: '/admin/verify' },
      { name: 'Management', href: '/admin/alumni' },
    ],
  },
  {
    type: 'group',
    id: 'students',
    name: 'Students',
    icon: GraduationCap,
    children: [
      { name: 'Verification', href: '/admin/students' },
      { name: 'Management', href: '/admin/student-management' },
    ],
  },
  { name: 'Job Approvals', icon: Briefcase, href: '/admin/jobs' },
  { name: 'Participation & Registrations', icon: UserCheck, href: '/admin/participation' },
  { name: 'Events', icon: Calendar, href: '/admin/events' },
  {
    type: 'group',
    id: 'gallery',
    name: 'Gallery',
    icon: ImageIcon,
    children: [
      { name: 'Public Gallery', href: '/gallery' },
      { name: 'Placement Celebrations', href: '/gallery/placements' },
      { name: 'Gallery Moderation', href: '/admin/gallery' },
      { name: 'Manage Placements', href: '/admin/placements' },
    ],
  },
  { name: 'Announcements', icon: Megaphone, href: '/admin/announcements' },
];

const adminMoreNavItems = [
  { name: 'Settings', icon: Settings, href: '/admin/settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [expandedAdminGroups, setExpandedAdminGroups] = useState<string[]>([]);

  // Maintain authenticated presence across the whole portal, not only while chat is open.
  // A user is treated as online while a visible portal tab has sent a heartbeat within 90 seconds.
  useEffect(() => {
    if (!user?.id) return;

    let disposed = false;
    const heartbeat = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      chatService.sendPresenceHeartbeat().catch((error) => {
        // Presence is best-effort and must never interrupt ordinary portal navigation.
        console.warn('Unable to update chat presence:', error);
      });
    };

    heartbeat();
    const intervalId = window.setInterval(heartbeat, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.id]);

  // Close mobile navigation on route changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  // Keep the corresponding admin group expanded when one of its pages is open.
  useEffect(() => {
    if (user?.role !== 'admin') return;

    const activeGroup =
      pathname === '/admin/verify' || pathname.startsWith('/admin/alumni')
        ? 'alumni'
        : pathname === '/admin/students' || pathname.startsWith('/admin/student-management')
        ? 'students'
        : pathname === '/admin/gallery' || pathname.startsWith('/gallery') || pathname === '/admin/placements'
        ? 'gallery'
        : null;

    if (activeGroup) {
      setExpandedAdminGroups((current) =>
        current.includes(activeGroup) ? current : [...current, activeGroup]
      );
    }
  }, [pathname, user?.role]);

  useEffect(() => {
    if (pathname === '/gallery' || pathname.startsWith('/gallery/')) {
      setExpandedAdminGroups((current) =>
        current.includes('gallery') ? current : [...current, 'gallery']
      );
    }
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
    return <LoadingState message="Checking your session" fullPage />;
  }

  // Public visitors can browse the gallery without receiving a default student
  // dashboard menu. Keep navigation limited to the actual public destinations.
  if (pathname.startsWith('/gallery') && !user) {
    return (
      <div className="min-h-screen bg-[#F7F4EF] font-sans text-[#222222]">
        <header className="sticky top-0 z-40 border-b border-[#DDD7D2] bg-white/95 shadow-sm backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="SOET Connect home">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DDD7D2] bg-white p-1 shadow-sm">
                <img
                  src="/mgm-university-logo.svg"
                  alt="MGM University Logo"
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="truncate text-sm font-bold text-[#4A3832] sm:text-base">
                SOET Connect - Alumni Portal
              </span>
            </Link>
            <nav aria-label="Public navigation" className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/"
                className="rounded-xl px-3 py-2 text-xs font-bold text-[#4A3832] transition hover:bg-[#F7F4EF] sm:px-4 sm:text-sm"
              >
                Home
              </Link>
              <Link
                href="/login"
                className="rounded-xl bg-[#F28C38] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#E07D2E] sm:px-5 sm:text-sm"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-[#DDD7D2] bg-white px-4 py-5 text-center text-xs text-[#6B6B6B]">
          © {new Date().getFullYear()} SOET Connect - Alumni Portal. All rights reserved.
          <Link href="/" className="ml-2 font-semibold text-[#C66A22] hover:underline">
            Return to homepage
          </Link>
        </footer>
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

  const toggleAdminGroup = (groupId: string) => {
    setExpandedAdminGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
  };

  const renderNavLinks = (onItemClick?: () => void) => (
    <div className="flex-1 overflow-y-auto px-4 py-6 dark-scrollbar">
      <p className="text-xs font-semibold text-[#DDD7D2]/60 mb-4 px-2 tracking-wider uppercase">Main Menu</p>
      <nav className="space-y-1">
        {navItems.map((item) => {
          if (item.type === 'group') {
            const isExpanded = expandedAdminGroups.includes(item.id);
            const isGroupActive = item.children.some(
              (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
            );

            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleAdminGroup(item.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`sidebar-nav-${item.id}`}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all duration-150 ${
                    isGroupActive
                      ? 'bg-[#5A453D] text-white font-semibold'
                      : 'hover:bg-[#5A453D] hover:text-white text-gray-200'
                  }`}
                >
                  <span className="flex items-center min-w-0">
                    <item.icon className={`w-5 h-5 mr-3 shrink-0 ${isGroupActive ? 'text-[#F6A15A]' : 'text-[#DDD7D2]'}`} />
                    <span>{item.name}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 shrink-0 ml-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                  <div id={`sidebar-nav-${item.id}`} className="mt-1 ml-4 pl-3 border-l border-[#6B5147] space-y-1">
                    {item.children.map((child) => {
                      const childPath = child.href.split('?')[0];
                      const isActive = pathname === childPath || (childPath !== '/gallery' && pathname.startsWith(`${childPath}/`));
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onItemClick}
                          className={`flex items-center px-3 py-2 rounded-lg text-xs transition-all duration-150 ${
                            isActive
                              ? 'bg-[#F28C38] text-white font-semibold shadow-sm'
                              : 'text-gray-300 hover:bg-[#5A453D] hover:text-white'
                          }`}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

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
                  <h1 className="text-white font-bold leading-tight tracking-wide text-sm">SOET Connect</h1>
                  <p className="text-xs text-[#F6A15A] font-medium tracking-wide">Alumni Portal</p>
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
            <h1 className="text-white font-bold leading-tight tracking-wide text-sm">SOET Connect</h1>
            <p className="text-xs text-[#F6A15A] font-medium tracking-wide">Alumni Portal</p>
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
            <span className="font-semibold text-[#4A3832] text-sm truncate">SOET Connect - Alumni Portal</span>
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
