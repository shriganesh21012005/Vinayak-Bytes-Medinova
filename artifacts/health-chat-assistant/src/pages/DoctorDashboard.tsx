import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/apiBase';
import { motion } from 'framer-motion';
import {
  User, AlertTriangle, Activity, Pill, ShieldAlert,
  Clock, FileText, Zap, Heart, Thermometer, ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import NavigationHeader from '@/components/NavigationHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

interface ClinicalMedication {
  name: string;
  dosage?: string;
  frequency?: string;
  confidence: string;
}

interface ClinicalSummary {
  majorAllergies: string[];
  chronicConditions: string[];
  medicalEvents: string[];
  medications: ClinicalMedication[];
  criticalHealthRisks: string[];
  importantRestrictions: string[];
  generatedAt: string;
}

const RISK_RULES: Array<{ match: string; label: string; color: string; icon: React.FC<{ className?: string }> }> = [
  { match: 'diabetes', label: 'Glucose Monitoring Required', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: Thermometer },
  { match: 'hypertension', label: 'BP Monitoring Required', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: Heart },
  { match: 'heart', label: 'Cardiac Watch Required', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', icon: Heart },
  { match: 'asthma', label: 'Respiratory Monitoring Required', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', icon: Activity },
  { match: 'kidney', label: 'Renal Function Check Required', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', icon: Activity },
  { match: 'thyroid', label: 'Thyroid Panel Required', color: 'text-teal-400 bg-teal-500/10 border-teal-500/30', icon: Zap },
];

const BAR_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fb923c', '#f472b6', '#a78bfa'];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4 } }),
};

export default function DoctorDashboard() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<ClinicalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Doctor Dashboard — MediNova';
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetch(`${API_BASE}/clinical-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(data => {
        setSummary(data.summary ?? null);
        setError(null);
      })
      .catch(() => setError('Failed to load clinical summary.'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const activeRiskFlags = summary
    ? RISK_RULES.filter(rule =>
        summary.chronicConditions.some(c => c.toLowerCase().includes(rule.match)) ||
        (summary.criticalHealthRisks ?? []).some((r: string) => r.toLowerCase().includes(rule.match))
      )
    : [];

  const polypharmacy =
    summary && summary.medications.length >= 5
      ? { label: 'Polypharmacy Alert (≥5 medications)', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', icon: Pill }
      : null;

  const chartData = summary?.medications.slice(0, 8).map((m, i) => ({
    name: m.name.length > 12 ? m.name.slice(0, 12) + '…' : m.name,
    fullName: m.name,
    count: m.confidence === 'verified' ? 2 : 1,
    color: BAR_COLORS[i % BAR_COLORS.length],
  })) ?? [];

  const timelineEvents: Array<{ label: string; time: string; icon: React.FC<{ className?: string }> }> = [
    ...(summary?.medications ?? []).slice(0, 3).map(m => ({
      label: `Medication detected: ${m.name}${m.dosage ? ` ${m.dosage}` : ''}`,
      time: 'From uploaded records',
      icon: Pill,
    })),
    ...(summary?.chronicConditions ?? []).slice(0, 2).map(c => ({
      label: `Condition noted: ${c}`,
      time: 'From uploaded records',
      icon: Activity,
    })),
    ...(summary?.majorAllergies ?? []).slice(0, 2).map(a => ({
      label: `Allergy flagged: ${a}`,
      time: 'From uploaded records',
      icon: AlertTriangle,
    })),
    ...(summary?.medicalEvents ?? []).slice(0, 2).map(e => ({
      label: `Medical event: ${e}`,
      time: 'From uploaded records',
      icon: Zap,
    })),
  ];

  const hasData = summary && (
    summary.majorAllergies.length > 0 ||
    summary.chronicConditions.length > 0 ||
    summary.medications.length > 0
  );

  return (
    <div className="min-h-screen bg-[#050a15] text-white">
      <NavigationHeader />

      <div className="max-w-6xl mx-auto px-4 pt-28 pb-16 space-y-6">

        {/* Page title */}
        <motion.div initial="hidden" animate="show" custom={0} variants={fadeUp}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Doctor Dashboard</h1>
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">Clinical View</Badge>
          </div>
          <p className="text-slate-400 text-sm pl-11">Structured patient snapshot — for contextual understanding only. Not a diagnostic tool.</p>
        </motion.div>

        {/* Patient header card */}
        <motion.div initial="hidden" animate="show" custom={1} variants={fadeUp}>
          <Card className="bg-white/5 border-white/10 backdrop-blur-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 border border-white/10 flex items-center justify-center text-2xl font-bold text-blue-300">
                  {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white">{user?.name ?? 'Patient'}</h2>
                  <p className="text-slate-400 text-sm">{user?.email ?? '—'}</p>
                  {user?.bloodGroup && (
                    <Badge className="mt-1 bg-red-500/20 text-red-300 border-red-500/30 text-xs">
                      Blood Group: {user.bloodGroup}
                    </Badge>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center gap-2 text-sm text-slate-300 justify-end">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>{summary ? `${summary.medications.length + summary.chronicConditions.length + summary.majorAllergies.length} data points` : '—'}</span>
                  </div>
                  {summary?.generatedAt && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 justify-end">
                      <Clock className="w-3 h-3" />
                      <span>Updated {new Date(summary.generatedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
            Loading clinical summary…
          </div>
        )}

        {error && (
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4 text-red-300 text-sm">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && !hasData && (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-8 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No medical records uploaded yet.</p>
              <p className="text-xs mt-1">Upload prescriptions in My Health to populate this dashboard.</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && hasData && (
          <>
            {/* Medical summary panel */}
            <motion.div initial="hidden" animate="show" custom={2} variants={fadeUp}>
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Medical Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Allergies */}
                  <SummarySection
                    label="Major Allergies"
                    icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
                    items={summary!.majorAllergies}
                    badgeClass="bg-red-500/20 text-red-300 border-red-500/30"
                    empty="None documented"
                  />
                  {/* Conditions */}
                  <SummarySection
                    label="Chronic Conditions"
                    icon={<Heart className="w-4 h-4 text-rose-400" />}
                    items={summary!.chronicConditions}
                    badgeClass="bg-rose-500/20 text-rose-300 border-rose-500/30"
                    empty="None documented"
                  />
                  {/* Medications */}
                  <div className="md:col-span-2">
                    <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-blue-400" /> Medications
                    </p>
                    {summary!.medications.length === 0 ? (
                      <p className="text-slate-500 text-xs">None documented</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {summary!.medications.map((m, i) => (
                          <Badge
                            key={i}
                            className={`text-xs ${m.confidence === 'verified' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}
                          >
                            {m.name}{m.dosage ? ` ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}
                            {m.confidence === 'unverified' && <span className="ml-1 opacity-60">(unverified)</span>}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Medical events */}
                  {summary!.medicalEvents.length > 0 && (
                    <SummarySection
                      label="Medical Events & Surgeries"
                      icon={<Zap className="w-4 h-4 text-amber-400" />}
                      items={summary!.medicalEvents}
                      badgeClass="bg-amber-500/20 text-amber-300 border-amber-500/30"
                      empty="None documented"
                    />
                  )}
                  {/* Restrictions */}
                  {summary!.importantRestrictions.length > 0 && (
                    <SummarySection
                      label="Restrictions"
                      icon={<ShieldAlert className="w-4 h-4 text-purple-400" />}
                      items={summary!.importantRestrictions}
                      badgeClass="bg-purple-500/20 text-purple-300 border-purple-500/30"
                      empty="None documented"
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Risk flags panel */}
            {(activeRiskFlags.length > 0 || polypharmacy) && (
              <motion.div initial="hidden" animate="show" custom={3} variants={fadeUp}>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      Clinical Risk Flags
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">UI-derived · not AI</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    {activeRiskFlags.map((flag, i) => (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${flag.color}`}>
                        <flag.icon className="w-4 h-4" />
                        {flag.label}
                      </div>
                    ))}
                    {polypharmacy && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${polypharmacy.color}`}>
                        <polypharmacy.icon className="w-4 h-4" />
                        {polypharmacy.label}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Medication chart */}
            {chartData.length > 0 && (
              <motion.div initial="hidden" animate="show" custom={4} variants={fadeUp}>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                      <Pill className="w-4 h-4 text-blue-400" />
                      Medication Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                          formatter={(value: number, _: string, entry: { payload?: { fullName?: string } }) => [entry.payload?.fullName ?? '', '']}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 text-center mt-1">Verified = 2 · Unverified = 1</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Health history timeline */}
            {timelineEvents.length > 0 && (
              <motion.div initial="hidden" animate="show" custom={5} variants={fadeUp}>
                <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      Health History Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative pl-4 space-y-0">
                      <div className="absolute left-4 top-2 bottom-2 w-px bg-white/10" />
                      {timelineEvents.map((event, i) => (
                        <div key={i} className="relative flex items-start gap-3 pb-5">
                          <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500/60 border border-blue-400/40" />
                          <div className="pl-4">
                            <p className="text-sm text-slate-200 flex items-center gap-2">
                              <event.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {event.label}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">{event.time}</p>
                          </div>
                          {i < timelineEvents.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-slate-700 absolute right-0 top-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummarySection({
  label, icon, items, badgeClass, empty,
}: {
  label: string;
  icon: React.ReactNode;
  items: string[];
  badgeClass: string;
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
        {icon} {label}
      </p>
      {items.length === 0 ? (
        <p className="text-slate-500 text-xs">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <Badge key={i} className={`text-xs ${badgeClass}`}>{item}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
