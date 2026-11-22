import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ShieldAlert } from 'lucide-react';

export const TermsOfService: React.FC = () => {
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
          <span className="text-xs font-mono uppercase tracking-widest text-blue-600 font-bold block mb-2">Institutional Agreement</span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Standard Software-as-a-Service (SaaS) Agreement for Schools & Educational Trusts · Last updated November 2026
          </p>
        </div>

        {/* Key Guarantees */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm mb-10 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Key Institutional Commitments:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>School owns 100% of all student, fee, and academic data.</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>99.9% Core Service Level Agreement (SLA).</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>No mandatory long-term lock-in or proprietary data traps.</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Full compliance with Indian educational board directives.</span>
            </div>
          </div>
        </div>

        {/* Terms Body */}
        <div className="prose prose-slate max-w-none text-sm text-slate-700 space-y-6 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">1. Subscription & License Grant</h2>
            <p>
              FutureSchool Technologies grants the subscribed school, its authorized administrators, teachers, parents, and students a non-exclusive, non-transferable right to access and use the platform in accordance with the subscribed student volume tier.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">2. Fee Counter Desk & Financial Transactions</h2>
            <p>
              FutureSchool provides record-keeping, receipt issuance, and ledger synchronization tools. When counter cash, cheque, or external UPI payments are recorded, FutureSchool acts solely as an audit logging tool. The school administration remains responsible for actual bank reconciliations and physical custody of cash collections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">3. Role-Based Access & Audit Safeguards</h2>
            <p>
              Administrative actions (such as marks corrections after publishing, teacher substitutions, fee concessions, and student deactivations) are governed by dual-key approval workflows. Schools are responsible for ensuring authorized personnel maintain credential confidentiality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">4. Uptime & Maintenance</h2>
            <p>
              Scheduled maintenance windows are carried out outside of core school operating hours (typically 11:00 PM to 04:00 AM IST) with advance notice posted to the administrative dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-950 mb-2">5. Governing Law & Dispute Resolution</h2>
            <p>
              These terms are governed by the laws of India. Any disputes arising in connection with the platform shall be subject to the exclusive jurisdiction of the courts of Hyderabad / Bengaluru, India.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
          <span>© {new Date().getFullYear()} FutureSchool Technologies</span>
          <Link to="/privacy" className="text-blue-600 hover:underline">Read Privacy Policy →</Link>
        </div>

      </div>
    </div>
  );
};
