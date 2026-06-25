import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/apiBase';
import { motion } from 'framer-motion';
import NavigationHeader from '@/components/NavigationHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Phone, Clock, Heart, Droplet, Activity, AlertCircle, Info, Search, FolderOpen, Loader2 } from 'lucide-react';
import MouseFollower from '@/components/MouseFollower';
import RecordUploader from '@/components/RecordUploader';
import RecordCard from '@/components/RecordCard';
import { useAuth } from '@/contexts/AuthContext';

const nearbyLabs = [
  {
    id: 1,
    name: "HealthFirst Laboratory",
    address: "123 Medical Avenue, Cityville",
    phone: "(555) 123-4567",
    hours: "Mon-Fri: 7AM-7PM, Sat: 8AM-2PM",
    distance: "0.8 miles away",
    services: ["Blood Tests", "Urine Analysis", "Radiology", "ECG"],
    rating: 4.7
  },
  {
    id: 2,
    name: "PrecisionDiagnostics Center",
    address: "456 Health Street, Cityville",
    phone: "(555) 987-6543",
    hours: "Mon-Sat: 8AM-8PM, Sun: 9AM-1PM",
    distance: "1.2 miles away",
    services: ["Blood Tests", "Allergy Testing", "Immunology", "Molecular Testing"],
    rating: 4.9
  },
  {
    id: 3,
    name: "Quick Results Lab",
    address: "789 Wellness Road, Cityville",
    phone: "(555) 234-5678",
    hours: "24/7 Service",
    distance: "1.5 miles away",
    services: ["Emergency Testing", "Home Collection", "Digital Reports", "Express Results"],
    rating: 4.5
  },
  {
    id: 4,
    name: "CityLife Diagnostics",
    address: "321 Care Boulevard, Cityville",
    phone: "(555) 876-5432",
    hours: "Mon-Fri: 7AM-9PM, Sat-Sun: 8AM-6PM",
    distance: "2.3 miles away",
    services: ["Full Body Checkup", "Cancer Screening", "Genetic Testing", "Preventive Packages"],
    rating: 4.8
  }
];

const healthTips = {
  "High Blood Pressure": [
    "Reduce sodium intake to less than 1,500mg daily",
    "Exercise regularly, aim for 30 minutes most days",
    "Maintain a healthy weight and BMI",
    "Limit alcohol consumption and avoid smoking",
    "Practice stress management techniques like meditation",
    "Take medications as prescribed by your doctor"
  ],
  "Low Blood Pressure": [
    "Stay hydrated by drinking plenty of water",
    "Consume more salt if approved by your doctor",
    "Eat smaller, low-carbohydrate meals",
    "Wear compression stockings if recommended",
    "Rise slowly from sitting or lying positions",
    "Avoid standing for long periods of time"
  ],
  "High Blood Sugar": [
    "Monitor blood glucose levels regularly",
    "Follow a balanced diet rich in fiber and low in simple carbs",
    "Stay physically active with regular exercise",
    "Take insulin or medication as prescribed",
    "Manage stress levels effectively",
    "Stay hydrated and get adequate sleep"
  ],
  "Low Blood Sugar": [
    "Consume 15-20 grams of fast-acting carbohydrates",
    "Carry glucose tablets or gel for emergencies",
    "Don't skip meals, especially if on medication",
    "Balance physical activity with proper food intake",
    "Check blood sugar before driving or operating machinery",
    "Have a bedtime snack if nighttime lows are an issue"
  ]
};

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
    medicines: Array<{
      name: string;
      nameConfidence: 'high' | 'medium' | 'low' | 'unverified';
      dosage?: string;
      frequency?: string;
      duration?: string;
    }>;
    warnings: string[];
  };
  memorySignals?: {
    allergiesFound: string[];
    conditionsFound: string[];
    medicationsFound: string[];
    criticalEventsFound: string[];
  };
}

