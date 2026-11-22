import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  BookOpenCheck,
  Bus,
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Fingerprint,
  Heart,
  IndianRupee,
  Layers,
  Lock,
  MessageSquare,
  MoveRight,
  Phone,
  Play,
  RotateCcw,
  School,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Ticket,
  Users,
  Zap
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  // Navigation & Filter state (Airbnb style)
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'parents' | 'teachers' | 'principals' | 'finance'>('all');
  
  // Interactive Live Simulator tab (Notion + Framer style)
  const [activeDemoTab, setActiveDemoTab] = useState<'parent' | 'teacher' | 'feeDesk' | 'busRadar'>('parent');

  // Interactive Onboarding preview step (Duolingo style)
  const [onboardStep, setOnboardStep] = useState<number>(1);
  const [schoolType, setSchoolType] = useState<string>('CBSE');
  const [studentTier, setStudentTier] = useState<number>(1200);

  // ROI Calculator state (Stripe style)
  const [calcStudents, setCalcStudents] = useState<number>(1500);

  // FAQ Accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white font-sans antialiased overflow-x-hidden">
      
      {/* =========================================================================
          1. STICKY FLOATING PILL NAVBAR (Airbnb + Linear)
         ========================================================================= */}
      <div className="fixed top-3 inset-x-0 z-50 px-4 pointer-events-none flex justify-center">
        <header className="pointer-events-auto w-full max-w-5xl rounded-full bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-lg shadow-slate-900/5 px-4 sm:px-6 py-2.5 flex items-center justify-between transition-all">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                FS
              </span>
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                Future<span className="text-amber-500">School</span>
              </span>
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              v2.5 Live
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#simulator" className="hover:text-slate-900 transition-colors">Interactive Demo</a>
            <a href="#onboarding" className="hover:text-slate-900 transition-colors">3-Min Onboarding</a>
            <a href="#calculator" className="hover:text-slate-900 transition-colors">ROI Impact</a>
            <a href="#ethics" className="hover:text-slate-900 transition-colors">DPDP & Privacy</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-all"
            >
              Sign In
            </Link>
            <a
              href="#simulator"
              className="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-slate-900 text-white hover:bg-blue-600 hover:shadow-md hover:shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>Explore Demo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>
      </div>

      {/* =========================================================================
          2. HERO SECTION (Stripe Gradient + Pentagram Typography + Apple Physics)
         ========================================================================= */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Ambient Gradient Glows (Stripe / Apple style) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-tr from-blue-400/20 via-indigo-300/15 to-transparent blur-3xl -z-10 pointer-events-none rounded-full" />
        <div className="absolute top-20 right-0 w-[450px] h-[450px] bg-amber-200/20 blur-3xl -z-10 pointer-events-none rounded-full" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Eyebrow badge (Linear style) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 mb-6 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Built for CBSE · ICSE · State Board High Schools</span>
          </motion.div>

          {/* Display Headline (Pentagram Editorial Typography) */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-slate-950 tracking-[-0.035em] leading-[1.08] max-w-4xl mx-auto"
          >
            The Operating System for{' '}
            <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
              Modern Indian Schools.
            </span>
          </motion.h1>

          {/* Subtitle (Muji clarity & Aesop dignity) */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal"
          >
            Zero friction for parents. Less screen time for teachers. Complete audit clarity for the principal. 
            From 10-second attendance to tamper-evident counter receipts.
          </motion.p>

          {/* Action Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <Link
              to="/login"
              className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 active:scale-95 transition-all flex items-center justify-center gap-2 group"
            >
              <span>Test Live Portal Now</span>
              <MoveRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#onboarding"
              className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm border border-slate-200/90 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>See 3-Min School Setup</span>
            </a>
          </motion.div>

          {/* Trust Metrics Bar (Linear precision badges) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-16 pt-8 border-t border-slate-200/60 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left"
          >
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">10 Sec</span>
              <span className="text-xs text-slate-500 font-medium mt-0.5">Morning Attendance per Class</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">₹0</span>
              <span className="text-xs text-slate-500 font-medium mt-0.5">Gateway Deductions on Counter Cash</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">4-Digit PIN</span>
              <span className="text-xs text-slate-500 font-medium mt-0.5">Instant Login on Trusted Devices</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">100% DPDP</span>
              <span className="text-xs text-slate-500 font-medium mt-0.5">Data Privacy Act 2023 Compliant</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* =========================================================================
          3. INTERACTIVE LIVE PRODUCT SIMULATOR (Notion + Framer Micro-interactions)
         ========================================================================= */}
      <section id="simulator" className="py-20 bg-slate-900 text-white relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-mono uppercase tracking-widest text-blue-400 font-semibold">Live Interactive Preview</span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
              Four tailored experiences. One unified engine.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-400">
              Click through each portal below to test the exact workflow built for parents, teachers, finance desks, and principals.
            </p>

            {/* Role Tab Selector (Airbnb style pill tabs) */}
            <div className="mt-8 inline-flex p-1 rounded-full bg-slate-800/90 border border-slate-700/80 shadow-inner">
              {[
                { id: 'parent', label: '👨‍👩‍👧 Parent App', tag: '2×2 Cards & Bus' },
                { id: 'teacher', label: '👩‍🏫 Teacher Portal', tag: '10s Register' },
                { id: 'feeDesk', label: '💳 Fee Desk', tag: 'Cash Counter' },
                { id: 'busRadar', label: '🚌 Bus Radar', tag: 'Live Tracking' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDemoTab(tab.id as any)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all relative ${
                    activeDemoTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Screen Frame (Apple Device Feel) */}
          <div className="max-w-4xl mx-auto rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden p-2 sm:p-4">
            <div className="rounded-2xl bg-slate-900 border border-slate-800/80 p-4 sm:p-6 min-h-[420px] flex flex-col justify-between">
              
              {/* Simulator Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="font-mono text-slate-500 ml-2">portal.futureschool.in/{activeDemoTab}</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Interactive Simulation</span>
                </div>
              </div>

              {/* Dynamic View Content based on Tab */}
              <div className="py-6 flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {activeDemoTab === 'parent' && (
                    <motion.div
                      key="parent"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 max-w-xl mx-auto w-full"
                    >
                      {/* Notice Banner */}
                      <div className="rounded-2xl bg-gradient-to-r from-rose-700 to-red-600 p-4 text-white shadow-lg">
                        <div className="flex items-center justify-between text-xs font-bold text-red-100">
                          <span>📢 SCHOOL NOTICE BOARD</span>
                          <span>Today · 08:30 AM</span>
                        </div>
                        <h4 className="mt-1 font-bold text-sm">Heavy rain alert: early dismissal today at 1:30 PM</h4>
                        <p className="text-xs text-red-100 mt-0.5">Buses will depart 2 hours ahead of schedule. Safe pickup verified.</p>
                      </div>

                      {/* 2x2 Quick Cards (The user's preferred layout!) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-800/90 border border-slate-700/80 p-3.5 flex flex-col justify-between hover:border-blue-500 transition-colors cursor-pointer">
                          <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                            <BookOpenCheck className="w-4 h-4" />
                          </span>
                          <div className="mt-3">
                            <span className="block text-xs font-bold text-white">Daily Homework</span>
                            <span className="text-[11px] text-amber-400 font-medium">2 pending tasks</span>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-800/90 border border-slate-700/80 p-3.5 flex flex-col justify-between hover:border-indigo-500 transition-colors cursor-pointer">
                          <span className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <IndianRupee className="w-4 h-4" />
                          </span>
                          <div className="mt-3">
                            <span className="block text-xs font-bold text-white">Fee Status</span>
                            <span className="text-[11px] text-emerald-400 font-medium">Term 2 Cleared ✓</span>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-800/90 border border-slate-700/80 p-3.5 flex flex-col justify-between hover:border-sky-500 transition-colors cursor-pointer">
                          <span className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                            <Ticket className="w-4 h-4" />
                          </span>
                          <div className="mt-3">
                            <span className="block text-xs font-bold text-white">Hall Ticket</span>
                            <span className="text-[11px] text-sky-400 font-medium">Ready to download</span>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-800/90 border border-slate-700/80 p-3.5 flex flex-col justify-between hover:border-emerald-500 transition-colors cursor-pointer">
                          <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <CalendarCheck className="w-4 h-4" />
                          </span>
                          <div className="mt-3">
                            <span className="block text-xs font-bold text-white">Attendance</span>
                            <span className="text-[11px] text-emerald-400 font-medium">94.2% present</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeDemoTab === 'teacher' && (
                    <motion.div
                      key="teacher"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 max-w-xl mx-auto w-full"
                    >
                      <div className="flex items-center justify-between bg-slate-800/70 p-3 rounded-xl border border-slate-700/70">
                        <div>
                          <span className="text-xs text-slate-400 font-mono">CLASS 9 - SECTION A</span>
                          <h4 className="text-sm font-bold text-white">Morning Attendance Register</h4>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                          38 / 40 Present
                        </span>
                      </div>

                      <div className="space-y-2">
                        {[
                          { roll: 1, name: 'Aarav Sharma', status: 'PRESENT', time: '08:15 AM' },
                          { roll: 2, name: 'Ananya Deshmukh', status: 'PRESENT', time: '08:14 AM' },
                          { roll: 3, name: 'Devendra Patel', status: 'ABSENT', time: 'Parent Notified' },
                          { roll: 4, name: 'Ishita Reddy', status: 'PRESENT', time: '08:19 AM' }
                        ].map(st => (
                          <div key={st.roll} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-slate-500 w-5">#{st.roll}</span>
                              <span className="font-semibold text-slate-200">{st.name}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              st.status === 'PRESENT' ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50' : 'bg-rose-900/60 text-rose-300 border border-rose-700/50'
                            }`}>
                              {st.status} ({st.time})
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {activeDemoTab === 'feeDesk' && (
                    <motion.div
                      key="feeDesk"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 max-w-xl mx-auto w-full"
                    >
                      <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-amber-400 uppercase">Tamper-Evident Counter Receipt</span>
                          <span className="text-xs text-slate-400">RCP-2026-0842</span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between border-b border-slate-700/80 pb-3">
                          <div>
                            <span className="text-xs text-slate-400 block">Student</span>
                            <span className="text-sm font-bold text-white">Rohan K. Varma (Class 10-B)</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Amount Collected</span>
                            <span className="text-lg font-extrabold text-emerald-400">₹24,500</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                          <span>Mode: Cash Counter (Cashier: Priya N.)</span>
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> SMS & WhatsApp Sent
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 text-center">
                        Zero 2% payment gateway cut. Instant printed duplicate with cryptographic verification.
                      </p>
                    </motion.div>
                  )}

                  {activeDemoTab === 'busRadar' && (
                    <motion.div
                      key="busRadar"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 max-w-xl mx-auto w-full"
                    >
                      <div className="rounded-2xl bg-slate-800/80 border border-slate-700 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bus className="w-5 h-5 text-amber-400" />
                            <span className="text-sm font-bold text-white">Route 04 · Jubilee Hills & Madhapur</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            LIVE RADAR
                          </span>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60">
                            <span className="text-slate-300">Next Stop: Road No. 36 Junction</span>
                            <span className="text-amber-400 font-bold">2.4 km (4 mins)</span>
                          </div>
                          <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60">
                            <span className="text-slate-300">Driver Contact</span>
                            <span className="text-slate-400 font-mono">Ramesh Kumar · +91 98490 XXXXX</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 text-center">
                        Drivers use a zero-login secure link on any phone. No expensive GPS hardware required.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Simulator CTA footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Ready to test in full screen?</span>
                <Link
                  to="/login"
                  className="font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 group"
                >
                  <span>Launch Live Full App</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. FOUR PILLARS FEATURE GRID (Linear Architecture + Apple Depth)
         ========================================================================= */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-blue-600 font-bold">Comprehensive Capabilities</span>
          <h2 className="mt-2 text-3xl sm:text-5xl font-extrabold text-slate-950 tracking-tight">
            Designed for truth, velocity, and calm.
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Every feature was built by watching real Indian teachers mark registers, office clerks count fees, and mothers check bus locations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pillar 1 */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-8 shadow-card hover:border-blue-300 transition-all">
            <span className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-6">
              <Fingerprint className="w-6 h-6" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">01 / PARENT ACCESSIBILITY</span>
            <h3 className="mt-1 text-xl font-bold text-slate-950">4-Digit PIN & Zero-Password Login</h3>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Parents never remember complex passwords. FutureSchool verifies their phone once via SMS OTP, then enables a lightning-fast 4-digit PIN for daily access on their trusted device.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Supports WhatsApp Cloud API alerts</span>
              <span className="font-semibold text-blue-600">5 languages</span>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-8 shadow-card hover:border-indigo-300 transition-all">
            <span className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-6">
              <Layers className="w-6 h-6" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">02 / ACADEMIC EXCELLENCE</span>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Swipeable Report Cards & NEP 2020 Rubrics</h3>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Say goodbye to ugly PDF tables. Parents swipe through subjects like stories, view class averages without toxic ranking, and receive teachers' personal remarks in clean typography.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Class teacher approval workflow</span>
              <span className="font-semibold text-indigo-600">Dual-key verification</span>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-8 shadow-card hover:border-emerald-300 transition-all">
            <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-6">
              <IndianRupee className="w-6 h-6" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">03 / CASH & COUNTER INTEGRITY</span>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Defalcation-Proof Counter Fee Desk</h3>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Parents pay at the counter; staff record cash, cheque, or UPI reference. The moment cash is received, an SMS confirmation pings the father, preventing any counter pilferage or record alteration.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Late fee waiver audit logs</span>
              <span className="font-semibold text-emerald-600">Zero 2% gateway loss</span>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-8 shadow-card hover:border-amber-300 transition-all">
            <span className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-6">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">04 / CHILD SAFETY & PROTOCOL</span>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Guardian Authorization & Driver Radar</h3>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Emergency school pickup requires an instant step-up PIN authorization from the registered guardian with photo verification. Bus drivers transmit live GPS via a lightweight web link.
            </p>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Driver token unguessable hashes</span>
              <span className="font-semibold text-amber-600">No hardware GPS box needed</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. BITE-SIZED ONBOARDING TOUR (Duolingo Style)
         ========================================================================= */}
      <section id="onboarding" className="py-20 bg-gradient-to-b from-slate-100/60 to-white border-y border-slate-200/70">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-600 font-bold">Zero Setup Friction</span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Onboard your entire school in 3 minutes.
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Traditional ERPs take 6 weeks of painful training. FutureSchool is so intuitive your teachers will master it in their morning staff briefing.
          </p>

          {/* Stepper Progress (Duolingo style) */}
          <div className="mt-10 flex items-center justify-center gap-3">
            {[1, 2, 3].map(step => (
              <button
                key={step}
                onClick={() => setOnboardStep(step)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  onboardStep === step
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-105'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                  onboardStep === step ? 'bg-white text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {step}
                </span>
                <span>
                  {step === 1 ? 'Lean 12-Field Import' : step === 2 ? 'Assign Teachers' : 'Auto-Magic Magic Link'}
                </span>
              </button>
            ))}
          </div>

          {/* Step Card */}
          <div className="mt-8 rounded-3xl bg-white border border-slate-200 shadow-xl p-6 sm:p-8 text-left max-w-2xl mx-auto">
            {onboardStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-base">Step 1: Lean Student Profile Setup</h4>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    No intrusive data
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  We collect only 12 essential fields (Admission No, Name, Class, Roll, Parent Mobile, Fee). Aadhaar and government schemes are placed in a strictly optional fold to respect family privacy.
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-600 font-mono">
                  admissionNumber, name, class, section, roll, dob, gender, parentMobile, fatherName, motherName, bloodGroup, annualFee
                </div>
                <button
                  onClick={() => setOnboardStep(2)}
                  className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <span>Next: Assign Teachers</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {onboardStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-base">Step 2: 1-Click Class Allocations</h4>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Automatic Timetable
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Designate Class Teachers and Subject Teachers. The system instantly creates their daily attendance registers and timetable slots with zero manual database entries.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Maths Teacher</span>
                    <span className="font-bold text-slate-800">S. Sundaram (Class 10-A)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Science Teacher</span>
                    <span className="font-bold text-slate-800">P. K. Verma (Class 9-B)</span>
                  </div>
                </div>
                <button
                  onClick={() => setOnboardStep(3)}
                  className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <span>Next: Send Auto-Magic Invitations</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {onboardStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-base">Step 3: Instant School Rollout</h4>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Ready to Go
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  FutureSchool dispatches one SMS to each parent with a secure link. Parents click once, choose their 4-digit PIN, and can immediately view homework and pay fees.
                </p>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>2,000 parents onboarded within 24 hours of school term opening.</span>
                </div>
                <button
                  onClick={() => setOnboardStep(1)}
                  className="mt-2 text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start over</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. ART DIRECTION & PHILOSOPHY (Aesop Dignity + Muji Minimalism)
         ========================================================================= */}
      <section id="ethics" className="py-24 bg-[#fbf9f5] border-b border-stone-200 text-stone-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border-l-2 border-stone-400 pl-6 sm:pl-10 space-y-4">
            <span className="font-mono text-xs uppercase tracking-widest text-stone-500">Design Philosophy & Ethics</span>
            <blockquote className="text-2xl sm:text-3xl font-serif text-stone-900 leading-relaxed italic">
              "A school is not a tech startup. It is a quiet, sacred sanctuary where childhood unfolds and values are forged. Its software should reflect that serenity."
            </blockquote>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
              We reject predatory leaderboard rankings that shame children. We reject invasive biometric surveillance that treats schools like prisons. We build calm, dignified digital tools that give time back to teaching.
            </p>
            <div className="pt-2 flex items-center gap-6 text-xs text-stone-500 font-mono">
              <span>● NO ADVERTISEMENTS</span>
              <span>● NO STUDENT DATA RESELLING</span>
              <span>● NO GAMIFIED TOXICITY</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. ROI IMPACT CALCULATOR (Stripe Style)
         ========================================================================= */}
      <section id="calculator" className="py-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl">
            <span className="text-xs font-mono uppercase tracking-widest text-blue-400 font-bold">Institutional Impact</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Calculate your school's annual time & cost savings</h2>
            <p className="mt-2 text-sm text-slate-400">
              Drag the slider to see how much administrative waste FutureSchool eliminates for your student count.
            </p>

            {/* Slider */}
            <div className="mt-8 space-y-2">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Total Student Enrollment:</span>
                <span className="text-xl font-extrabold text-blue-400 font-mono">{calcStudents.toLocaleString()} Students</span>
              </div>
              <input
                type="range"
                min={200}
                max={5000}
                step={100}
                value={calcStudents}
                onChange={e => setCalcStudents(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>200 (Single Campus)</span>
                <span>2,500 (Large High School)</span>
                <span>5,000+ (Multi-Branch)</span>
              </div>
            </div>

            {/* Metrics Output */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800">
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block">Teacher Hours Saved / Mo</span>
                <span className="text-2xl font-extrabold text-white mt-1 block">
                  {Math.round(calcStudents * 0.12).toLocaleString()} hrs
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">Zero manual attendance tallying</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block">Paper Reams Saved / Year</span>
                <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">
                  {Math.round(calcStudents * 0.28).toLocaleString()} reams
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">Digital report cards & receipts</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block">Gateway Fees Avoided</span>
                <span className="text-2xl font-extrabold text-amber-400 mt-1 block">
                  ₹{Math.round(calcStudents * 650).toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">Counter cash & direct UPI ledger</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FREQUENTLY ASKED QUESTIONS (Framer Accordion)
         ========================================================================= */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-mono uppercase tracking-widest text-blue-600 font-bold">Clear Answers</span>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-950 tracking-tight">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-3">
          {[
            {
              q: 'Can FutureSchool run without an active internet connection in rural schools?',
              a: 'Yes. The parent and teacher applications support local client caching. Teachers can take morning attendance and submit marks offline; all records synchronize seamlessly as soon as mobile connectivity returns.'
            },
            {
              q: 'Does FutureSchool comply with the Indian Digital Personal Data Protection (DPDP) Act 2023?',
              a: 'Strictly. We enforce verifiable parental consent for students under 18, practice strict data minimization (Aadhaar is never required), and provide full audit logging with zero student profile reselling.'
            },
            {
              q: 'How do parents sign in if they do not have email addresses?',
              a: 'Over 95% of parents in India use mobile numbers. FutureSchool uses a mobile number + SMS OTP system. Once signed in, parents set a simple 4-digit PIN for instant daily access on their smartphone.'
            },
            {
              q: 'Can we retain our existing counter cash collection process for fees?',
              a: 'Absolutely. FutureSchool is built specifically for Indian school realities. Our Counter Fee Desk allows clerks to record cash, cheque, or UPI transactions, generate signed duplicates, and automatically trigger instant SMS receipts to parents.'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full px-6 py-4 text-left font-bold text-slate-900 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-sm sm:text-base"
              >
                <span>{item.q}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === idx ? 'rotate-90' : ''}`} />
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-4 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          9. CALL TO ACTION & FOOTER (Linear Obsidian + Pentagram Editorial)
         ========================================================================= */}
      <footer className="bg-slate-950 text-white pt-20 pb-12 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Main CTA banner */}
          <div className="rounded-3xl bg-gradient-to-r from-blue-900/60 via-indigo-900/60 to-slate-900 border border-blue-500/30 p-8 sm:p-12 mb-16 text-center max-w-4xl mx-auto shadow-2xl">
            <h3 className="text-2xl sm:text-4xl font-extrabold tracking-tight">Ready to modernize your school?</h3>
            <p className="mt-3 text-slate-300 text-sm sm:text-base max-w-xl mx-auto">
              Join leading CBSE, ICSE, and State Board schools. Test our live demo portal right now with zero setup.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Launch Live Portal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/privacy"
                className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 transition-all"
              >
                <span>Read DPDP Privacy Policy</span>
              </Link>
            </div>
          </div>

          {/* Links Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 text-xs">
            <div>
              <span className="font-bold text-slate-200 uppercase tracking-wider block mb-3 font-mono">Portals</span>
              <ul className="space-y-2 text-slate-400">
                <li><Link to="/login" className="hover:text-white transition-colors">Parent Portal</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Teacher Register</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Principal Dashboard</Link></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Fee Desk Counter</Link></li>
              </ul>
            </div>

            <div>
              <span className="font-bold text-slate-200 uppercase tracking-wider block mb-3 font-mono">Legal & Compliance</span>
              <ul className="space-y-2 text-slate-400">
                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy (DPDP 2023)</Link></li>
                <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><span className="text-slate-500">Student Minor Data Rights</span></li>
                <li><span className="text-slate-500">Grievance Redressal</span></li>
              </ul>
            </div>

            <div>
              <span className="font-bold text-slate-200 uppercase tracking-wider block mb-3 font-mono">Affiliations</span>
              <ul className="space-y-2 text-slate-400">
                <li><span className="text-slate-500">CBSE Curriculum Aligned</span></li>
                <li><span className="text-slate-500">ICSE Standards</span></li>
                <li><span className="text-slate-500">State Board Compliant</span></li>
                <li><span className="text-slate-500">NEP 2020 Holistic Cards</span></li>
              </ul>
            </div>

            <div>
              <span className="font-bold text-slate-200 uppercase tracking-wider block mb-3 font-mono">System Status</span>
              <div className="space-y-2 text-slate-400">
                <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  All Cloud Systems Operational
                </span>
                <span className="block text-slate-500">99.98% SLA Availability</span>
                <span className="block text-slate-500 font-mono">Build v2.5.0-cloud</span>
              </div>
            </div>
          </div>

          {/* Bottom attribution */}
          <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">FutureSchool</span>
              <span>© {new Date().getFullYear()} FutureSchool Technologies. Crafted for Indian High Schools.</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
              <Link to="/login" className="hover:text-slate-300 transition-colors">Sign In</Link>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
};
