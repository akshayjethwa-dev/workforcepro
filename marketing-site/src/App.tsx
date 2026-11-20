import Navbar from './components/Navbar';
import Hero from './components/Hero';

function App() {
  return (
    <div className="min-h-screen font-sans">
      <Navbar />
      <main>
        <Hero />
        
        {/* Placeholder for the next sections we will build */}
        <section id="features" className="py-24 bg-white text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Features Section (Coming Next)</h2>
          <p className="text-slate-600">Geofencing, WhatsApp Punch, Automated PF/ESI...</p>
        </section>

        <section id="pricing" className="py-24 bg-slate-50 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Pricing Section (Coming Next)</h2>
          <p className="text-slate-600">Growth Plan, Pro Plan...</p>
        </section>
      </main>
      
      <footer className="bg-slate-900 text-slate-400 py-12 text-center">
        <p>© 2026 WorkforcePro. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;