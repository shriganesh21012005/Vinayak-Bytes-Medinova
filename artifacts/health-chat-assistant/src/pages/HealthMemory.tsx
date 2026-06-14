import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, AlertTriangle, Activity, Pill, Syringe,
  ShieldAlert, Zap, FileText, RefreshCw, Upload, CheckCircle, HelpCircle, Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import NavigationHeader from '@/components/NavigationHeader';
import MouseFollower from '@/components/MouseFollower';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface MemoryItem {
  value: string;
  sourceCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  sourceRecordIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

interface MedicationItem {
  name: string;
  dosage: string | null;
  frequency: string | null;
  confidence: 'verified' | 'unverified';
  sourceCount?: number;
  lastSeen?: string;
  sourceRecordIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

interface HealthMemoryData {
  exists: boolean;
  allergies: MemoryItem[];
  chronicConditions: MemoryItem[];
  surgeries: MemoryItem[];
  medicationRestrictions: MemoryItem[];
  criticalEvents: MemoryItem[];
  currentMedications: MedicationItem[];
  unverifiedMedications: MedicationItem[];
  condensedProfile: string;
  recordCount: number;
  lastUpdatedAt: string | null;
}

const SECTION_CONFIG = [
  {
    key: 'allergies' as const,
    label: 'Allergies',
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
    emptyText: 'No allergies documented',
  },
  {
    key: 'chronicConditions' as const,
    label: 'Chronic Conditions',
    icon: Activity,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    emptyText: 'No chronic conditions documented',
  },
  {
    key: 'surgeries' as const,
    label: 'Surgeries & Procedures',
    icon: Syringe,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    emptyText: 'No surgeries documented',
  },
  {
    key: 'medicationRestrictions' as const,
    label: 'Medication Restrictions',
    icon: ShieldAlert,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    emptyText: 'No restrictions documented',
  },
  {
    key: 'criticalEvents' as const,
    label: 'Critical Events',
    icon: Zap,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    emptyText: 'No critical events documented',
  },
];

function ConfidenceBadge({ count }: { count: number }) {
  if (count >= 2) {
    return (
      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        <CheckCircle className="h-3 w-3" />
        Confirmed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 whitespace-nowrap">
      <Clock className="h-3 w-3" />
      Tentative
    </span>
  );
}

function MemoryItemCard({
  item,
  bg,
  border,
}: {
  item: MemoryItem;
  bg: string;
  border: string;
}) {
  const count = item.sourceRecordIds?.length ?? item.sourceCount ?? 0;
  return (
    <div className={`p-3 rounded-lg ${bg} border ${border}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm text-white flex-1">{item.value}</p>
        <ConfidenceBadge count={count} />
      </div>
      {count > 0 && (
        <p className="text-xs text-white/30 mt-1">Seen in {count} record(s)</p>
      )}
    </div>
  );
}

function MedicationCard({
  med,
  bg,
  border,
}: {
  med: MedicationItem;
  bg: string;
  border: string;
}) {
  const count = med.sourceRecordIds?.length ?? med.sourceCount;
  const isVerified = med.confidence === 'verified';

  return (
    <div className={`p-3 rounded-lg ${bg} border ${border} space-y-1.5`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-white flex-1">{med.name}</p>
        {isVerified ? (
          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="h-3 w-3" />
            verified
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
            <HelpCircle className="h-3 w-3" />
            unverified
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {med.dosage && (
          <span className="text-xs px-2 py-0.5 rounded bg-medical/10 text-medical border border-medical/20">
            {med.dosage}
          </span>
        )}
        {med.frequency && (
          <span className="text-xs text-white/50">{med.frequency}</span>
        )}
      </div>
      {count != null && count > 0 && (
        <p className="text-xs text-white/30">Seen in {count} record(s)</p>
      )}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  label,
  color,
  bg,
  border,
  badgeClass,
  emptyText,
  items,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  border: string;
  badgeClass: string;
  emptyText: string;
  items: MemoryItem[];
}) {
  return (
    <Card className="glass-card border border-white/10 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
          <div className={`p-1.5 rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          {label}
          <Badge className={`ml-auto text-xs border ${badgeClass}`}>
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-xs text-white/40 italic">{emptyText}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <MemoryItemCard key={i} item={item} bg={bg} border={border} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MedicationsCard({
  currentMedications,
  unverifiedMedications,
}: {
  currentMedications: MedicationItem[];
  unverifiedMedications: MedicationItem[];
}) {
  const total = currentMedications.length + unverifiedMedications.length;
  const bg = 'bg-green-500/10';
  const border = 'border-green-500/20';

  return (
    <Card className="glass-card border border-white/10 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
          <div className="p-1.5 rounded-lg bg-green-500/10">
            <Pill className="h-4 w-4 text-green-400" />
          </div>
          Current Medications
          <Badge className="ml-auto text-xs border bg-green-500/20 text-green-300 border-green-500/30">
            {total}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="text-xs text-white/40 italic">No medications documented</p>
        ) : (
          <div className="space-y-2">
            {currentMedications.length > 0 && (
              <>
                {currentMedications.length > 0 && unverifiedMedications.length > 0 && (
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Verified</p>
                )}
                {currentMedications.map((med, i) => (
                  <MedicationCard key={`v-${i}`} med={med} bg={bg} border={border} />
                ))}
              </>
            )}
            {unverifiedMedications.length > 0 && (
              <>
                {currentMedications.length > 0 && (
                  <p className="text-xs text-white/40 uppercase tracking-wider mt-3 mb-1">Needs Review</p>
                )}
                {unverifiedMedications.map((med, i) => (
                  <MedicationCard key={`u-${i}`} med={med} bg="bg-amber-500/5" border="border-amber-500/15" />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const HealthMemoryPage = () => {
  const { accessToken, refreshAccessToken } = useAuth();
  const [data, setData] = useState<HealthMemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    let token = accessToken;
    if (!token) token = await refreshAccessToken();
    return token;
  }, [accessToken, refreshAccessToken]);

  const fetchMemory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError('Please log in to view your health memory.'); return; }

      const res = await fetch('/api/memory', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? 'Failed to load health memory.');
        return;
      }

      const json = await res.json() as HealthMemoryData;
      setData(json);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => { fetchMemory(); }, [fetchMemory]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') fetchMemory(true);
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', () => fetchMemory(true));
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [fetchMemory]);

  useEffect(() => { document.title = 'My Health Memory — MediNova'; }, []);

  const totalMedications = data
    ? data.currentMedications.length + data.unverifiedMedications.length
    : 0;

  const totalSignals = data
    ? data.allergies.length +
      data.chronicConditions.length +
      totalMedications +
      data.surgeries.length +
      data.medicationRestrictions.length +
      data.criticalEvents.length
    : 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(0,180,216,0.08),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(59,130,246,0.06),_transparent_60%)]" />
      </div>

      <MouseFollower />
      <NavigationHeader />

      <div className="container mx-auto px-4 pt-24 pb-16 relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-medical/10 border border-medical/20">
                  <Brain className="h-6 w-6 text-medical" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold shimmer-text">
                  My Health Memory
                </h1>
                {refreshing && (
                  <RefreshCw className="h-4 w-4 text-white/30 animate-spin" />
                )}
              </div>
              <p className="text-white/60 max-w-2xl mt-2">
                Your personal health memory is automatically built from every prescription and
                medical record you upload. It tracks your allergies, conditions, medications,
                and critical health events over time.
              </p>
            </div>
          </div>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-medical border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 p-5 rounded-xl bg-red-500/10 border border-red-500/20 max-w-xl"
          >
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">{error}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchMemory()}
                className="mt-2 text-red-400 hover:text-red-300 px-0 h-auto"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try again
              </Button>
            </div>
          </motion.div>
        )}

        {!loading && !error && data && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            >
              {[
                { label: 'Records Processed', value: data.recordCount, icon: FileText, color: 'text-medical' },
                { label: 'Health Signals', value: totalSignals, icon: Brain, color: 'text-blue-400' },
                { label: 'Medications', value: totalMedications, icon: Pill, color: 'text-green-400' },
                { label: 'Allergies', value: data.allergies.length, icon: AlertTriangle, color: 'text-red-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="glass-card border border-white/10">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${color} shrink-0`} />
                    <div>
                      <p className="text-2xl font-bold text-white">{value}</p>
                      <p className="text-xs text-white/50">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {!data.exists || totalSignals === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="glass-card border border-white/10">
                  <CardContent className="p-10 flex flex-col items-center text-center gap-4">
                    <div className="p-4 rounded-full bg-medical/10 border border-medical/20">
                      <Brain className="h-10 w-10 text-medical" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-2">
                        Your health memory is empty
                      </h2>
                      <p className="text-white/50 max-w-md">
                        Upload a prescription or medical record to begin building your personal
                        health memory. MediNova will automatically extract and organize your
                        health information.
                      </p>
                    </div>
                    <Link to="/medicare">
                      <Button className="bg-medical hover:bg-medical/80 text-white">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload a Prescription
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {data.condensedProfile && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <Card className="glass-card border border-medical/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                          <div className="p-1.5 rounded-lg bg-medical/10">
                            <FileText className="h-4 w-4 text-medical" />
                          </div>
                          Clinical Overview
                          {data.lastUpdatedAt && (
                            <span className="ml-auto text-xs text-white/40 font-normal">
                              Updated {new Date(data.lastUpdatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <pre className="text-xs text-white/70 font-mono whitespace-pre-wrap leading-relaxed bg-white/5 rounded-lg p-4 border border-white/10 overflow-x-auto">
                          {data.condensedProfile}
                        </pre>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <MedicationsCard
                    currentMedications={data.currentMedications}
                    unverifiedMedications={data.unverifiedMedications}
                  />
                  {SECTION_CONFIG.map((section) => {
                    const items = data[section.key] as MemoryItem[];
                    return (
                      <SectionCard
                        key={section.key}
                        icon={section.icon}
                        label={section.label}
                        color={section.color}
                        bg={section.bg}
                        border={section.border}
                        badgeClass={section.badgeClass}
                        emptyText={section.emptyText}
                        items={items}
                      />
                    );
                  })}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="flex gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/15"
                >
                  <ShieldAlert className="h-4 w-4 text-yellow-400/70 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/40">
                    This health memory is automatically extracted from uploaded documents using
                    rule-based analysis. Unverified medications are flagged for review and may
                    contain OCR errors. This is for personal reference only and does not constitute
                    medical advice. Always consult a qualified healthcare provider.
                  </p>
                </motion.div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HealthMemoryPage;
