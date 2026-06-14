import { analyzeSafety } from "./safetyLayer";
import { extractContextSummary } from "./healthContextBuilder";
import type { IHealthMemory } from "../models/HealthMemory";

export interface StreamChunk {
  type: "chunk" | "done" | "error";
  content?: string;
  message?: string;
}

function detectIntent(query: string): string {
  const q = query.toLowerCase();
  if (/symptom|feel|pain|hurt|ache|fever|cough|headache|nausea|dizzy|tired|fatigue|sore|vomit|diarrhea/.test(q)) return "symptoms";
  if (/medication|medicine|drug|pill|prescription|dosage|dose|tablet|capsule|supplement/.test(q)) return "medication";
  if (/allergy|allergic|reaction|intolerance|hives|rash/.test(q)) return "allergy";
  if (/diet|nutrition|eat|food|weight|calorie|meal|vegetable|fruit/.test(q)) return "nutrition";
  if (/exercise|workout|fitness|active|physical activity|gym|run|walk|sport/.test(q)) return "exercise";
  if (/stress|anxiety|depress|mental|mood|sleep|insomnia|worry|panic/.test(q)) return "mental_health";
  if (/appointment|schedule|book|visit/.test(q)) return "appointment";
  if (/doctor|specialist|physician|cardiolog|neurolog|dermato|orthoped/.test(q)) return "appointment";
  if (/test|lab|result|scan|blood|urine|x-ray|mri|ct scan|biopsy/.test(q)) return "test";
  if (/insurance|cover|payment|cost|bill/.test(q)) return "insurance";
  if (/vaccine|vaccination|immunization|booster|shot/.test(q)) return "vaccine";
  if (/hello|hi\b|hey\b|how are you|good morning|good evening/.test(q)) return "greeting";
  if (/thank/.test(q)) return "thanks";
  if (/clear|delete|reset|start over|new chat/.test(q)) return "clear";
  return "general";
}

