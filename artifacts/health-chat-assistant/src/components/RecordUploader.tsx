import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Image, X, Loader2, Shield, CheckCircle, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE = 10 * 1024 * 1024;

type UploadState =
  | { phase: 'idle' }
  | { phase: 'selected'; file: File }
  | { phase: 'uploading'; file: File; progress: number }
  | { phase: 'done'; result: UploadResult }
  | { phase: 'error'; message: string };

interface UploadResult {
  recordId: string;
  status: string;
  safetyMessage?: string;
  ocr?: { confidence: number; wordCount: number; engine: string; blocked: boolean; blockReason?: string };
  extraction?: { medicines: Array<{ name: string; nameConfidence: string; dosage?: string; frequency?: string; duration?: string }>; warnings: string[] };
}

interface RecordUploaderProps {
  accessToken: string;
  onUploaded: () => void;
}

export default function RecordUploader({ accessToken, onUploaded }: RecordUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const [dragging, setDragging] = useState(false);

  function validateFile(file: File): string | null {
    if (!ACCEPTED.includes(file.type)) return 'Only PDF, JPEG, and PNG files are accepted.';
    if (file.size > MAX_SIZE) return 'File size must be under 10 MB.';
    return null;
  }

  function selectFile(file: File) {
    const err = validateFile(file);
    if (err) { setState({ phase: 'error', message: err }); return; }
    setState({ phase: 'selected', file });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  }

  async function upload() {
    if (state.phase !== 'selected') return;
    const { file } = state;
    setState({ phase: 'uploading', file, progress: 0 });

    const form = new FormData();
    form.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/records/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setState({ phase: 'uploading', file, progress: Math.round((e.loaded / e.total) * 90) });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const result: UploadResult = JSON.parse(xhr.responseText);
            setState({ phase: 'done', result });
            onUploaded();
          } catch {
            setState({ phase: 'error', message: 'Unexpected response from server.' });
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            setState({ phase: 'error', message: err.error ?? 'Upload failed.' });
          } catch {
            setState({ phase: 'error', message: 'Upload failed. Please try again.' });
          }
        }
      };

      xhr.onerror = () => setState({ phase: 'error', message: 'Network error. Please check your connection.' });
      xhr.send(form);
    } catch {
      setState({ phase: 'error', message: 'Upload failed. Please try again.' });
    }
  }

  function reset() { setState({ phase: 'idle' }); }

  const isPDF = (state.phase === 'selected' || state.phase === 'uploading') && state.file.type === 'application/pdf';

  return (
    <div className="space-y-4">
      {(state.phase === 'idle' || state.phase === 'error') && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-medical bg-medical/10' : 'border-medical/30 hover:border-medical/60 hover:bg-medical/5'}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-medical/10">
                <Upload className="h-6 w-6 text-medical" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Drop your prescription here</p>
                <p className="text-xs text-white/50 mt-1">PDF, JPEG, or PNG · Max 10 MB</p>
              </div>
              <Button variant="outline" size="sm" className="border-medical/30 text-medical hover:bg-medical/10 pointer-events-none">
                Browse files
              </Button>
            </div>
          </div>

          {state.phase === 'error' && (
            <div className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{state.message}</p>
            </div>
          )}
        </>
      )}

      {state.phase === 'selected' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl border border-medical/20 bg-medical/5 flex items-center gap-3"
        >
          <div className="p-2 rounded-lg bg-medical/10">
            {isPDF ? <FileText className="h-5 w-5 text-medical" /> : <Image className="h-5 w-5 text-medical" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{state.file.name}</p>
            <p className="text-xs text-white/50">{(state.file.size / 1024).toFixed(1)} KB</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" onClick={upload} className="bg-medical hover:bg-medical/80 text-white text-xs">
              Upload & Scan
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} className="text-white/50 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {state.phase === 'uploading' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl border border-medical/20 bg-medical/5 space-y-3"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-medical animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{state.file.name}</p>
              <p className="text-xs text-white/50">
                {state.progress < 90 ? 'Uploading…' : 'Running OCR…'}
              </p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-medical"
              initial={{ width: 0 }}
              animate={{ width: `${state.progress < 90 ? state.progress : 95}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {state.phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {state.result.status === 'blocked' ? (
              <div className="flex gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <Shield className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-orange-300">Processing Blocked</p>
                  <p className="text-xs text-orange-300/80">
                    {state.result.safetyMessage ?? state.result.ocr?.blockReason}
                  </p>
                  {state.result.ocr && (
                    <p className="text-xs text-white/40">
                      Confidence: {Math.round(state.result.ocr.confidence * 100)}% · Engine: {state.result.ocr.engine}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-300">Scan Complete</p>
                    {state.result.ocr && (
                      <p className="text-xs text-white/50">
                        Confidence: {Math.round(state.result.ocr.confidence * 100)}% ·{' '}
                        {state.result.extraction?.medicines.length ?? 0} medicine(s) found ·{' '}
                        Engine: {state.result.ocr.engine}
                      </p>
                    )}
                    <p className="text-xs text-white/40 pt-0.5">
                      Your health memory has been updated automatically.
                    </p>
                  </div>
                </div>

                <Link to="/health-memory" className="block">
                  <Button
                    size="sm"
                    className="w-full bg-medical hover:bg-medical/80 text-white text-xs"
                  >
                    <Brain className="h-3.5 w-3.5 mr-1.5" />
                    View Health Memory
                  </Button>
                </Link>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={reset}
              className="w-full border-medical/20 text-medical hover:bg-medical/10 text-xs"
            >
              Upload another
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