const PathoLab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [userAddress, setUserAddress] = useState('123 Main St, Cityville, ST 12345');
  const { isAuthenticated, accessToken, refreshAccessToken } = useAuth();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Patho Care - HealthCare";
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingRecords(true);
    setRecordsError(null);
    try {
      let token = accessToken;
      if (!token) token = await refreshAccessToken();
      if (!token) { setRecordsError('Session expired. Please log in again.'); return; }

      const res = await fetch(`${API_BASE}/records`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load records.');
      const data = await res.json() as { records: HealthRecord[] };
      setRecords(data.records);
    } catch {
      setRecordsError('Could not load records. Please try again.');
    } finally {
      setLoadingRecords(false);
    }
  }, [isAuthenticated, accessToken, refreshAccessToken]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredLabs = nearbyLabs.filter(lab =>
    lab.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lab.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lab.services.some(service => service.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function handleDelete(id: string) {
    setRecords(prev => prev.filter(r => r._id !== id));
  }

  const token = accessToken ?? '';

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="https://images.pexels.com/photos/9574518/pexels-photo-9574518.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          alt="Medical background"
          className="w-full h-full object-cover scale-110"
          style={{ pointerEvents: 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/50 to-medical-dark/30 z-[1]" />
      </div>

      <MouseFollower />
      <NavigationHeader />

      <div className="container mx-auto px-4 pt-24 pb-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance shimmer-text">
            PathoCare Services
          </h1>
          <p className="text-lg text-white max-w-2xl mx-auto">
            Find nearby pathological laboratories
          </p>
        </motion.div>

        <Tabs defaultValue="labs" className="w-full">
          <TabsList className="grid w-full max-w-lg mx-auto grid-cols-3 mb-8 glass-card p-1 rounded-xl">
            <TabsTrigger value="labs" className="data-[state=active]:bg-medical/20 dark:data-[state=active]:bg-medical/20 data-[state=active]:text-medical rounded-lg">Nearby Labs</TabsTrigger>
            <TabsTrigger value="tips" className="data-[state=active]:bg-medical/20 dark:data-[state=active]:bg-medical/20 data-[state=active]:text-medical rounded-lg">Health Tips</TabsTrigger>
            <TabsTrigger value="records" className="data-[state=active]:bg-medical/20 dark:data-[state=active]:bg-medical/20 data-[state=active]:text-medical rounded-lg">My Records</TabsTrigger>
          </TabsList>

          {/* ── Nearby Labs ── */}
          <TabsContent value="labs" className="space-y-8">
            <Card className="glass-card shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center text-xl text-medical">
                  <MapPin className="mr-2 h-5 w-5" />
                  Your Location
                </CardTitle>
                <CardDescription>
                  Enter your address to find nearby pathological laboratories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={userAddress}
                      onChange={(e) => setUserAddress(e.target.value)}
                      className="pl-10 border-medical/20 dark:border-medical/20 focus-visible:ring-medical"
                      placeholder="Enter your full address"
                    />
                  </div>
                  <Button className="bg-medical hover:bg-medical-dark text-white shadow-md hover:shadow-lg transition-all">
                    Find Labs
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Powered by Google Maps API • Results are displayed based on your location
                </p>
              </CardContent>
            </Card>

            <div className="mb-8">
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search labs by name, location, or service..."
                  className="pl-10 glass-card shadow-md"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredLabs.map((lab) => (
                <motion.div
                  key={lab.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ y: -5 }}
                >
                  <Card className="overflow-hidden h-full hover:shadow-xl transition-all duration-300 glass-card">
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-medical via-medical/60 to-medical/30"></div>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-medical">{lab.name}</CardTitle>
                          <CardDescription className="flex items-center mt-1">
                            <MapPin className="mr-1 h-4 w-4 text-medical" />
                            {lab.address}
                          </CardDescription>
                        </div>
                        <div className="px-2 py-1 bg-medical/10 rounded-full text-medical text-sm font-semibold">
                          {lab.distance}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-start">
                          <Phone className="h-4 w-4 mr-2 mt-0.5 text-medical" />
                          <span>{lab.phone}</span>
                        </div>
                        <div className="flex items-start">
                          <Clock className="h-4 w-4 mr-2 mt-0.5 text-medical" />
                          <span>{lab.hours}</span>
                        </div>
                        <div className="pt-2">
                          <p className="text-sm font-semibold mb-2">Available Services:</p>
                          <div className="flex flex-wrap gap-2">
                            {lab.services.map((service, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-medical/10 rounded-md text-xs text-medical border border-medical/20"
                              >
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between border-t border-medical/10 pt-4">
                      <div className="flex items-center">
                        <span className="text-yellow-500 mr-1">★</span>
                        <span className="font-semibold">{lab.rating}</span>
                      </div>
                      <Button className="bg-medical hover:bg-medical-dark text-white shadow-md hover:shadow-lg transition-all">
                        Book Appointment
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </div>

            {filteredLabs.length === 0 && (
              <div className="text-center p-8 glass-card rounded-lg shadow-md">
                <p className="text-lg font-medium text-medical">No laboratories found matching "{searchTerm}"</p>
                <p className="text-muted-foreground mt-2">Try a different search term or update your location</p>
              </div>
            )}
          </TabsContent>

          {/* ── Health Tips ── */}
          <TabsContent value="tips" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {Object.entries(healthTips).map(([condition, tips], i) => {
                const Icon = condition.includes("Pressure") ? (condition.includes("High") ? Heart : Droplet) : Activity;
                const TipIcon = condition.includes("Low") ? Info : AlertCircle;
                return (
                  <Card key={i} className="overflow-hidden glass-card border-2 border-medical/10 shadow-lg hover:shadow-xl transition-all">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center text-xl text-medical">
                        <Icon className="mr-2 h-5 w-5" />
                        {condition}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {tips.map((tip, idx) => (
                          <li key={idx} className="flex items-start text-sm">
                            <TipIcon className="h-4 w-4 mr-2 mt-0.5 text-medical" />
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </motion.div>
          </TabsContent>

          {/* ── My Records ── */}
          <TabsContent value="records" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {!isAuthenticated ? (
                <Card className="glass-card text-center py-16">
                  <CardContent>
                    <FolderOpen className="h-12 w-12 text-medical/40 mx-auto mb-4" />
                    <p className="text-white font-medium mb-1">Sign in to manage your records</p>
                    <p className="text-white/50 text-sm mb-6">
                      Upload prescriptions and medical reports to extract and store your medication data.
                    </p>
                    <Button
                      className="bg-medical hover:bg-medical/80 text-white"
                      onClick={() => window.location.href = '/login'}
                    >
                      Sign In
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Upload section */}
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="text-medical text-lg">Upload Prescription or Report</CardTitle>
                      <CardDescription className="text-white/50">
                        PDF, JPEG, or PNG · Max 10 MB · OCR powered by Tesseract
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RecordUploader
                        accessToken={token}
                        onUploaded={fetchRecords}
                      />
                    </CardContent>
                  </Card>

                  {/* Records list */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium">
                        Your Records{records.length > 0 && ` (${records.length})`}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchRecords}
                        disabled={loadingRecords}
                        className="text-medical hover:text-medical/80 text-xs"
                      >
                        {loadingRecords ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                      </Button>
                    </div>

                    {loadingRecords && records.length === 0 && (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 text-medical animate-spin" />
                      </div>
                    )}

                    {recordsError && (
                      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                        {recordsError}
                      </div>
                    )}

                    {!loadingRecords && !recordsError && records.length === 0 && (
                      <Card className="glass-card text-center py-12">
                        <CardContent>
                          <FolderOpen className="h-10 w-10 text-medical/30 mx-auto mb-3" />
                          <p className="text-white/50 text-sm">No records yet. Upload your first prescription above.</p>
                        </CardContent>
                      </Card>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {records.map(record => (
                        <motion.div
                          key={record._id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2 }}
                        >
                          <RecordCard
                            record={record}
                            accessToken={token}
                            onDelete={handleDelete}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PathoLab;