function buildMockResponse(userMessage: string, memory: IHealthMemory | null): string {
  const safety = analyzeSafety(userMessage);
  const context = extractContextSummary(memory);
  const intent = detectIntent(userMessage);

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

${context.hasMedicalData ? `I can see you have health records uploaded — this information will be very useful to share with your doctor.` : ""}

What I can do to help:
• Give you general information about health topics
• Help you prepare questions for your doctor appointment
• Help you understand medical terms or concepts

Would you like help preparing for a conversation with your healthcare provider?`;
  }

  if (safety.isPrescriptionRequest) {
    return `Recommending or prescribing specific medications is something only a licensed physician or pharmacist can do safely — it's not within my role as a health information assistant.

${context.restrictions.length > 0 ? `⚠️ Your health profile notes medication restrictions: ${context.restrictions.join("; ")}. This makes it especially important that a doctor reviews any prescribing decisions.` : ""}
${context.allergies.length > 0 ? `⚠️ Your documented allergies (${context.allergies.join(", ")}) are also critical for any medication decisions.` : ""}

Please speak with your doctor or pharmacist, who can safely review your full health picture and prescribe what's right for you.`;
  }

  switch (intent) {
    case "greeting":
      if (context.hasMedicalData) {
        return `Hello! I'm your MediNova AI health assistant. I can see you have ${context.recordCount} medical record(s) on file, so I can provide responses that take your personal health profile into account.

I'm here to help with general health questions, help you understand your records, or guide you toward the right care. What's on your mind today?`;
      }
      return `Hello! I'm your MediNova AI health assistant. I'm here to help with general health questions and guide you toward the right care.

Tip: Upload your medical records in the Health Memory section to get more personalised, context-aware responses. What can I help you with today?`;

    case "symptoms": {
      let r = `Thank you for sharing how you're feeling. While I can offer general information, only a qualified healthcare provider can properly evaluate your symptoms in person.

Some helpful steps while you monitor your symptoms:
• Note when they started and how they've changed over time
• Record any factors that make them better or worse
• Track any other symptoms that appeared around the same time`;

      if (context.conditions.length > 0) {
        r += `\n\nFrom your health profile, your documented conditions (${context.conditions.join(", ")}) can sometimes be relevant to new symptoms. Your doctor — who knows your full history — is best placed to assess any connection.`;
      }
      if (context.medications.length > 0) {
        r += `\n\nYour current medications (${context.medications.slice(0, 3).join("; ")}${context.medications.length > 3 ? ", and others" : ""}) can occasionally cause side effects that present as symptoms — worth mentioning to your doctor.`;
      }
      r += `\n\nIf symptoms are severe, rapidly worsening, or affecting your daily functioning, please seek medical attention promptly. Would you like general information about a specific symptom?`;
      return r;
    }

    case "medication": {
      let r = `I can share general information about medications — though for anything specific to your own situation, please consult your doctor or pharmacist.`;

      if (context.medications.length > 0) {
        r += `\n\nFrom your health profile, your documented medications include:\n${context.medications.map(m => `• ${m}`).join("\n")}`;
      }
      if (context.unverifiedMedications.length > 0) {
        r += `\n\nThere are also medications extracted from your records that may need verification with your physician:\n${context.unverifiedMedications.slice(0, 5).map(m => `• ${m.split(" ")[0]}`).join("\n")}`;
      }
      if (context.restrictions.length > 0) {
        r += `\n\n⚠️ Medication restrictions on file: ${context.restrictions.join("; ")}. Always inform any prescribing doctor about these.`;
      }
      if (context.allergies.length > 0) {
        r += `\n\n⚠️ Documented allergies (${context.allergies.join(", ")}) — always share these when any new medication is prescribed.`;
      }
      r += `\n\nWhat specific medication information were you looking for?`;
      return r;
    }

    case "allergy": {
      if (context.allergies.length > 0) {
        return `Based on your health profile, your documented allergies are: ${context.allergies.join(", ")}.

This is important information to share with every healthcare provider, pharmacist, and in emergency situations. Keep your allergy list updated and accessible.

If you're experiencing a severe allergic reaction right now — difficulty breathing, throat swelling, widespread hives — please call emergency services immediately.

Is there something specific about managing your allergies you'd like to know more about?`;
      }
      return `Understanding your allergies is important for safe healthcare.

If you suspect you have an allergy, an allergist can perform tests to identify specific triggers. Common categories include food, medication, environmental (pollen, dust), and contact allergies.

You can upload medical records to your MediNova profile to have your allergies documented here for future reference. Would you like more information about allergy testing or management?`;
    }

    case "nutrition": {
      let r = `Good nutrition is foundational to long-term health. General evidence-based guidelines:

• Focus on whole, minimally processed foods
• Aim for variety in fruits and vegetables (different colours provide different nutrients)
• Choose whole grains over refined grains
• Include lean proteins: fish, legumes, poultry, eggs
• Limit added sugars, saturated fats, and excess sodium
• Stay well hydrated (roughly 2 litres of water daily for most adults)`;

      if (context.conditions.length > 0) {
        r += `\n\nWith your documented conditions (${context.conditions.join(", ")}), your nutritional needs may be more specific. A registered dietitian can create a plan tailored to your health profile and medications.`;
      }
      r += `\n\nIs there a specific nutritional topic — like managing a condition through diet, or understanding food labels — you'd like to explore?`;
      return r;
    }

    case "exercise": {
      let r = `Regular physical activity is one of the most powerful things you can do for your health. General guidelines for adults:

• At least 150 minutes of moderate-intensity aerobic activity per week (e.g. brisk walking)
• Or 75 minutes of vigorous-intensity activity (e.g. running, cycling)
• Muscle-strengthening activities at least 2 days per week
• Reduce prolonged sitting — even short movement breaks help`;

      if (context.conditions.length > 0 || context.surgeries.length > 0) {
        r += `\n\nGiven your health history`;
        if (context.conditions.length > 0) r += ` (${context.conditions.slice(0, 3).join(", ")})`;
        if (context.surgeries.length > 0) r += ` including prior surgical history`;
        r += `, it's important to check with your doctor before starting or significantly changing an exercise programme to ensure it's safe for you.`;
      }
      r += `\n\nWould you like information about specific types of exercise, or how to get started safely?`;
      return r;
    }

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
${context.hasMedicalData ? "• Your MediNova health profile — a useful summary for new providers" : ""}

Use MediNova's Doctors and Hospitals sections to find providers near you. Is there a specific type of specialist or service you're looking for?`;

    case "test":
      return `Medical tests are an important part of understanding and managing your health. General information:

• Routine lab results are typically available within 24–72 hours
• Your doctor's office or patient portal is the right place to access and discuss results
• Ask your doctor to explain what any abnormal values mean in the context of your full health picture — a single number rarely tells the whole story

${context.hasMedicalData ? "Your uploaded records are stored in your MediNova health profile and can provide useful context when discussing results with your care team." : ""}

If you're waiting on results and concerned, don't hesitate to call your doctor's office. Is there a specific type of test you have questions about?`;

    case "vaccine":
      return `Vaccines are among the most effective preventive health tools available. Recommended vaccinations for adults include:

• Annual influenza (flu) vaccine
• COVID-19 vaccine and boosters (per current health authority guidelines)
• Tdap booster every 10 years (tetanus, diphtheria, pertussis)
• Shingles vaccine — recommended for adults 50+
• Pneumococcal vaccine — recommended for adults 65+, or earlier for some conditions

${context.allergies.length > 0 ? `⚠️ Your documented allergies include: ${context.allergies.join(", ")}. Always inform your provider before receiving any vaccine so they can screen for relevant contraindications.` : ""}
${context.conditions.length > 0 ? `Your health conditions (${context.conditions.join(", ")}) may also affect which vaccines are recommended or require timing adjustments — discuss with your doctor.` : ""}

Is there a specific vaccine you're asking about?`;

    case "thanks":
      return `You're very welcome! Taking an interest in your health is always worthwhile. Feel free to come back whenever you have questions — I'm here 24/7.

Take care of yourself!`;

    case "clear":
      return `To start a fresh conversation, you can use the "Clear chat" button at the top of this window. That will remove the conversation history and start fresh.

Is there something specific you'd like help with?`;

    default: {
      let r = `Thank you for your question. I'm here to help with general health information and guide you toward the right care.`;

      if (context.hasMedicalData) {
        r += `\n\nI have your health profile on file (${context.recordCount} uploaded record(s)), so if your question relates to your personal health history, I can factor that context in.`;
      } else {
        r += `\n\nTip: Upload your medical records to MediNova to get more personalised, context-aware responses from me.`;
      }
      r += `\n\nCould you share a bit more detail about what you'd like to know? The more specific you are, the better I can help.`;
      return r;
    }
  }
}

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
