import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface NavbarProps {
  hasAnnouncement?: boolean;
  onOpenDemo: () => void;
}

const SECTION_LINKS = [
  { label: 'Features', id: 'features' },
  { label: 'How it Works', id: 'how-it-works' },
  { label: 'Pricing', id: 'pricing' },
] as const;

export default function Navbar({ hasAnnouncement = false, onOpenDemo }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);

    if (location.pathname !== '/') {
      navigate(`/#${sectionId}`);
      return;
    }

    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `/#${sectionId}`);
    }
  };

  const handleLogoClick = () => {
    setMobileMenuOpen(false);
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.replaceState(null, '', '/');
    }
  };

  return (
    <nav
      className={`bg-white/95 backdrop-blur-sm shadow-sm sticky ${
        hasAnnouncement ? 'top-0' : 'top-0'
      } z-50 border-b border-slate-100`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link
            to="/"
            onClick={handleLogoClick}
            className="flex items-center space-x-2"
          >
            <span className="text-2xl font-bold text-blue-600">W</span>
            <span className="text-xl font-semibold text-gray-900">WorkforcePro</span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center space-x-8">
            {SECTION_LINKS.map((item) => (
              <a
                key={item.id}
                href={`/#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors cursor-pointer"
              >
                {item.label}
              </a>
            ))}

            <Link
              to="/partners"
              onClick={() => setMobileMenuOpen(false)}
              className="text-blue-600 font-semibold border border-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-50 transition"
            >
              For Partners
            </Link>
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <a
              href="https://workforcepro-saas.web.app"
              className="text-gray-700 hover:text-blue-600 font-medium"
            >
              Login
            </a>
            <button
              type="button"
              onClick={onOpenDemo}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Book a Demo
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="p-2 rounded-lg text-gray-700 hover:text-blue-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 pt-3 pb-5 space-y-2 shadow-lg">
          {SECTION_LINKS.map((item) => (
            <a
              key={item.id}
              href={`/#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(item.id);
              }}
              className="block px-3 py-2.5 rounded-lg text-base font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50/60"
            >
              {item.label}
            </a>
          ))}

          <Link
            to="/partners"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-base font-semibold text-blue-600 hover:bg-blue-50"
          >
            For Partners
          </Link>

          <div className="pt-3 border-t border-gray-100 flex flex-col space-y-2.5">
            <a
              href="https://workforcepro-saas.web.app"
              className="w-full text-center py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
            >
              Login
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDemo();
              }}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Book a Demo
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}