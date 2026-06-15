import { analyzeSafety } from "./safetyLayer";
import { extractContextSummary } from "./healthContextBuilder";
import type { IHealthMemory } from "../models/HealthMemory";

export interface StreamChunk {
  type: "chunk" | "done" | "error";
  content?: string;
  message?: string;
}

// ─── Intent detection ─────────────────────────────────────────────────────────
// Order matters: more specific patterns must come before broader ones.
// e.g. "sleep" must route to sleep/fatigue, NOT mental_health by default.

function detectIntent(query: string): string {
  const q = query.toLowerCase();

  // ── Greetings / meta ──────────────────────────────────────────────────────
  if (/\b(hello|hi|hey|how are you|good morning|good evening|good afternoon)\b/.test(q)) return "greeting";
  if (/\bthank/.test(q)) return "thanks";
  if (/\b(clear|delete|reset|start over|new chat)\b/.test(q)) return "clear";

  // ── Emergencies (delegated to safety layer — handled before this function) ─
  // Intent detection is only reached after safety checks pass.

  // ── Hydration ─────────────────────────────────────────────────────────────
  if (/\b(water|hydrat\w*|fluid|drink\s+water|thirst\w*|dehydrat\w*)\b/.test(q)) return "hydration";

  // ── Sleep / fatigue (not mental health) ──────────────────────────────────
  // "sleepy", "tired", "fatigue", "exhausted", "can't sleep", "sleep quality"
  // Note: insomnia stays here too — it's a sleep issue, not a mental health proxy.
  if (/\b(sleep\w*|insomnia|tired\w*|fatigue|exhausted|drowsy|lethargic|can'?t\s*sleep|wake\s*up\s*tired|no\s*energy|low\s*energy)\b/.test(q)) return "sleep_fatigue";

  // ── Mental health (stress, anxiety, depression, panic — not just sleep) ──
  if (/\b(stress\w*|anxious|anxiety|depress\w*|mental\s+health|mood|worr\w*|panic\w*|overthink|burnout|lonely|hopeless)\b/.test(q) || /\bsad\b/.test(q)) return "mental_health";

  // ── Environmental / outdoor safety ───────────────────────────────────────
  if (/\b(pollut\w*|air\s*quality|aqi|smog|haze|mask|n95|pm2\.?5|pm10|dust\s*storm|wildfire\s*smoke|outdoor\s*safe|go\s*outside)\b/.test(q) || /outside\s+in\b/.test(q)) return "environment";

  // ── Fever ─────────────────────────────────────────────────────────────────
  if (/\b(fever\w*|febrile|pyrexia|high\s*temp\w*|running\s*a\s*(temperature|fever))\b/.test(q) || /\btemperature\b/.test(q)) return "fever";

  // ── Headache / migraine ──────────────────────────────────────────────────
  if (/\b(headaches?|head\s*aches?|migraine\w*|head\s*pain|throbbing\s*head)\b/.test(q) || /\bhead\s*hurts?\b/.test(q)) return "headache";

  // ── Dizziness / vertigo ──────────────────────────────────────────────────
  if (/\b(dizzy|dizziness|lightheaded|light-headed|vertigo|spinning|woozy)\b/.test(q) || /\bfaint\b/.test(q)) return "dizziness";

  // ── General symptoms (after specifics are handled above) ─────────────────
  if (/\b(symptom\w*|feel sick|feel bad|feel unwell|not feel\w*|pain\b|hurt\w*|ach\w*|cough\w*|nausea|vomit\w*|diarrhea|sore\b|unwell|nauseous|stomach\s*ache|bloat\w*)\b/.test(q) || /\bill\b/.test(q)) return "symptoms";

  // ── Medication ────────────────────────────────────────────────────────────
  if (/\b(medications?|medicines?|drug\w*|pill\w*|prescription\w*|dosage|dose\w*|tablet\w*|capsule\w*|supplement\w*|paracetamol|ibuprofen|antibiotic\w*)\b/.test(q)) return "medication";

  // ── Allergy ───────────────────────────────────────────────────────────────
  if (/\ballerg/.test(q)) return "allergy";

  // ── Nutrition / diet ─────────────────────────────────────────────────────
  if (/\b(diet\w*|nutrition\w*|eat\w*|foods?|calorie\w*|meal\w*|vegetable\w*|fruit\w*|protein\w*|carb\w*|sugar\w*|sodium|junk\s*food|healthy\s*food|avoid\s*food|foods?\s*to\s*avoid|what\s+to\s+eat)\b/.test(q) || /\bfat\b/.test(q)) return "nutrition";

  // ── Exercise / physical activity ─────────────────────────────────────────
  // Suffix-aware: dance/dancing, walk/walking, run/running, jog/jogging, etc.
  if (/\b(exercise\w*|workout\w*|fitness|active|physical\s*activity|gym|sport\w*|yoga|swimming|cycling|stretch\w*|cardio|strength\w*|lift\w*|jog\w*|runn?ing|runs?\b|walk\w*|danc\w*)\b/.test(q)) return "exercise";

  // ── Appointments / doctors ───────────────────────────────────────────────
  if (/\b(appointment|schedule|book|visit|doctor|specialist|physician|cardiolog|neurolog|dermato|orthoped|see\s+a\s+doctor)\b/.test(q)) return "appointment";

  // ── Lab tests / results ──────────────────────────────────────────────────
  if (/\b(test|lab|result|scan|blood\s*test|urine|x-ray|mri|ct\s*scan|biopsy|report)\b/.test(q)) return "test";

  // ── Insurance / cost ─────────────────────────────────────────────────────
  if (/\b(insurance|cover|payment|cost|bill|price|afford)\b/.test(q)) return "insurance";

  // ── Vaccines ──────────────────────────────────────────────────────────────
  if (/\b(vaccine|vaccination|immunization|booster|shot\b)\b/.test(q)) return "vaccine";

  // ── Bengali patterns ──────────────────────────────────────────────────────
  if (/শরীর\s*খারাপ|ব্যথ|জ্বর|মাথাব্যথা|বমি|কাশি|অসুস্থ|অসুখ|ব্যাথ/.test(query)) return "symptoms";
  if (/ক্লান্ত|অবসাদ|ঘুম/.test(query)) return "sleep_fatigue";
  if (/অ্যালার্জি|এলার্জি/.test(query)) return "allergy";
  if (/ওষুধ|ওষুধের|দওয়াই|ট্যাবলেট/.test(query)) return "medication";
  if (/ব্যায়াম|নাচ|যোগ|হাঁটা|খেলাধুলা/.test(query)) return "exercise";
  if (/মানসিক|উদ্বেগ|বিষণ্ন|দুশ্চিন্তা/.test(query)) return "mental_health";
  if (/হ্যালো|কেমন আছ|নমস্কার/.test(query)) return "greeting";

  // ── Hindi patterns ────────────────────────────────────────────────────────
  if (/शरीर|दर्द|बुखार|सिरदर्द|उल्टी|खांसी|बीमार|अस्वस्थ/.test(query)) return "symptoms";
  if (/थकान|नींद|नींद नहीं/.test(query)) return "sleep_fatigue";
  if (/एलर्जी|अलेर्जी/.test(query)) return "allergy";
  if (/दवाई|दवा|टैबलेट|कैप्सूल|नुस्खा/.test(query)) return "medication";
  if (/व्यायाम|नाच|योग|चलना|खेल/.test(query)) return "exercise";
  if (/मानसिक|चिंता|अवसाद|तनाव/.test(query)) return "mental_health";
  if (/नमस्ते|हैलो|कैसे हैं/.test(query)) return "greeting";
  if (/पानी|पानी पीना|प्यास/.test(query)) return "hydration";

  return "general";
}

// ─── Response builder ─────────────────────────────────────────────────────────

function buildMockResponse(userMessage: string, memory: IHealthMemory | null): string {
  const safety = analyzeSafety(userMessage);
  const ctx = extractContextSummary(memory);
  const intent = detectIntent(userMessage);

  // ── Safety layer (unchanged) ──────────────────────────────────────────────

  if (safety.isEmergency) {
    const keywords = safety.emergencyKeywords.join(", ");
    return `🚨 EMERGENCY — Please call emergency services (911 or your local emergency number) IMMEDIATELY.

You mentioned: ${keywords}. This requires immediate medical attention that I cannot provide.

Please act now:
• Call 911 (or your local emergency number)
• Stay on the line with the dispatcher
• Do not drive yourself if symptoms are severe

Do not wait. Emergency services can help you right now.`;
  }

  if (safety.isDiagnosisRequest) {
    return `I understand you're looking for answers — that's completely natural when something feels off.

However, diagnosing medical conditions is something only a trained physician can do. It requires a physical examination, your full medical history, and often lab tests or imaging that I simply don't have access to.

${ctx.hasMedicalData ? `I can see you have health records uploaded — this information will be very useful to share with your doctor.` : ""}

What I can do to help:
• Give you general information about health topics
• Help you prepare questions for your doctor appointment
• Help you understand medical terms or concepts

Would you like help preparing for a conversation with your healthcare provider?`;
  }

  if (safety.isPrescriptionRequest) {
    return `Recommending or prescribing specific medications is something only a licensed physician or pharmacist can do safely — it's not within my role as a health information assistant.

${ctx.restrictions.length > 0 ? `⚠️ Your health profile notes medication restrictions: ${ctx.restrictions.join("; ")}. This makes it especially important that a doctor reviews any prescribing decisions.` : ""}
${ctx.allergies.length > 0 ? `⚠️ Your documented allergies (${ctx.allergies.join(", ")}) are also critical for any medication decisions.` : ""}

Please speak with your doctor or pharmacist, who can safely review your full health picture and prescribe what's right for you.`;
  }

  // ── Intent-specific responses ─────────────────────────────────────────────

  switch (intent) {

    case "greeting": {
      if (ctx.hasMedicalData) {
        return `Hello! I'm your MediNova AI health assistant. I can see you have ${ctx.recordCount} medical record(s) on file, so I can provide responses that take your personal health profile into account.

I'm here to help with general health questions, help you understand your records, or guide you toward the right care. What's on your mind today?`;
      }
      return `Hello! I'm your MediNova AI health assistant. I'm here to help with general health questions and guide you toward the right care.

Tip: Upload your medical records in the Health Memory section to get more personalised, context-aware responses. What can I help you with today?`;
    }

    case "thanks":
      return `You're very welcome! Taking an interest in your health is always worthwhile. Feel free to come back whenever you have questions — I'm here 24/7.

Take care of yourself!`;

    case "clear":
      return `To start a fresh conversation, you can use the "Clear chat" button at the top of this window. That will remove the conversation history and start fresh.

Is there something specific you'd like help with?`;

    // ── Hydration ───────────────────────────────────────────────────────────
    case "hydration": {
      let r = `Staying well hydrated is one of the simplest things you can do for your health. Here are the general guidelines:

• **Adults:** roughly 2.0–2.5 litres (8–10 cups) of total fluid per day, from all sources including food
• **Active days or hot weather:** you'll need more — listen to your thirst and check your urine colour (pale yellow = well hydrated; dark yellow = drink more)
• **Best sources:** plain water is ideal; herbal teas, milk, and water-rich fruits and vegetables all count
• **Limit:** sugary drinks, excessive caffeine, and alcohol, which can increase fluid loss

**Quick daily tips:**
• Drink a glass of water first thing in the morning
• Keep a water bottle visible at your desk or in your bag
• Drink a glass before each meal`;

      if (ctx.conditions.length > 0) {
        r += `\n\nWith your documented conditions (${ctx.conditions.join(", ")}), your fluid needs may differ — for example, some kidney or heart conditions require specific fluid targets. Your doctor can give you a personalised recommendation.`;
      }
      if (ctx.medications.length > 0) {
        r += `\n\nSome medications can affect hydration needs. If you're unsure whether yours do, it's worth asking your pharmacist.`;
      }
      return r;
    }

    // ── Sleep / fatigue ─────────────────────────────────────────────────────
    case "sleep_fatigue": {
      let r = `Feeling tired or having trouble sleeping is very common, and there's a lot you can do to improve it.

**Evidence-based sleep hygiene:**
• Aim for **7–9 hours** per night for most adults
• Keep a consistent sleep and wake time — even on weekends
• Keep your bedroom cool, dark, and quiet
• Avoid screens (phone, TV) for 30–60 minutes before bed — blue light suppresses melatonin
• Avoid caffeine after 2 pm and heavy meals close to bedtime
• Regular physical activity improves sleep quality (just avoid intense exercise within 2 hours of bed)

**If you feel persistently tired during the day:**
• Check whether you're getting enough sleep — quantity and quality both matter
• Consider iron levels, thyroid function, or vitamin B12/D deficiency — these are common, treatable causes of fatigue worth discussing with your GP`;

      if (ctx.conditions.length > 0) {
        r += `\n\nYour documented conditions (${ctx.conditions.join(", ")}) can sometimes affect sleep or energy levels. It may be worth mentioning persistent fatigue to your doctor in this context.`;
      }
      if (ctx.medications.length > 0) {
        r += `\n\nSome medications can cause drowsiness or disrupt sleep as a side effect. Your pharmacist can advise whether any of yours might be a factor.`;
      }
      r += `\n\nIf tiredness is severe, persistent (more than 2 weeks), or accompanied by other symptoms, please see a healthcare provider to rule out underlying causes.`;
      return r;
    }

    // ── Environment / air quality ────────────────────────────────────────────
    case "environment": {
      let r = `Air quality and environmental factors can meaningfully affect your health, especially for those with respiratory or cardiovascular conditions.

**General guidance for high-pollution days (high AQI/smog):**
• Check your local Air Quality Index (AQI) before going outside — most weather apps show this
• If AQI is above 100 (Unhealthy for Sensitive Groups), limit prolonged outdoor exertion
• If AQI is above 150 (Unhealthy for all), consider staying indoors or keeping activity brief
• **When outdoors in poor air quality:** an N95 or KN95 mask provides meaningful protection; standard surgical masks offer less filtration of fine particles (PM2.5)
• Keep windows closed on high-pollution days and use air purifiers indoors if available
• Avoid exercising near busy roads even on moderate air quality days`;

      if (ctx.conditions.length > 0) {
        const respiratoryConditions = ctx.conditions.filter(c =>
          /asthma|copd|lung|bronchit|respirat|emphysema|allerg/i.test(c)
        );
        const cardiacConditions = ctx.conditions.filter(c =>
          /heart|cardiac|coronary|cardiovascular/i.test(c)
        );

        if (respiratoryConditions.length > 0) {
          r += `\n\n⚠️ Given your documented respiratory condition(s) (${respiratoryConditions.join(", ")}), you are in a higher-risk group for air pollution effects. On poor air quality days, it's especially important to stay indoors, keep rescue inhalers accessible, and consult your doctor about an action plan.`;
        } else if (cardiacConditions.length > 0) {
          r += `\n\n⚠️ Your documented cardiac condition(s) (${cardiacConditions.join(", ")}) mean that fine-particle pollution can have a greater effect on your heart. Treat high-AQI days with extra caution.`;
        } else {
          r += `\n\nWith your health history (${ctx.conditions.join(", ")}), discuss with your doctor whether any specific precautions apply to you for poor air quality days.`;
        }
      } else {
        r += `\n\nFor otherwise healthy adults, moderate pollution levels are a minor concern. The main groups at higher risk are people with asthma, COPD, heart disease, the elderly, pregnant women, and young children.`;
      }
      return r;
    }

    // ── Fever ────────────────────────────────────────────────────────────────
    case "fever": {
      let r = `A fever is your body's natural response to infection and is generally a sign that your immune system is working.

**General guidance:**
• A temperature above **38°C (100.4°F)** is considered a fever in adults
• Most mild fevers from viral infections resolve within 3–5 days with rest and fluids
• Stay well hydrated — fever increases fluid loss
• Rest and avoid strenuous activity
• Over-the-counter fever reducers (paracetamol/acetaminophen or ibuprofen) can help manage discomfort — follow label instructions

**Seek medical attention if:**
• Fever exceeds **39.5°C (103°F)** and doesn't respond to medication
• Fever lasts more than **3 days**
• Accompanied by severe headache, stiff neck, rash, confusion, or difficulty breathing
• You are immunocompromised, pregnant, or over 65`;

      if (ctx.conditions.length > 0) {
        r += `\n\nWith your documented conditions (${ctx.conditions.join(", ")}), a fever may warrant earlier medical attention — don't hesitate to call your doctor.`;
      }
      if (ctx.medications.length > 0) {
        r += `\n\nNote: some of your documented medications may interact with over-the-counter fever reducers. Check with your pharmacist before combining them.`;
      }
      return r;
    }

    // ── Headache ─────────────────────────────────────────────────────────────
    case "headache": {
      let r = `Headaches are one of the most common health complaints and are usually not a sign of anything serious.

**Common causes of mild to moderate headaches:**
• Dehydration — try drinking a large glass of water first
• Tension (tight neck/shoulder muscles) — common with desk work or stress
• Skipping meals or low blood sugar
• Lack of sleep or oversleeping
• Eye strain from screens
• Caffeine withdrawal
• Sinus congestion

**Self-care for a typical headache:**
• Rest in a quiet, dark room if light is bothering you
• Drink water
• Apply a cold or warm compress to your forehead or neck
• Over-the-counter pain relief (paracetamol or ibuprofen) can help — follow dosage instructions

**See a doctor if your headache:**
• Is the worst headache of your life (sudden, severe — seek emergency care)
• Is accompanied by fever, stiff neck, confusion, or vision changes
• Keeps recurring or is getting worse over time
• Doesn't respond to standard pain relief`;

      if (ctx.medications.length > 0) {
        r += `\n\nNote: frequent use of pain relief medications (more than 2–3 times per week) can cause medication-overuse headaches. If headaches are recurring, speak with your doctor.`;
      }
      if (ctx.conditions.length > 0) {
        r += `\n\nYour health history (${ctx.conditions.join(", ")}) may be relevant if headaches are new or changing in character — worth mentioning at your next GP visit.`;
      }
      return r;
    }

    // ── Dizziness ─────────────────────────────────────────────────────────────
    case "dizziness": {
      let r = `Dizziness or light-headedness has many possible causes, most of which are benign and temporary.

**Common causes:**
• **Dehydration or not eating** — try sitting down, drinking water, and having a small snack
• **Standing up too quickly** (orthostatic hypotension) — rise slowly from sitting or lying down
• **Inner ear issues** (BPPV or labyrinthitis) — can cause a spinning sensation (vertigo)
• **Low blood pressure** or **anaemia**
• Side effect of certain medications
• Overheating or heat exhaustion

**What to do right now:**
• Sit or lie down immediately to prevent a fall
• Drink water
• Avoid sudden head movements until it passes
• Don't drive until fully resolved`;

      if (ctx.medications.length > 0) {
        r += `\n\nSome of your documented medications (${ctx.medications.slice(0, 2).join("; ")}${ctx.medications.length > 2 ? ", and others" : ""}) can cause dizziness as a side effect — especially blood pressure medications, diuretics, or sedatives. Your doctor or pharmacist can advise.`;
      }
      if (ctx.conditions.length > 0) {
        r += `\n\nWith your documented conditions (${ctx.conditions.join(", ")}), recurring dizziness is worth reporting to your doctor.`;
      }
      r += `\n\n⚠️ **Seek emergency care immediately** if dizziness is accompanied by chest pain, shortness of breath, sudden severe headache, facial drooping, or arm weakness — these can be signs of a serious event.`;
      return r;
    }

    // ── General symptoms ─────────────────────────────────────────────────────
    case "symptoms": {
      let r = `Thank you for sharing how you're feeling. While I can offer general information, only a qualified healthcare provider can properly evaluate your symptoms in person.

**Helpful steps while you monitor your symptoms:**
• Note when they started and how they've changed over time
• Record any factors that make them better or worse
• Track any other symptoms that appeared around the same time
• Stay hydrated and get adequate rest`;

      if (ctx.conditions.length > 0) {
        r += `\n\nFrom your health profile, your documented conditions (${ctx.conditions.join(", ")}) can sometimes be relevant to new symptoms. Your doctor — who knows your full history — is best placed to assess any connection.`;
      }
      if (ctx.medications.length > 0) {
        r += `\n\nYour current medications (${ctx.medications.slice(0, 3).join("; ")}${ctx.medications.length > 3 ? ", and others" : ""}) can occasionally cause side effects that present as symptoms — worth mentioning to your doctor.`;
      }
      r += `\n\nIf symptoms are severe, rapidly worsening, or affecting your daily functioning, please seek medical attention promptly. Would you like general information about a specific symptom?`;
      return r;
    }

    // ── Medication ────────────────────────────────────────────────────────────
    case "medication": {
      let r = `I can share general information about medications — though for anything specific to your own situation, please consult your doctor or pharmacist.`;

      if (ctx.medications.length > 0) {
        r += `\n\nFrom your health profile, your documented medications include:\n${ctx.medications.map(m => `• ${m}`).join("\n")}`;
      }
      if (ctx.unverifiedMedications.length > 0) {
        r += `\n\nThere are also medications extracted from your records that may need verification with your physician:\n${ctx.unverifiedMedications.slice(0, 5).map(m => `• ${m.split(" ")[0]}`).join("\n")}`;
      }
      if (ctx.restrictions.length > 0) {
        r += `\n\n⚠️ Medication restrictions on file: ${ctx.restrictions.join("; ")}. Always inform any prescribing doctor about these.`;
      }
      if (ctx.allergies.length > 0) {
        r += `\n\n⚠️ Documented allergies (${ctx.allergies.join(", ")}) — always share these when any new medication is prescribed.`;
      }
      r += `\n\nWhat specific medication information were you looking for?`;
      return r;
    }

    // ── Allergy ───────────────────────────────────────────────────────────────
    case "allergy": {
      if (ctx.allergies.length > 0) {
        return `Based on your health profile, your documented allergies are: **${ctx.allergies.join(", ")}**.

This is important information to share with every healthcare provider, pharmacist, and in emergency situations. Keep your allergy list updated and accessible.

If you're experiencing a severe allergic reaction right now — difficulty breathing, throat swelling, widespread hives — please call emergency services immediately.

Is there something specific about managing your allergies you'd like to know more about?`;
      }
      return `Understanding your allergies is important for safe healthcare.

If you suspect you have an allergy, an allergist can perform tests to identify specific triggers. Common categories include food, medication, environmental (pollen, dust), and contact allergies.

You can upload medical records to your MediNova profile to have your allergies documented here for future reference. Would you like more information about allergy testing or management?`;
    }

    // ── Nutrition / diet ─────────────────────────────────────────────────────
    case "nutrition": {
      let r = `Good nutrition is foundational to long-term health. Evidence-based general guidelines:

• Focus on whole, minimally processed foods
• Aim for variety in fruits and vegetables (different colours provide different nutrients)
• Choose whole grains over refined grains
• Include lean proteins: fish, legumes, poultry, eggs
• **Limit:** added sugars, saturated fats, trans fats, and excess sodium
• **Foods most people benefit from reducing:** ultra-processed snacks, sugary drinks, red and processed meats, fast food
• Stay well hydrated (roughly 2 litres of water daily for most adults)`;

      if (ctx.conditions.length > 0) {
        r += `\n\nWith your documented conditions (${ctx.conditions.join(", ")}), your nutritional needs may be more specific. A registered dietitian can create a plan tailored to your health profile and medications.`;
      }
      r += `\n\nIs there a specific nutritional topic — like managing a condition through diet, understanding food labels, or a specific food you're wondering about — you'd like to explore?`;
      return r;
    }

    // ── Exercise ──────────────────────────────────────────────────────────────
    case "exercise": {
      let r = `Regular physical activity is one of the most powerful things you can do for your health. General guidelines for adults:

• At least **150 minutes** of moderate-intensity aerobic activity per week (e.g. brisk walking, cycling, swimming)
• Or **75 minutes** of vigorous-intensity activity (e.g. running, aerobics)
• Muscle-strengthening activities at least **2 days per week**
• Reduce prolonged sitting — even short movement breaks help

**Good news:** almost any movement counts. Walking, dancing, gardening, climbing stairs — these all contribute to your activity total.`;

      if (ctx.conditions.length > 0 || ctx.surgeries.length > 0) {
        r += `\n\nGiven your health history`;
        if (ctx.conditions.length > 0) r += ` (${ctx.conditions.slice(0, 3).join(", ")})`;
        if (ctx.surgeries.length > 0) r += ` including prior surgical history`;
        r += `, it's important to check with your doctor before starting or significantly changing an exercise programme to ensure it's safe and appropriate for you.`;
      } else {
        r += `\n\nFor most healthy adults, starting with light to moderate activity (like a 20–30 minute brisk walk most days) is safe and beneficial. Increase intensity gradually.`;
      }
      r += `\n\nWould you like information about specific types of exercise, or how to get started safely?`;
      return r;
    }

    // ── Appointment ───────────────────────────────────────────────────────────
    case "appointment":
      return `To connect with the right healthcare provider:

• For routine or ongoing care, your primary care physician is a good starting point
• For specific concerns, a specialist may be more appropriate — your GP can refer you
• For urgent but non-emergency concerns, urgent care or same-day appointments are often available
• Telehealth options are widely available for many conditions and are very convenient

When booking, it helps to have:
• A brief description of your concern
• Your current medications list
• Your insurance information
${ctx.hasMedicalData ? "• Your MediNova health profile — a useful summary for new providers" : ""}

Use MediNova's Doctors and Hospitals sections to find providers near you. Is there a specific type of specialist or service you're looking for?`;

    // ── Tests / labs ─────────────────────────────────────────────────────────
    case "test":
      return `Medical tests are an important part of understanding and managing your health.

• Routine lab results are typically available within 24–72 hours
• Your doctor's office or patient portal is the right place to access and discuss results
• Ask your doctor to explain what any abnormal values mean in the context of your full health picture — a single number rarely tells the whole story

${ctx.hasMedicalData ? "Your uploaded records are stored in your MediNova health profile and can provide useful context when discussing results with your care team." : ""}

If you're waiting on results and concerned, don't hesitate to call your doctor's office. Is there a specific type of test you have questions about?`;

    // ── Insurance ─────────────────────────────────────────────────────────────
    case "insurance":
      return `Navigating health insurance can be challenging. General tips:

• Always verify that a provider is "in-network" before booking to avoid surprise bills
• Understand your deductible (what you pay before insurance kicks in) and out-of-pocket maximum
• Many plans offer free preventive care (annual check-ups, vaccines, screenings)
• Keep an Explanation of Benefits (EOB) from every claim for your records
• If you receive an unexpected bill, you can often negotiate or apply for financial assistance

For specific coverage questions, contact your insurer directly using the number on your insurance card. Is there something specific you're trying to understand or navigate?`;

    // ── Vaccines ─────────────────────────────────────────────────────────────
    case "vaccine":
      return `Vaccines are among the most effective preventive health tools available. Recommended vaccinations for adults include:

• Annual **influenza (flu)** vaccine
• **COVID-19** vaccine and boosters (per current health authority guidelines)
• **Tdap** booster every 10 years (tetanus, diphtheria, pertussis)
• **Shingles** vaccine — recommended for adults 50+
• **Pneumococcal** vaccine — recommended for adults 65+, or earlier for some conditions

${ctx.allergies.length > 0 ? `⚠️ Your documented allergies include: ${ctx.allergies.join(", ")}. Always inform your provider before receiving any vaccine so they can screen for relevant contraindications.` : ""}
${ctx.conditions.length > 0 ? `Your health conditions (${ctx.conditions.join(", ")}) may also affect which vaccines are recommended or require timing adjustments — discuss with your doctor.` : ""}

Is there a specific vaccine you're asking about?`;

    // ── Mental health ─────────────────────────────────────────────────────────
    case "mental_health":
      return `Mental health is just as important as physical health, and you're not alone in facing these challenges.

Some evidence-based strategies that can help with stress, anxiety, and low mood:
• Regular physical activity (even a 20-minute walk can make a real difference)
• Consistent sleep schedule (7–9 hours for most adults)
• Social connection and talking to people you trust
• Mindfulness, breathing exercises, or meditation
• Reducing caffeine and alcohol
• Limiting news and social media if they're a source of stress

If symptoms are persistent, severe, or affecting your daily life, please speak with a healthcare provider. Mental health conditions are highly treatable, and there's no need to navigate them alone.

If you ever have thoughts of harming yourself, please contact a crisis line or emergency services immediately.

Is there a specific aspect of mental wellbeing you'd like more information about?`;

    // ── General fallback — attempt to be useful rather than deflect ──────────
    default: {
      // Try to give a useful general wellness response instead of always asking
      // the user for more detail.
      let r = `Great question! Here's some general health guidance that may be relevant:

**Foundations of good health for most people:**
• **Sleep:** 7–9 hours per night for adults
• **Hydration:** roughly 2 litres of water daily
• **Movement:** at least 30 minutes of moderate activity most days
• **Nutrition:** mostly whole foods, plenty of vegetables and fruit
• **Preventive care:** regular GP check-ups, recommended screenings, and vaccinations

If your question is about something specific — a symptom, a medication, diet, exercise, or a health condition — feel free to ask and I'll do my best to provide useful general information.`;

      if (ctx.hasMedicalData) {
        r += `\n\nI have your health profile on file (${ctx.recordCount} uploaded record(s)), so if your question relates to your personal health history, I can factor that context in.`;
      } else {
        r += `\n\nTip: Upload your medical records to MediNova to get more personalised, context-aware responses.`;
      }
      return r;
    }
  }
}

// ─── Streaming export ─────────────────────────────────────────────────────────

export async function* generateMockStream(
  userMessage: string,
  memory: IHealthMemory | null
): AsyncGenerator<StreamChunk> {
  const fullResponse = buildMockResponse(userMessage, memory);

  const tokens = fullResponse.split(/(\s+)/);
  const CHUNK_SIZE = 4;

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE).join("");
    yield { type: "chunk", content: chunk };
    await new Promise<void>(resolve => setTimeout(resolve, 18));
  }

  yield { type: "done" };
}
