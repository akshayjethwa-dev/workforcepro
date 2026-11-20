interface NavbarProps {
  hasAnnouncement?: boolean;
  onOpenDemo: () => void;
}

export default function Navbar({ hasAnnouncement = false, onOpenDemo }: NavbarProps) {
  return (
    <nav
      className={`fixed w-full ${
        hasAnnouncement ? 'top-9' : 'top-0'
      } z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 transition-[top] duration-200`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-blue rounded-lg flex items-center justify-center text-white font-bold text-xl">
              W
            </div>
            <span className="font-bold text-xl text-brand-blue">WorkforcePro</span>
          </div>

          {/* Links (Hidden on mobile) */}
          <div className="hidden md:flex space-x-8">
            <a href="#features" className="text-slate-600 hover:text-brand-blue font-medium transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-slate-600 hover:text-brand-blue font-medium transition-colors">
              How it Works
            </a>
            <a href="#pricing" className="text-slate-600 hover:text-brand-blue font-medium transition-colors">
              Pricing
            </a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-4">
            <a
              href="https://workforcepro-saas.web.app"
              className="text-slate-600 hover:text-brand-blue font-medium transition-colors hidden sm:block"
            >
              Log In
            </a>
            <button
              type="button"
              onClick={onOpenDemo}
              className="bg-brand-blue hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm"
            >
              Book a Demo
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}