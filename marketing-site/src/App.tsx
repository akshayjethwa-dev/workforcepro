import { useState } from 'react';
import AnnouncementBar from './components/AnnouncementBar';
import Navbar from './components/Navbar';
import DemoModal from './components/DemoModal';
import Hero from './components/Hero';
import ProblemSection from './components/ProblemSection';
import SolutionSection from './components/SolutionSection';
import FeaturesSection from './components/FeaturesSection';
import HowItWorksSection from './components/HowItWorksSection';
import ResultsSection from './components/ResultsSection';
import SecurityComplianceSection from './components/SecurityComplianceSection';
import TestimonialsSection from './components/TestimonialsSection';
import ComparisonSection from './components/ComparisonSection';
import PricingSection from './components/PricingSection';
import FaqSection from './components/FaqSection';
import FinalCtaSection from './components/FinalCtaSection';
import Footer from './components/Footer';

const ANNOUNCEMENT_DISMISSED_KEY = 'workforcepro_announcement_dismissed_v1';

function getInitialDismissedState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function App() {
  const [isDismissed, setIsDismissed] = useState<boolean>(getInitialDismissedState);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  const handleDismissAnnouncement = () => {
    setIsDismissed(true);
    try {
      window.localStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, 'true');
    } catch {
      // Ignore storage quota or private-mode errors
    }
  };

  const showAnnouncement = !isDismissed;

  return (
    <div className="min-h-screen font-sans">
      {showAnnouncement && <AnnouncementBar onDismiss={handleDismissAnnouncement} />}
      <Navbar hasAnnouncement={showAnnouncement} onOpenDemo={() => setIsDemoOpen(true)} />
      <main className={showAnnouncement ? 'pt-9' : ''}>
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ResultsSection />
        <SecurityComplianceSection />
        <TestimonialsSection />
        <ComparisonSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  );
}

export default App;