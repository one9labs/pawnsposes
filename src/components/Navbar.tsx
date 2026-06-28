import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  ChevronDown,
  Crown,
  LogOut,
  Menu,
  Settings,
  User,
  X
} from 'lucide-react';

const Navbar: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isLandingPage = location.pathname === '/' && !currentUser;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Analyze', href: '/analyze' },
    { name: 'Puzzles', href: '/puzzles' },
    { name: 'Reports', href: '/reports' },
  ];

  const coachNavigation = [
    { name: 'Coach Tools', href: '/coach' },
    { name: 'Students', href: '/students' },
  ];

  const navLinkClass = 'rounded-full px-3 py-2 text-sm font-medium text-primary-900/70 transition hover:bg-primary-50 hover:text-primary-900';
  const mobileLinkClass = 'block rounded-lg px-3 py-2 text-base font-medium text-primary-900/75 transition hover:bg-primary-50 hover:text-primary-900';

  return (
    <nav className={`${isLandingPage ? 'fixed' : 'sticky'} left-0 right-0 top-0 z-40 px-3 pt-3 sm:px-5`}>
      <div className={`mx-auto max-w-7xl rounded-full border px-3 shadow-lg backdrop-blur-xl transition ${
        isLandingPage
          ? 'border-white/70 bg-[#fbfcf8]/95 shadow-primary-900/20'
          : 'border-primary-900/10 bg-white/95 shadow-primary-900/5'
      }`}>
        <div className="flex h-12 items-center justify-between gap-4 sm:h-14">
          <div className="flex min-w-0 items-center">
            <div className="flex flex-shrink-0 items-center">
              <Link to="/" className="group flex items-center gap-2 rounded-full pr-2 transition">
                <img
                  src="/pnp_logo.jpeg"
                  alt="Pawnsposes logo"
                  className="h-8 w-8 rounded-full object-cover shadow-sm ring-1 ring-primary-900/10 sm:h-9 sm:w-9"
                />
                <span className="text-base font-bold tracking-normal text-primary-900 sm:text-lg">Pawnsposes</span>
              </Link>
            </div>

            {currentUser && (
              <div className="hidden sm:ml-5 sm:flex sm:items-center sm:gap-1">
                {navigation.map((item) => (
                  <Link key={item.name} to={item.href} className={navLinkClass}>
                    {item.name}
                  </Link>
                ))}

                {currentUser.role === 'coach' && coachNavigation.map((item) => (
                  <Link key={item.name} to={item.href} className={navLinkClass}>
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:flex sm:items-center">
            {currentUser ? (
              <div className="flex items-center gap-3">
                {currentUser.isPremium && (
                  <div className="flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-800 ring-1 ring-gold-300/50">
                    <Crown className="h-3 w-3" />
                    <span>Premium</span>
                  </div>
                )}

                <div className="relative">
                  <button
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="flex items-center gap-2 rounded-full bg-white/70 py-1 pl-1 pr-2 text-sm shadow-sm ring-1 ring-primary-900/10 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-900">
                      <User className="h-4 w-4 text-gold-100" />
                    </div>
                    <span className="max-w-[9rem] truncate font-medium text-primary-900">{currentUser.displayName}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>

                  {isProfileOpen && (
                    <div className="absolute right-0 z-50 mt-3 w-52 origin-top-right rounded-2xl border border-primary-900/10 bg-white/95 p-2 shadow-2xl shadow-primary-900/15 backdrop-blur">
                      <div className="space-y-1">
                        <Link
                          to="/profile"
                          className="flex items-center rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-primary-50"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          <User className="mr-2 h-4 w-4" />
                          Profile
                        </Link>
                        <Link
                          to="/settings"
                          className="flex items-center rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-primary-50"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Settings
                        </Link>
                        {!currentUser.isPremium && (
                          <Link
                            to="/premium"
                            className="flex items-center rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-primary-50"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            <Crown className="mr-2 h-4 w-4" />
                            Upgrade to Premium
                          </Link>
                        )}
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-primary-50"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-primary-900/75 transition hover:bg-white/70 hover:text-primary-900"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center rounded-full bg-primary-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-900/20 transition hover:-translate-y-0.5 hover:bg-primary-800 hover:shadow-primary-900/25"
                >
                  Get Started
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-primary-900 shadow-sm ring-1 ring-primary-900/10 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              aria-label="Toggle navigation"
            >
              {isMenuOpen ? (
                <X className="block h-5 w-5" />
              ) : (
                <Menu className="block h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="mx-auto mt-2 max-w-7xl rounded-3xl border border-primary-900/[0.12] bg-[#fbfcf8] p-4 shadow-2xl shadow-primary-900/20 backdrop-blur-xl sm:hidden">
          <div className="space-y-1">
            {currentUser ? (
              <>
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={mobileLinkClass}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}

                {currentUser.role === 'coach' && coachNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={mobileLinkClass}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}

                <div className="mt-3 border-t border-primary-900/10 pt-4">
                  <div className="flex items-center rounded-2xl bg-primary-50 px-3 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-900">
                      <User className="h-5 w-5 text-gold-100" />
                    </div>
                    <div className="ml-3 min-w-0">
                      <div className="truncate text-base font-medium text-gray-800">{currentUser.displayName}</div>
                      <div className="truncate text-sm font-medium text-gray-500">{currentUser.email}</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <Link
                      to="/profile"
                      className="block rounded-lg px-3 py-2 text-base font-medium text-gray-600 hover:bg-primary-50 hover:text-primary-800"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="block rounded-lg px-3 py-2 text-base font-medium text-gray-600 hover:bg-primary-50 hover:text-primary-800"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full rounded-lg px-3 py-2 text-left text-base font-medium text-gray-600 hover:bg-primary-50 hover:text-primary-800"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Link
                  to="/login"
                  className="block rounded-full bg-white px-4 py-3 text-center text-base font-semibold text-primary-900 shadow-sm ring-1 ring-primary-900/10 hover:bg-primary-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="block rounded-full bg-primary-900 px-4 py-3 text-center text-base font-semibold text-white shadow-lg shadow-primary-900/25 hover:bg-primary-800"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
