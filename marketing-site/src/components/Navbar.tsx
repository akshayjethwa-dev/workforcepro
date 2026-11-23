import { Link } from 'react-router-dom';

interface NavbarProps {
  hasAnnouncement?: boolean;
  onOpenDemo: () => void;
}

export default function Navbar({ onOpenDemo }: NavbarProps) {
  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-blue-600">W</span>
            <span className="text-xl font-semibold text-gray-900">WorkforcePro</span>
          </Link>

          {/* Links (Hidden on mobile) */}
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-gray-700 hover:text-blue-600 font-medium">
              Features
            </Link>
            <Link to="/#how-it-works" className="text-gray-700 hover:text-blue-600 font-medium">
              How it Works
            </Link>
            <Link to="/#pricing" className="text-gray-700 hover:text-blue-600 font-medium">
              Pricing
            </Link>
            {/* 👇 New prominent "For CA Partners" link */}
            <Link
              to="/partners"
              className="text-blue-600 font-semibold border border-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-50 transition"
            >
              For Partners
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-4">
            <a
              href="https://workforcepro-saas.web.app"
              className="text-gray-700 hover:text-blue-600 font-medium"
            >
              Login
            </a>
            <button
              onClick={onOpenDemo}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Book a Demo
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}