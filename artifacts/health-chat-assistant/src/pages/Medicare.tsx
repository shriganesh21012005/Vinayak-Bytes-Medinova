import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import NavigationHeader from '@/components/NavigationHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Search, Upload, ShoppingCart, ArrowRight } from 'lucide-react';
import MouseFollower from '@/components/MouseFollower';
import RecordUploader from '@/components/RecordUploader';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

const popularMedicines = [
  { id: 1, name: "Aspirin", description: "Pain reliever", price: 199, image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400&h=400" },
  { id: 2, name: "Ibuprofen", description: "Anti-inflammatory", price: 249, image: "https://media.istockphoto.com/id/1359178057/photo/ibuprofen-pill-box-box-paper-blister-tablets.webp?a=1&b=1&s=612x612&w=0&k=20&c=LcplV_TGPyPl0raSOkUfXjSKmpGnAd2bj4rDfh8mrZU=" },
  { id: 3, name: "Paracetamol", description: "Fever reducer", price: 149, image: "https://images.pexels.com/photos/3652092/pexels-photo-3652092.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2" },
  { id: 4, name: "Amoxicillin", description: "Antibiotic", price: 399, image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&q=80&w=400&h=400" },
  { id: 5, name: "Loratadine", description: "Antihistamine", price: 299, image: "https://media.istockphoto.com/id/1343262408/photo/generic-box-of-loratadine-or-allergy-relief-pills-white-background.webp?a=1&b=1&s=612x612&w=0&k=20&c=eNTOKW0AoU8IaRFr4VQ-KHS938ZGn7t2qOIYA7Qal24=" },
  { id: 6, name: "Omeprazole", description: "Acid reducer", price: 449, image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80&w=400&h=400" },
];

const Medicare = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<Array<{ id: number, name: string, price: number, quantity: number }>>([]);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "Medicare - HealthCare";
    document.body.classList.add('medicare-page');
    return () => {
      document.body.classList.remove('medicare-page');
    };
  }, []);

  const filteredMedicines = popularMedicines.filter(medicine =>
    medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    medicine.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddToCart = (id: number, name: string, price: number) => {
    const existingItem = cart.find(item => item.id === id);
    if (existingItem) {
      setCart(cart.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { id, name, price, quantity: 1 }]);
    }
    toast({ title: "Added to cart", description: `${name} added to your cart` });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.pexels.com/photos/208512/pexels-photo-208512.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          alt="Pharmacy Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/50 to-medical-dark/30 z-10" />
      </div>

      <MouseFollower />

      {/* Header */}
      <NavigationHeader />

      <div className="container mx-auto px-4 pt-24 pb-16 relative z-20">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance shimmer-text">
            PharmCare Services
          </h1>
          <p className="text-lg text-white max-w-2xl mx-auto">
            Upload your prescription or search for medicines directly from our extensive catalog
          </p>
        </motion.div>

        {/* Upload Prescription */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-16">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <Upload className="mr-2 h-5 w-5 text-medical" />
                Upload Prescription
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isAuthenticated ? (
                <RecordUploader
                  onUploaded={() => {
                    toast({ title: "Prescription processed", description: "Your health memory has been updated." });
                  }}
                />
              ) : (
                <p className="text-sm text-white/50 text-center py-4">
                  Please <Link to="/login" className="text-medical underline">log in</Link> to upload a prescription.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Search & Medicines List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
          <div className="mb-8">
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search medicines..."
                className="pl-10 glass-card"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-6 text-white">Popular Medicines</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMedicines.map((medicine) => (
              <motion.div
                key={medicine.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                whileHover={{ y: -5 }}
              >
                <Card className="glass-card overflow-hidden h-full">
                  <div className="aspect-square w-full bg-muted flex items-center justify-center overflow-hidden">
                    <img src={medicine.image} alt={medicine.name} className="h-full w-full object-cover" />
                  </div>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold">{medicine.name}</h3>
                    <p className="text-sm text-muted-foreground">{medicine.description}</p>
                    <p className="mt-2 text-medical font-bold">₹{medicine.price.toFixed(2)}</p>
                  </CardContent>
                  <CardFooter className="px-6 pb-6 pt-0">
                    <Button onClick={() => handleAddToCart(medicine.id, medicine.name, medicine.price)} className="w-full bg-medical hover:bg-medical-dark text-white">
                      Add to Cart
                      <ShoppingCart className="ml-2 h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>

          {filteredMedicines.length === 0 && (
            <div className="text-center p-8 glass-card rounded-lg">
              <p className="text-lg font-medium">No medicines found matching "{searchTerm}"</p>
              <p className="text-muted-foreground mt-2">Try a different search term or browse our popular medicines</p>
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-12 p-6 glass-card rounded-lg shadow-lg">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <ShoppingCart className="mr-2 h-5 w-5 text-medical" />
                Your Cart
              </h3>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-border/50">
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">x{item.quantity}</span>
                    </div>
                    <span className="font-medium">₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 font-bold">
                  <span>Total</span>
                  <span>₹{cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-6">
                <Button className="w-full bg-medical hover:bg-medical-dark text-white">
                  Proceed to Checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Medicare;
