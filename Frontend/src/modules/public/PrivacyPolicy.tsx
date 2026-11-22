import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, CheckCircle, FileText, Mail } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        
        {/* Navigation back */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        {/* Header */}
        <div className="border-b border-slate-200 pb-8 mb-8">
          <span className="text-xs font-mono uppercase tracking-widest text-blue-600 font-bold block mb-2">Legal Compliance</span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Compliant with the Digital Personal Data Protection (DPDP) Act, 2023 of India · Last updated November 2026
          </p>
        </div>

        {/* Core Principles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <Shield className="w-5 h-5 text-blue-600 mb-2" />
            <span className="text-xs font-bold text-slate-900 block">Parental Consent</span>
            <span className="text-xs text-slate-500 mt-1 block">Verifiable phone OTP verification for children under 18.</span>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <Lock className="w-5 h-5 text-indigo-600 mb-2" />
            <span className="text-xs font-bold text-slate-900 block">Data Minimization</span>
            <span className="text-xs text-slate-500 mt-1 block">Only 12 essential student fields. Aadhaar is strictly optional.</span>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <CheckCircle className="w-5 h-5 text-emerald-600 mb-2" />
            <span className="text-xs font-bold text-slate-900 block">No Data Reselling</span>
            <span className="text-xs text-slate-500 mt-1 block">Student records are never commercialized or shared with ad networks.</span>
          </div>
        </div>

        {/* Policy Body */}
        <div className="prose prose-slate max-w-none text-sm text-slate-700 space-y-6 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">1. Preamble & Scope</h2>
            <p>
              FutureSchool Technologies ("FutureSchool", "we", "us") provides a software platform for educational institutions in India. This policy explains how student, parent, and teacher personal data is collected, processed, and safeguarded in accordance with the <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> and applicable school board guidelines.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">2. Processing of Minor / Children's Data</h2>
            <p>
              Under Section 9 of the DPDP Act 2023, processing personal data of children requires verifiable consent from their parent or lawful guardian. FutureSchool enforces this by:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2 text-slate-600">
              <li>Requiring mobile number SMS OTP authentication before any parent account is provisioned.</li>
              <li>Ensuring student profiles are only accessible to verified parents, appointed class teachers, and the school administration.</li>
              <li>Prohibiting targeted advertisements, behavioral tracking, or psychological profiling of children.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">3. Information Collected (Lean Architecture)</h2>
            <p>
              We practice strict data minimization. The standard student record contains only:
            </p>
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 font-mono text-xs text-slate-800 my-2">
              Admission Number, Student Name, Grade/Class, Section, Roll Number, Date of Birth, Gender, Parent Mobile, Father Name, Mother Name, Blood Group, Annual Fee Bracket.
            </div>
            <p className="text-xs text-slate-500">
              National identity identifiers (such as Aadhaar numbers or government category certificates) are stored only when explicitly mandated by state scholarship schemes and are placed in an encrypted, permission-gated fold.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">4. Data Custodianship & Cloud Infrastructure</h2>
            <p>
              The respective school remains the sole <strong>Data Fiduciary</strong> of its student and institutional records. FutureSchool acts exclusively as the <strong>Data Processor</strong>. All data is encrypted in transit via TLS 1.3 and encrypted at rest using AES-256 in ISO-certified data centers located in India (GCP asia-south1 Mumbai / Delhi regions).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">5. Soft Deletion & Right to Erasure</h2>
            <p>
              When a student leaves or alumni records are archived, records are deactivated rather than permanently purged immediately to satisfy statutory state education audit mandates. School administrators can request formal de-identification or data exports at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">6. Grievance Redressal Officer</h2>
            <p>
              In accordance with the Indian Information Technology Rules and the DPDP Act 2023, the designated Grievance Officer is:
            </p>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 mt-2 text-xs text-slate-700">
              <span className="font-bold block">Grievance & Data Protection Officer</span>
              <span className="block mt-1">FutureSchool Technologies India Pvt. Ltd.</span>
              <span className="block text-slate-500">Email: <a href="mailto:grievance@futureschool.in" className="text-blue-600 underline">grievance@futureschool.in</a></span>
              <span className="block text-slate-500">Response timeframe: Within 72 business hours</span>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
          <span>© {new Date().getFullYear()} FutureSchool Technologies</span>
          <Link to="/terms" className="text-blue-600 hover:underline">Read Terms of Service →</Link>
        </div>

      </div>
    </div>
  );
};
