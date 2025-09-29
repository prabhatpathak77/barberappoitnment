import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
    getFirestore, collection, query, onSnapshot, doc, setDoc, 
    addDoc, serverTimestamp, getDocs, where, limit 
} from 'firebase/firestore';

// Lucide React Icons
const HomeIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const CalendarIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>;
const UserIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const DollarSignIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const CheckCircleIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>;
const LightbulbIcon = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .6-1.5 1-2 2.8-2.8 2.3-7-1-10A10 10 0 0 0 5 14c0 3.8 2.5 5.5 5 5.5s4-.5 4-2v-2z"/><line x1="9" x2="12" y1="22" y2="19"/><line x1="15" x2="18" y1="22" y2="19"/></svg>;


// --- Global Variables (Provided by Canvas Environment) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-kutkart-app';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const apiKey = ""; // Gemini API key

// Utility for fetching data with exponential backoff 
const fetchWithBackoff = async (func, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await func();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            console.warn(`Attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// --- Gemini API Call Logic ---
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

/**
 * Generates concise aftercare tips using non-grounded text generation.
 */
const generateAftercareTips = async (serviceName, hairType) => {
    const systemPrompt = "You are a professional barber assistant. Provide 3 concise and easy-to-follow aftercare tips for the specific service and hair type requested. Format the response as a numbered list in markdown.";
    const userQuery = `I just had a ${serviceName}. My hair type is ${hairType}. What are the best aftercare tips?`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    const apiCall = async () => {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.statusText}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error("Received empty response from LLM.");
        }
        return text;
    };

    return fetchWithBackoff(apiCall);
};


/**
 * Generates hairstyle inspiration using structured JSON output and Google Search grounding.
 */
const generateStyleInspiration = async (inputVibe, hairType) => {
    const systemPrompt = "You are a modern stylist. Provide 3 distinct, trending hairstyle recommendations for a man with the given hair type and desired vibe/occasion. You must use current trends from Google Search. Respond in the required JSON format.";
    const userQuery = `I have ${hairType} hair and I want a style that is ${inputVibe}. What are 3 trending hairstyles I should consider?`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "styleName": { "type": "STRING", "description": "The name of the hairstyle, e.g., 'Textured Crop'." },
                        "description": { "type": "STRING", "description": "A brief, persuasive description of the style." },
                        "maintenanceLevel": { "type": "STRING", "description": "Low, Medium, or High." },
                        "searchQuery": { "type": "STRING", "description": "A concise query to find an image for this style." }
                    },
                    required: ["styleName", "description", "maintenanceLevel", "searchQuery"]
                }
            }
        }
    };

    const apiCall = async () => {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) {
            throw new Error("Received empty response or invalid JSON structure from LLM.");
        }
        
        // The LLM returns a JSON string, which must be parsed
        const parsedJson = JSON.parse(jsonText);
        
        return parsedJson;
    };

    return fetchWithBackoff(apiCall);
};
// --- End Gemini API Call Logic ---


// --- Mock Data Setup ---
const MOCK_BARBERS = [
    { 
        id: "mike_cuts", name: "Mike's Cuts", rating: 5, imageUrl: "https://placehold.co/100x100/A07849/FFFFFF?text=Mike",
        services: [
            { name: "Haircut", price: 2500, duration: 45 },
            { name: "Beard Trim", price: 1000, duration: 20 },
        ],
        reviewCount: 154
    },
    { 
        id: "trim_king", name: "The Trim King", rating: 4.9, imageUrl: "https://placehold.co/100x100/A07849/FFFFFF?text=King",
        services: [
            { name: "Haircut", price: 2200, duration: 45 },
            { name: "Hot Shave", price: 1500, duration: 30 },
        ],
        reviewCount: 92
    },
    { 
        id: "razor_edge", name: "Razor Edge", rating: 5, imageUrl: "https://placehold.co/100x100/A07849/FFFFFF?text=Razor",
        services: [
            { name: "Head Massage", price: 1800, duration: 30 },
            { name: "Hair Color", price: 4000, duration: 60 },
        ],
        reviewCount: 201
    },
];

// Function to generate time slots for a specific day
const generateMockSlots = (date) => {
    const slots = [];
    for (let h = 9; h <= 17; h++) {
        ['00', '30'].forEach(m => {
            if (h === 17 && m === '30') return; // Stop at 17:00
            const time = `${h.toString().padStart(2, '0')}:${m}`;
            const isAvailable = Math.random() > 0.3; // 70% available
            if (isAvailable) {
                slots.push({ time, isAvailable: true });
            }
        });
    }
    return slots;
};

// --- Firebase Component Hooks ---

const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing. Cannot initialize.");
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authService = getAuth(app);

        setDb(firestore);
        setAuth(authService);
        
        // 1. Authentication Check
        const unsubscribe = onAuthStateChanged(authService, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (initialAuthToken) {
                        const userCredential = await signInWithCustomToken(authService, initialAuthToken);
                        setUserId(userCredential.user.uid);
                    } else {
                        const userCredential = await signInAnonymously(authService);
                        setUserId(userCredential.user.uid);
                    }
                } catch (error) {
                    console.error("Authentication failed:", error);
                    setUserId(crypto.randomUUID());
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    // 2. Initial Data Seeding/Fetching (Mock Barbers)
    useEffect(() => {
        if (!db || !isAuthReady) return;

        const seedBarbers = async () => {
            const barbersRef = collection(db, 'artifacts', appId, 'public', 'data', 'barbers');
            
            const q = query(barbersRef, limit(1));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                console.log("Seeding initial mock barber data...");
                MOCK_BARBERS.forEach(barber => {
                    const docRef = doc(barbersRef, barber.id);
                    setDoc(docRef, barber).catch(e => console.error("Error seeding barber:", e));
                });
            }
        };
        
        fetchWithBackoff(seedBarbers).catch(err => console.error("Failed to seed barbers after retries:", err));

    }, [db, isAuthReady]);

    return { db, auth, userId, isAuthReady, barbersData: MOCK_BARBERS }; // Also export mock barbers for dashboard logic
};


// --- UI Components ---

// Star Rating Component
const StarRating = ({ rating, size = 'text-lg' }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    return (
        <div className={`flex ${size} text-amber-500`}>
            {Array(fullStars).fill('★').map((s, i) => <span key={`f-${i}`}>{s}</span>)}
            {hasHalfStar && <span key="h">½</span>}
            {Array(emptyStars).fill('☆').map((s, i) => <span key={`e-${i}`} className="text-gray-300">{s}</span>)}
        </div>
    );
};

// Barber Card for Home Screen
const BarberCard = ({ barber, onBook }) => (
    <div className="flex items-center p-4 bg-white rounded-xl shadow-md transition duration-300 hover:shadow-lg mb-4 border border-gray-100">
        <img 
            src={barber.imageUrl} 
            alt={barber.name} 
            className="w-16 h-16 rounded-full object-cover mr-4 border-2 border-amber-500"
            onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/64x64/A07849/FFFFFF?text=B"; }}
        />
        <div className="flex-grow">
            <h3 className="font-semibold text-gray-800 text-xl">{barber.name}</h3>
            <StarRating rating={barber.rating} size="text-sm" />
            <p className="text-xs text-gray-500 mt-1">{barber.reviewCount} Reviews</p>
        </div>
        <button 
            onClick={() => onBook(barber)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-full shadow-lg transition duration-150 transform hover:scale-105"
        >
            Book Now
        </button>
    </div>
);

// Appointment Booking Modal/Screen
const BookingScreen = ({ barber, onClose, onConfirmBooking }) => {
    const BOOKING_FEE = 11; // ₹11 per booking
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [selectedService, setSelectedService] = useState(barber.services[0]);

    const availableSlots = useMemo(() => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (selectedDate.toDateString() === today.toDateString() || selectedDate.toDateString() === tomorrow.toDateString()) {
            return generateMockSlots(selectedDate);
        }
        return []; 
    }, [selectedDate]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const getWeekDays = (date) => {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay()); 
        
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            return day;
        });
    };
    
    const weekDays = getWeekDays(selectedDate);

    const handleDateSelect = (day) => {
        setSelectedDate(day);
        setSelectedSlot(null); 
    };

    const handleConfirm = () => {
        if (!selectedSlot) return;

        const bookingDetails = {
            barberName: barber.name,
            barberId: barber.id,
            date: selectedDate.toDateString(),
            time: selectedSlot.time,
            service: selectedService.name,
            totalPrice: selectedService.price + BOOKING_FEE,
            bookingFee: BOOKING_FEE,
            barberPrice: selectedService.price,
        };
        onConfirmBooking(bookingDetails);
    };

    return (
        <div className="p-4 bg-white rounded-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b pb-2">Book with {barber.name}</h2>
            
            {/* Calendar View */}
            <div className="mb-4">
                <h3 className="font-semibold mb-2 text-gray-700">Select Date</h3>
                <div className="flex justify-between items-center text-gray-500 mb-2">
                    <span className="text-sm font-medium">{months[selectedDate.getMonth()]} {selectedDate.getFullYear()}</span>
                    <div className='flex space-x-2'>
                        <button onClick={() => setSelectedDate(prev => { const d = new Date(prev); d.setDate(prev.getDate() - 7); return d; })} className='text-sm p-1 rounded-full hover:bg-gray-100'>&lt;</button>
                        <button onClick={() => setSelectedDate(prev => { const d = new Date(prev); d.setDate(prev.getDate() + 7); return d; })} className='text-sm p-1 rounded-full hover:bg-gray-100'>&gt;</button>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {weekDays.map((day, index) => (
                        <div key={index} 
                             onClick={() => handleDateSelect(day)}
                             className={`cursor-pointer p-2 rounded-lg transition duration-150 ${day.toDateString() === selectedDate.toDateString() ? 'bg-amber-600 text-white shadow-md' : 'text-gray-700 hover:bg-amber-100'} ${day.toDateString() === new Date().toDateString() ? 'border border-amber-600 font-bold' : ''}`}
                        >
                            <div className="font-medium">{days[day.getDay()]}</div>
                            <div className="text-lg font-bold">{day.getDate()}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Service Selection */}
            <div className="mb-4">
                <h3 className="font-semibold mb-2 text-gray-700">Select Service</h3>
                <select 
                    value={selectedService.name} 
                    onChange={(e) => setSelectedService(barber.services.find(s => s.name === e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-sm focus:ring-amber-500 focus:border-amber-500 transition duration-150"
                >
                    {barber.services.map(service => (
                        <option key={service.name} value={service.name}>
                            {service.name} (₹{service.price}) - {service.duration} mins
                        </option>
                    ))}
                </select>
            </div>

            {/* Time Slot Selection */}
            <div className="mb-4">
                <h3 className="font-semibold mb-2 text-gray-700">Available Slots</h3>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                    {availableSlots.length > 0 ? (
                        availableSlots.map((slot, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedSlot(slot)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition duration-150 ${
                                    selectedSlot?.time === slot.time 
                                        ? 'bg-amber-600 text-white shadow-lg' 
                                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                }`}
                            >
                                {slot.time}
                            </button>
                        ))
                    ) : (
                        <p className="text-gray-500 text-sm">No available slots for this date.</p>
                    )}
                </div>
            </div>

            {/* Pricing Summary */}
            <div className="border-t pt-3 mt-3">
                <div className="flex justify-between font-medium text-gray-800">
                    <span>Service:</span>
                    <span>₹{selectedService.price}</span>
                </div>
                <div className="flex justify-between text-gray-600 text-sm mt-1">
                    <span>Booking Fee:</span>
                    <span className='font-bold text-amber-600'>₹{BOOKING_FEE}</span>
                </div>
                <div className="flex justify-between font-bold text-xl mt-2 text-gray-900">
                    <span>TOTAL</span>
                    <span>₹{selectedService.price + BOOKING_FEE}</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex mt-6 space-x-3">
                <button 
                    onClick={onClose}
                    className="flex-1 bg-gray-200 text-gray-700 font-bold py-2 rounded-xl text-sm hover:bg-gray-300 transition duration-150"
                >
                    Back
                </button>
                <button 
                    onClick={handleConfirm}
                    disabled={!selectedSlot}
                    className={`flex-1 font-bold py-2 rounded-xl shadow-xl text-sm transition duration-150 ${
                        selectedSlot ? 'bg-amber-600 hover:bg-amber-700 text-white transform hover:scale-[1.02]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    Confirm Booking
                </button>
            </div>
        </div>
    );
};

// Booking Confirmation Screen (Updated with LLM feature)
const ConfirmationScreen = ({ bookingDetails, onDone }) => {
    const [tips, setTips] = useState(null);
    const [loadingTips, setLoadingTips] = useState(false);
    const [hairType, setHairType] = useState('straight'); // Simple state for hair type input

    const handleGenerateTips = async () => {
        if (loadingTips) return;
        setLoadingTips(true);
        setTips(null);

        try {
            const generatedTips = await generateAftercareTips(bookingDetails.service, hairType);
            setTips(generatedTips);
        } catch (error) {
            console.error("Error generating aftercare tips:", error);
            setTips("Sorry, we couldn't fetch the care tips right now. Please try again later.");
        } finally {
            setLoadingTips(false);
        }
    };


    return (
        <div className="p-4 sm:p-8 bg-white rounded-xl shadow-2xl text-center">
            <svg className="w-20 h-20 text-green-500 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
            <p className="text-gray-600 mb-8">You're all set. We've notified the barber.</p>

            {/* Booking Details */}
            <div className="text-left space-y-3 bg-amber-50 p-6 rounded-lg border border-amber-200 mb-6">
                <p className="font-semibold text-gray-800">
                    Barber: <span className="float-right font-bold text-amber-700">{bookingDetails.barberName}</span>
                </p>
                <p className="font-semibold text-gray-800">
                    Service: <span className="float-right font-bold">{bookingDetails.service}</span>
                </p>
                <p className="font-semibold text-gray-800">
                    Time: <span className="float-right font-bold text-xl">{bookingDetails.time}</span>
                </p>
                <p className="border-t border-amber-200 pt-3 text-sm text-gray-600">
                    Total Paid: <span className="float-right font-extrabold text-lg text-green-600">₹{bookingDetails.totalPrice}</span>
                </p>
            </div>

            {/* --- Gemini LLM Feature: Aftercare Tips --- */}
            <div className="bg-blue-50 p-4 rounded-xl shadow-inner mb-6">
                <h3 className="font-bold text-lg text-blue-800 mb-3">✨ Post-Kut Care Tips</h3>
                
                <div className="flex items-center mb-4 space-x-2">
                    <label htmlFor="hairType" className="text-sm text-gray-700 font-medium whitespace-nowrap">My Hair Type:</label>
                    <select 
                        id="hairType" 
                        value={hairType} 
                        onChange={(e) => setHairType(e.target.value)}
                        className="w-full p-2 border border-blue-300 rounded-lg bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="straight">Straight</option>
                        <option value="wavy">Wavy</option>
                        <option value="curly">Curly</option>
                        <option value="coily">Coily</option>
                    </select>
                </div>

                <button 
                    onClick={handleGenerateTips}
                    disabled={loadingTips}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition duration-150 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                    {loadingTips ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>Generating Tips...</span>
                        </>
                    ) : (
                        <span>✨ Get Personalized Aftercare Tips</span>
                    )}
                </button>

                {tips && (
                    <div className="mt-4 text-left p-3 bg-white border border-blue-200 rounded-lg text-sm text-gray-700 whitespace-pre-line">
                        {tips}
                    </div>
                )}
            </div>
            {/* --- End LLM Feature --- */}


            <button 
                onClick={onDone}
                className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl shadow-xl transition duration-150 transform hover:scale-[1.02]"
            >
                View My Bookings
            </button>
        </div>
    );
};

// Bookings List Screen (for the User)
const BookingsScreen = ({ db, userId, isAuthReady, onNavigate }) => {
    const [bookings, setBookings] = useState([]);
    const [loadingBookings, setLoadingBookings] = useState(true);

    useEffect(() => {
        if (!db || !isAuthReady || !userId) return;

        const bookingsRef = collection(db, 'artifacts', appId, 'users', userId, 'bookings');
        const q = query(bookingsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedBookings = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Convert timestamp object to milliseconds if it exists
                timestampMs: doc.data().timestamp ? doc.data().timestamp.toMillis() : Date.now()
            })).sort((a, b) => b.timestampMs - a.timestampMs); // Sort by newest first
            
            setBookings(fetchedBookings);
            setLoadingBookings(false);
        }, (err) => {
            console.error("Firestore error fetching bookings:", err);
            setLoadingBookings(false);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    return (
        <div className="p-4 bg-white rounded-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b pb-2">My Appointments</h2>
            
            {loadingBookings ? (
                <div className="text-center p-8">Loading...</div>
            ) : bookings.length === 0 ? (
                <div className="text-center p-8 text-gray-500">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                    <p>You have no past or upcoming bookings yet.</p>
                    <button 
                        onClick={() => onNavigate('home')}
                        className="mt-4 text-amber-600 font-semibold hover:text-amber-700 transition"
                    >
                        Book Your First Kut!
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {bookings.map((booking) => (
                        <div key={booking.id} className="p-4 bg-amber-50 rounded-lg shadow-sm border-l-4 border-amber-600">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg text-gray-800">{booking.barberName}</h3>
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                    booking.status === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                }`}>
                                    {booking.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600">{booking.service}</p>
                            <p className="text-sm font-medium text-gray-700 mt-2">
                                <span className='text-amber-600 font-bold mr-1'>{booking.time}</span> on {booking.date}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Total: ₹{booking.totalPrice}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// New Component: AI Style Inspiration Generator
const StyleInspiration = () => {
    const [vibe, setVibe] = useState('modern and sharp');
    const [hairType, setHairType] = useState('straight');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleGenerate = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        setResults(null);

        try {
            // Call the new structured Gemini API function
            const inspiration = await generateStyleInspiration(vibe, hairType);
            if (Array.isArray(inspiration)) {
                setResults(inspiration);
            } else {
                 throw new Error("Invalid response structure from AI.");
            }
        } catch (err) {
            console.error("AI Style Inspiration Error:", err);
            setError("Could not generate style inspiration. Please try a different prompt or check your network.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-fuchsia-50 p-4 rounded-xl shadow-inner mb-6 border border-fuchsia-200">
            <h3 className="font-bold text-xl text-fuchsia-800 mb-3 flex items-center space-x-2">
                <LightbulbIcon className="w-6 h-6"/> <span>AI Style Inspiration</span>
            </h3>
            <p className='text-sm text-fuchsia-700 mb-4'>Tell us the vibe you're going for, and we'll suggest 3 trending cuts!</p>
            
            {/* Input Form */}
            <div className='space-y-3 mb-4'>
                <div>
                    <label htmlFor="styleVibe" className="text-sm font-medium text-gray-700">I want a style that is...</label>
                    <input 
                        id="styleVibe"
                        type="text"
                        value={vibe}
                        onChange={(e) => setVibe(e.target.value)}
                        placeholder="e.g., professional, low maintenance, bold"
                        className="mt-1 w-full p-2 border border-fuchsia-300 rounded-lg bg-white text-sm focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    />
                </div>
                <div>
                    <label htmlFor="styleHairType" className="text-sm font-medium text-gray-700">My hair type is...</label>
                    <select 
                        id="styleHairType" 
                        value={hairType} 
                        onChange={(e) => setHairType(e.target.value)}
                        className="mt-1 w-full p-2 border border-fuchsia-300 rounded-lg bg-white text-sm focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    >
                        <option value="straight">Straight</option>
                        <option value="wavy">Wavy</option>
                        <option value="curly">Curly</option>
                        <option value="coily">Coily</option>
                    </select>
                </div>
            </div>

            <button 
                onClick={handleGenerate}
                disabled={loading || !vibe.trim()}
                className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-3 rounded-xl shadow-md transition duration-150 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
                {loading ? (
                    <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>Searching for Trends...</span>
                    </>
                ) : (
                    <span>Get Style Suggestions</span>
                )}
            </button>

            {/* Results Display */}
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            
            {results && results.length > 0 && (
                <div className="mt-4 space-y-4">
                    {results.map((style, index) => (
                        <div key={index} className="p-3 bg-white border border-fuchsia-100 rounded-lg shadow-sm">
                            <h4 className="font-extrabold text-lg text-fuchsia-700">{style.styleName}</h4>
                            <p className="text-sm text-gray-700 mb-2">{style.description}</p>
                            <div className='flex justify-between items-center text-xs text-gray-500'>
                                <span>Maintenance: <span className='font-bold'>{style.maintenanceLevel}</span></span>
                                <a 
                                    href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(style.searchQuery)}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className='text-blue-500 hover:text-blue-600 font-medium'
                                >
                                    View Images &rarr;
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// Dashboard Screen (Updated to include Style Inspiration)
const DashboardScreen = ({ db, userId, isAuthReady, onNavigate, barbersData }) => {
    const [appointments, setAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(true);
    const [isBarber, setIsBarber] = useState(false);
    
    // Simple logic to check if the current user ID matches a mock barber ID
    const currentBarber = useMemo(() => barbersData.find(b => b.id === userId), [userId, barbersData]);
    
    useEffect(() => {
        if (currentBarber) {
            setIsBarber(true);
        } else {
            setIsBarber(false);
        }
    }, [currentBarber]);

    useEffect(() => {
        if (!db || !isAuthReady || !currentBarber) {
            setLoadingAppointments(false);
            return;
        }

        // Fetch appointments for this specific barber ID
        const scheduleRef = collection(db, 'artifacts', appId, 'public', 'data', 'barber_schedules', currentBarber.id, 'appointments');
        const q = query(scheduleRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedAppointments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                priceEarned: doc.data().priceEarned || (doc.data().barberPrice - 9), // Fallback if priceEarned wasn't saved correctly
                timestampMs: doc.data().timestamp ? doc.data().timestamp.toMillis() : Date.now()
            })).sort((a, b) => b.timestampMs - a.timestampMs); 
            
            setAppointments(fetchedAppointments);
            setLoadingAppointments(false);
        }, (err) => {
            console.error("Firestore error fetching schedule:", err);
            setLoadingAppointments(false);
        });

        return () => unsubscribe();
    }, [db, isAuthReady, currentBarber]);

    // Calculate Dashboard Stats
    const { totalBookings, totalRevenue, pendingAppointments } = useMemo(() => {
        const totalBookings = appointments.length;
        const totalRevenue = appointments.reduce((sum, appt) => sum + (appt.priceEarned || 0), 0);
        const pendingAppointments = appointments.filter(appt => appt.status === 'Confirmed').length; // Assuming 'Confirmed' means upcoming for simplicity
        return { totalBookings, totalRevenue, pendingAppointments };
    }, [appointments]);


    if (!isBarber) {
        // --- Customer Profile View ---
        return (
            <div className="p-4 bg-white rounded-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b pb-2 flex items-center space-x-2">
                    <UserIcon className="w-6 h-6 text-amber-600"/> <span>My Profile</span>
                </h2>
                
                {/* New Feature: Style Inspiration */}
                <StyleInspiration />

                <div className="text-left bg-gray-50 p-4 rounded-lg text-sm text-gray-600 border border-gray-100">
                    <p className='font-semibold'>Your User ID (for sharing/debug):</p>
                    <p className='break-words text-xs'>{userId}</p>
                </div>
                <button onClick={() => onNavigate('home')} className="mt-6 w-full bg-amber-600 text-white font-bold py-2 rounded-xl hover:bg-amber-700 transition">
                    Find a Barber
                </button>
            </div>
        );
    }
    
    // Barber Dashboard View
    return (
        <div className="p-4 bg-white rounded-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-amber-700 mb-2">{currentBarber.name} Dashboard</h2>
            <p className="text-sm text-gray-500 mb-4">Manage your schedule and earnings.</p>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <StatCard 
                    Icon={DollarSignIcon} 
                    title="Total Revenue" 
                    value={`₹${totalRevenue.toLocaleString()}`} 
                    color="bg-green-100 text-green-700" 
                />
                 <StatCard 
                    Icon={CheckCircleIcon} 
                    title="Total Bookings" 
                    value={totalBookings} 
                    color="bg-blue-100 text-blue-700" 
                />
            </div>

            {/* Appointments List */}
            <h3 className="font-bold text-xl text-gray-800 mb-3 border-b pb-1">Upcoming Appointments ({pendingAppointments})</h3>
            
            {loadingAppointments ? (
                <div className="text-center p-8">Loading Schedule...</div>
            ) : appointments.length === 0 ? (
                <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-lg">
                    <CalendarIcon className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm">No appointments booked yet.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {appointments.map((appt) => (
                        <div key={appt.id} className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                            <div>
                                <p className="font-semibold text-gray-800">{appt.time} - {appt.date}</p>
                                <p className="text-sm text-gray-600">{appt.service} for {appt.customerName}</p>
                            </div>
                            <span className="font-bold text-lg text-green-600">₹{appt.priceEarned}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Helper component for Dashboard Stats
const StatCard = ({ Icon, title, value, color }) => (
    <div className={`p-4 rounded-xl shadow-lg ${color} flex flex-col items-start`}>
        <Icon className="w-6 h-6 mb-2" />
        <p className="text-xs font-medium opacity-80">{title}</p>
        <p className="text-2xl font-extrabold mt-1">{value}</p>
    </div>
);


const App = () => {
    // Firebase State
    const { db, auth, userId, isAuthReady, barbersData } = useFirebase();
    
    // Application State
    const [view, setView] = useState('home'); // 'home', 'bookings', 'dashboard', 'booking', 'confirmation'
    const [barbers, setBarbers] = useState([]);
    const [selectedBarber, setSelectedBarber] = useState(null);
    const [bookingDetails, setBookingDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Data Fetching (Barbers List) ---
    useEffect(() => {
        if (!db || !isAuthReady) return;

        const barbersRef = collection(db, 'artifacts', appId, 'public', 'data', 'barbers');
        const q = query(barbersRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedBarbers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setBarbers(fetchedBarbers);
            setLoading(false);
        }, (err) => {
            console.error("Firestore error fetching barbers:", err);
            setError("Failed to load barbers. Please try refreshing.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, isAuthReady]);


    // --- Handlers ---
    const handleBookNow = (barber) => {
        setSelectedBarber(barber);
        setView('booking');
    };

    const handleBookingConfirmation = async (details) => {
        if (!db || !userId) {
            setError("User not authenticated for booking.");
            return;
        }

        // Store the booking in both user's private collection AND the barber's public schedule
        const userBookingsRef = collection(db, 'artifacts', appId, 'users', userId, 'bookings');
        
        // This collection path correctly targets the specific barber's schedule
        const barberScheduleRef = collection(db, 'artifacts', appId, 'public', 'data', 'barber_schedules', details.barberId, 'appointments');

        try {
            // 1. Save to user's bookings
            const userBookingPromise = fetchWithBackoff(() => addDoc(userBookingsRef, {
                ...details,
                timestamp: serverTimestamp(),
                userId: userId,
                status: 'Confirmed'
            }));

            // 2. Save to barber's schedule
            const barberAppointmentPromise = fetchWithBackoff(() => addDoc(barberScheduleRef, {
                date: details.date,
                time: details.time,
                service: details.service,
                customerUserId: userId,
                customerName: `User-${userId.substring(0, 4)}`, // Mock customer name
                priceEarned: details.barberPrice - 9, // Example: Barber price minus ₹9 platform fee
                timestamp: serverTimestamp(),
                status: 'Confirmed'
            }));

            await Promise.all([userBookingPromise, barberAppointmentPromise]);

            setBookingDetails(details);
            setView('confirmation');

        } catch (e) {
            console.error("Error finalizing booking:", e);
            setError("We couldn't finalize your booking. Please try again.");
        }
    };

    // --- Content Renderer ---
    const renderContent = () => {
        if (loading) {
            return (
                <div className="text-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent mx-auto mb-3"></div>
                    <p className="text-gray-600">Connecting to the KutKart network...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl">
                    <p className="font-bold">Error:</p>
                    <p className="text-sm">{error}</p>
                </div>
            );
        }

        switch (view) {
            case 'booking':
                return (
                    <BookingScreen 
                        barber={selectedBarber}
                        onClose={() => setView('home')}
                        onConfirmBooking={handleBookingConfirmation}
                    />
                );
            case 'confirmation':
                return (
                    <ConfirmationScreen 
                        bookingDetails={bookingDetails}
                        onDone={() => setView('bookings')} // Navigate to the new bookings page
                    />
                );
            case 'bookings':
                return (
                    <BookingsScreen 
                        db={db} 
                        userId={userId} 
                        isAuthReady={isAuthReady}
                        onNavigate={setView}
                    />
                );
            case 'dashboard':
                return (
                    <DashboardScreen
                        db={db} 
                        userId={userId} 
                        isAuthReady={isAuthReady}
                        onNavigate={setView}
                        barbersData={barbersData} // Pass mock data to match user to barber ID
                    />
                );
            case 'home':
            default:
                return (
                    <>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Find Your Barber</h2>
                        {barbers.map(barber => (
                            <BarberCard 
                                key={barber.id} 
                                barber={barber} 
                                onBook={handleBookNow} 
                            />
                        ))}
                        {barbers.length === 0 && <p className="text-center text-gray-500">No barbers found.</p>}
                    </>
                );
        }
    };

    const navItems = [
        { name: 'Home', icon: HomeIcon, view: 'home' },
        { name: 'Bookings', icon: CalendarIcon, view: 'bookings' },
        { name: 'Profile', icon: UserIcon, view: 'dashboard' },
    ];

    return (
        <div className="min-h-screen bg-amber-50 font-inter p-0 flex flex-col items-center">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                .font-inter { font-family: 'Inter', sans-serif; }
                /* Mobile App Shell Styling */
                .mobile-shell {
                    width: 100%;
                    max-width: 420px; /* Standard mobile width limit */
                    height: 100vh;
                    max-height: 840px; 
                    box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
                    border-radius: 20px;
                    background: #fdfaf7; /* Soft light beige background */
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
            `}</style>

            <div className="mobile-shell mx-auto">
                {/* Header (Top Bar) */}
                <header className="flex justify-between items-center p-4 pt-6 bg-white shadow-sm border-b border-amber-100">
                    <h1 className="text-2xl font-extrabold text-amber-700 tracking-wider">
                        <span className="text-gray-800">Kut</span>Kart
                    </h1>
                    <div className="text-right text-xs text-gray-500">
                        {/* Always visible for debugging/sharing, but styled minimally */}
                        ID: {userId ? userId.substring(0, 6) : '...'}
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-grow overflow-y-auto p-4 mb-[60px]"> {/* mb-60px to account for fixed bottom nav */}
                    {renderContent()}
                </main>

                {/* Bottom Navigation Bar */}
                <nav className="fixed bottom-0 w-full max-w-[420px] bg-white border-t border-amber-100 shadow-xl flex justify-around items-center h-[60px] rounded-b-2xl">
                    {navItems.map(item => (
                        <button
                            key={item.name}
                            onClick={() => setView(item.view)}
                            className={`flex flex-col items-center p-2 transition duration-200 ${
                                view === item.view || (view === 'confirmation' && item.view === 'bookings')
                                    ? 'text-amber-700 font-bold'
                                    : 'text-gray-500 hover:text-amber-600'
                            }`}
                        >
                            <item.icon className="w-6 h-6" />
                            <span className="text-xs">{item.name}</span>
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
};

export default App;
