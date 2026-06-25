import React, { useState } from 'react';
import { API_BASE } from '@/lib/apiBase';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText, Image, ChevronDown, ChevronUp, Shield, AlertTriangle,
  CheckCircle, XCircle, Clock, Trash2, ExternalLink,
} from 'lucide-react';

interface Medicine {
  name: string;
  nameConfidence: 'high' | 'medium' | 'low' | 'unverified';
  dosage?: string;
  frequency?: string;
  duration?: string;
}

interface HealthRecord {
  _id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'blocked';
  createdAt: string;
  ocr?: {
    engine: string;
    confidence: number;
    wordCount: number;
    blocked: boolean;
    blockReason?: string;
  };
  extraction?: {
    source: string;
    medicines: Medicine[];
    warnings: string[];
  };
  memorySignals?: {
    allergiesFound: string[];
    conditionsFound: string[];
    medicationsFound: string[];
    criticalEventsFound: string[];
  };
}

interface RecordCardProps {
  record: HealthRecord;
  accessToken: string;
  onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  uploading:   { label: 'Uploading',   icon: Clock,        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  processing:  { label: 'Processing',  icon: Clock,        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  completed:   { label: 'Completed',   icon: CheckCircle,  color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed:      { label: 'Failed',      icon: XCircle,      color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  blocked:     { label: 'Blocked',     icon: Shield,       color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

const CONFIDENCE_CONFIG = {
  high:       { color: 'text-green-400',  label: 'High' },
  medium:     { color: 'text-yellow-400', label: 'Medium' },
  low:        { color: 'text-orange-400', label: 'Low' },
  unverified: { color: 'text-red-400',    label: 'Unverified' },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function RecordCard({ record, accessToken, onDelete }: RecordCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cfg = STATUS_CONFIG[record.status];
  const StatusIcon = cfg.icon;
  const isPDF = record.mimeType === 'application/pdf';

  async function handleDelete() {
    if (!confirm(`Delete "${record.originalFileName}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/records/${record._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      onDelete(record._id);
    } catch {
      setDeleting(false);
    }
  }

  function openFile() {
    window.open(`/api/records/${record._id}/file`, '_blank');
  }

  return (
    <Card className="glass-card border border-medical/10 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-medical/10 shrink-0">
              {isPDF ? (
                <FileText className="h-5 w-5 text-medical" />
              ) : (
                <Image className="h-5 w-5 text-medical" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-medium text-white truncate">
                {record.originalFileName}
              </CardTitle>
              <p className="text-xs text-white/50 mt-0.5">
                {(record.fileSize / 1024).toFixed(1)} KB ·{' '}
                {new Date(record.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${cfg.color}`}>
              <StatusIcon className="h-3 w-3" />
              {cfg.label}
            </span>
          </div>
        </div>

        {record.ocr && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-white/50">
              <span>OCR confidence · {record.ocr.engine}</span>
            </div>
            <ConfidenceBar value={record.ocr.confidence} />
          </div>
        )}
      </CardHeader>

      {record.status === 'blocked' && record.ocr?.blockReason && (
        <CardContent className="pt-0">
          <div className="flex gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Shield className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-300">{record.ocr.blockReason}</p>
          </div>
        </CardContent>
      )}

      {record.status === 'completed' && record.extraction && (
        <CardContent className="pt-0 space-y-3">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between text-xs text-medical hover:text-medical/80 transition-colors"
          >
            <span>
              {record.extraction.medicines.length} medicine
              {record.extraction.medicines.length !== 1 ? 's' : ''} extracted
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden space-y-4"
              >
                {record.extraction.medicines.length > 0 ? (
                  <div className="space-y-2">
                    {record.extraction.medicines.map((med, i) => {
                      const mc = CONFIDENCE_CONFIG[med.nameConfidence];
                      return (
                        <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-white">{med.name}</span>
                            <span className={`text-xs ${mc.color}`}>· {mc.label}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-white/60">
                            {med.dosage && (
                              <span className="px-2 py-0.5 rounded bg-medical/10 text-medical border border-medical/20">
                                {med.dosage}
                              </span>
                            )}
                            {med.frequency && <span>{med.frequency}</span>}
                            {med.duration && <span>for {med.duration}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-white/50 italic">
                    No medicines with clear dosage notation found.
                  </p>
                )}

                {record.extraction.warnings.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-white/70">Warnings</p>
                    {record.extraction.warnings.map((w, i) => (
                      <div key={i} className="flex gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-300">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {record.memorySignals && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-white/70">Memory Signals</p>
                    {record.memorySignals.allergiesFound.length > 0 && (
                      <div>
                        <span className="text-xs text-red-400 font-medium">Allergies: </span>
                        <span className="text-xs text-white/60">{record.memorySignals.allergiesFound.join(', ')}</span>
                      </div>
                    )}
                    {record.memorySignals.conditionsFound.length > 0 && (
                      <div>
                        <span className="text-xs text-blue-400 font-medium">Conditions: </span>
                        <span className="text-xs text-white/60">{record.memorySignals.conditionsFound.join(', ')}</span>
                      </div>
                    )}
                    {record.memorySignals.criticalEventsFound.length > 0 && (
                      <div>
                        <span className="text-xs text-orange-400 font-medium">Critical: </span>
                        <span className="text-xs text-white/60">{record.memorySignals.criticalEventsFound.join(' · ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      )}

      <div className="px-6 pb-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={openFile}
          className="flex-1 border-medical/20 text-medical hover:bg-medical/10 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          View File
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}
