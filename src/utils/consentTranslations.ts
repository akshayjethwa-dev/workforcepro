// src/utils/consentTranslations.ts
import { WorkerLanguage } from '../types/index';

export const CURRENT_CONSENT_POLICY_VERSION = 'v2.1_DPDP_2023';

export interface ConsentContent {
  screenTitle: string;
  subtitle: string;
  dpdpBadge: string;
  policyVersionLabel: string;
  duressNotice: string;
  attendancePurpose: {
    title: string;
    description: string;
    whatCollected: string;
    whyCollected: string;
    retention: string;
    withdrawalMethod: string;
  };
  safetyPurpose: {
    title: string;
    description: string;
    whatCollected: string;
    whyCollected: string;
    retention: string;
    withdrawalMethod: string;
  };
  tenantMandateNote: string;
  agreeButton: string;
  declineNotice: string;
  withdrawalTitle: string;
  withdrawalPrompt: string;
  withdrawalConfirm: string;
  withdrawalWarning: string;
  withdrawnSuccess: string;
  botCommandsInfo: string;
}

export const CONSENT_TRANSLATIONS: Record<WorkerLanguage, ConsentContent> = {
  en: {
    screenTitle: 'Location Data & Privacy Consent',
    subtitle: 'Under the Digital Personal Data Protection (DPDP) Act 2023, you have full ownership over your location data. Please review what is captured and select your preferences.',
    dpdpBadge: 'DPDP Section 6(1) Compliant',
    policyVersionLabel: 'Policy Version: 2.1 (Nov 2026)',
    duressNotice: 'Consent must be free and uncoerced. Even if company policy requests tracking, your decision to grant or decline is faithfully recorded.',
    attendancePurpose: {
      title: '1. Attendance Geofence Verification',
      description: 'Used solely to verify that you are on factory premises at the instant of Punch IN / Punch OUT.',
      whatCollected: 'Single GPS coordinate lock at the exact second you press the Punch button.',
      whyCollected: 'To verify physical presence at your assigned factory or job site to compute wages.',
      retention: 'Retained for 180 days for statutory payroll compliance (Code on Wages, Form IV).',
      withdrawalMethod: 'Withdraw anytime from the "Location & Privacy" screen or by texting "STOP LOCATION" via WhatsApp.'
    },
    safetyPurpose: {
      title: '2. On-Duty Safety & Hazard Alerts',
      description: 'Periodic shift location updates for worker emergency SOS and restricted hazard zone alerts.',
      whatCollected: 'Periodic 15-minute breadcrumbs only while your shift is clocked IN.',
      whyCollected: 'Automated alerts if entering hazardous machinery zones or in industrial emergency response.',
      retention: 'Retained for 30 days, then purged automatically.',
      withdrawalMethod: 'Completely optional. You can decline this without affecting your ability to punch.'
    },
    tenantMandateNote: 'Even if company policy mandates shift breadcrumbs, you have the legal right under DPDP to decline. Declining enables PUNCH_ONLY mode without active tracking.',
    agreeButton: 'Accept Selected Consents & Continue',
    declineNotice: 'If you decline both, you will punch in PUNCH_ONLY mode (manual supervisor verification).',
    withdrawalTitle: 'Withdraw Location Consent',
    withdrawalPrompt: 'Select which location tracking purpose you wish to withdraw:',
    withdrawalConfirm: 'Confirm Withdrawal (Takes effect in 60s)',
    withdrawalWarning: 'Once withdrawn, tracking stops immediately. Your supervisor is notified and cannot re-enable tracking without your fresh device consent.',
    withdrawnSuccess: 'Consent withdrawn successfully. Your punches will now record in PUNCH_ONLY mode.',
    botCommandsInfo: 'WhatsApp Bot Command: Text "STOP LOCATION" or "LOCATION OFF" to 918000000000 to revoke tracking instantly.'
  },
  hi: {
    screenTitle: 'स्थान (लोकेशन) व गोपनीयता सहमति',
    subtitle: 'डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम (DPDP) 2023 के तहत आपको अपनी लोकेशन की पूरी जानकारी और वापस लेने का अधिकार है। कृपया समीक्षा करें।',
    dpdpBadge: 'DPDP धारा 6(1) के तहत सुरक्षित',
    policyVersionLabel: 'नीति संस्करण: 2.1 (नवंबर 2026)',
    duressNotice: 'सहमति पूरी तरह आपकी स्वेच्छा से होनी चाहिए। यदि कंपनी नियम ट्रैकिंग की अपेक्षा करते हैं, तब भी आपकी अस्वीकृति निष्पक्ष रूप से दर्ज की जाती है।',
    attendancePurpose: {
      title: '१. हाजिरी जियोफेंस सत्यापन (Attendance Location)',
      description: 'केवल पंच इन / पंच आउट करते समय फैक्ट्री परिसर में आपकी उपस्थिति सत्यापित करने के लिए।',
      whatCollected: 'केवल पंच बटन दबाते समय उस सेकंड का एक बार जीपीएस स्थान।',
      whyCollected: 'वेतन गणना और कानूनी उपस्थिति रिकॉर्ड (मजदूरी संहिता, फॉर्म ४) के लिए।',
      retention: '१८० दिनों तक वैधानिक रिकॉर्ड के लिए सुरक्षित रखा जाता है।',
      withdrawalMethod: 'कभी भी "लोकेशन व गोपनीयता" मेनू से या व्हाट्सएप पर "STOP LOCATION" लिखकर वापस लें।'
    },
    safetyPurpose: {
      title: '२. कार्यस्थल सुरक्षा व चेतावनी (Safety Location)',
      description: 'ड्यूटी के दौरान आपातकालीन सुरक्षा और खतरनाक मशीनरी जोन की चेतावनी के लिए।',
      whatCollected: 'केवल शिफ्ट के दौरान हर १५ मिनट में सुरक्षा ब्रेडक्रंब।',
      whyCollected: 'फैक्ट्री में आग, दुर्घटना या आपातकाल के समय आपकी सुरक्षा सुनिश्चित करने हेतु।',
      retention: '३० दिनों के बाद स्वतः मिटा दिया जाता है।',
      withdrawalMethod: 'यह पूरी तरह वैकल्पिक है। इसे बंद करने पर भी आप हाजिरी लगा सकते हैं।'
    },
    tenantMandateNote: 'भले ही फैक्ट्री प्रबंधन सुरक्षा ट्रैकिंग की सिफारिश करे, DPDP कानून आपको मना करने का अधिकार देता है। मना करने पर "केवल पंच" मोड चालू होगा।',
    agreeButton: 'चयनित सहमति स्वीकार करें व आगे बढ़ें',
    declineNotice: 'यदि आप दोनों अस्वीकार करते हैं, तो आप PUNCH_ONLY (बिना लोकेशन) मोड में पंच कर सकेंगे।',
    withdrawalTitle: 'लोकेशन सहमति वापस लें',
    withdrawalPrompt: 'चुनें कि आप कौन सी लोकेशन सहमति रद्द करना चाहते हैं:',
    withdrawalConfirm: 'सहमति वापस लेने की पुष्टि करें (६० सेकंड में प्रभावी)',
    withdrawalWarning: 'सहमति वापस लेते ही ट्रैकिंग तुरंत बंद हो जाएगी। सुपरवाइजर इसे आपकी दोबारा सहमति के बिना चालू नहीं कर सकते।',
    withdrawnSuccess: 'सहमति सफलतापूर्वक वापस ले ली गई। अब आप बिना लोकेशन हाजिरी लगा सकते हैं।',
    botCommandsInfo: 'व्हाट्सएप बॉट: ट्रैकिंग तुरंत बंद करने के लिए "STOP LOCATION" या "लोकेशन बंद" लिखकर भेजें।'
  },
  gu: {
    screenTitle: 'લોકેશન ડેટા અને ગોપનીયતા સંમતિ',
    subtitle: 'ડિજિટલ પર્સનલ ડેટા પ્રોટેક્શન (DPDP) કાયદો 2023 હેઠળ તમારી લોકેશન પર તમારો સંપૂર્ણ અધિકાર છે. કૃપા કરીને વિગતો તપાસી મંજૂરી આપો.',
    dpdpBadge: 'DPDP કલમ 6(1) અનુસાર પ્રમાણિત',
    policyVersionLabel: 'પોલિસી વર્ઝન: 2.1 (નવેમ્બર 2026)',
    duressNotice: 'સંમતિ મુક્ત હોવી જોઈએ. કંપની પોલિસી હોય તો પણ તમારી સંમતિ કે અસ્વીકાર બંને સચોટ રીતે નોંધાય છે.',
    attendancePurpose: {
      title: '૧. હાજરી જિયોફેન્સ ચકાસણી (Attendance Location)',
      description: 'માત્ર પંચ ઇન / પંચ આઉટ કરતી વખતે કારખાનાના પરિસરમાં હાજરી ચકાસવા માટે.',
      whatCollected: 'માત્ર પંચ બટન દબાવવાની સેકન્ડે એક જ વાર જીપીએસ લોકેશન.',
      whyCollected: 'તમારો પગાર અને કાયદેસર હાજરી રેકોર્ડ (વેતન સંહિતા) તૈયાર કરવા.',
      retention: '૧૮૦ દિવસ સુધી કાયદાકીય ઓડિટ માટે સાચવવામાં આવે છે.',
      withdrawalMethod: '"લોકેશન અને ગોપનીયતા" સ્ક્રીન અથવા વોટ્સએપ પર "STOP LOCATION" લખીને રદ કરી શકાય છે.'
    },
    safetyPurpose: {
      title: '૨. શિફ્ટ સુરક્ષા અને કટોકટી ચેતવણી (Safety Location)',
      description: 'કામ દરમિયાન કટોકટી SOS અને જોખમી ક્ષેત્રોની સુરક્ષા ચેતવણી માટે.',
      whatCollected: 'માત્ર ચાલુ શિફ્ટ દરમિયાન દર ૧૫ મિનિટે એક લોકેશન પોઇન્ટ.',
      whyCollected: 'ઔદ્યોગિક અકસ્માત કે આગ વખતે વર્કરની સુરક્ષા સુનિશ્ચિત કરવા.',
      retention: '૩૦ દિવસ પછી આપોઆપ નાશ પામે છે.',
      withdrawalMethod: 'સંપૂર્ણપણે વૈકલ્પિક છે. આ બંધ હોય તો પણ હાજરી નોંધી શકાય છે.'
    },
    tenantMandateNote: 'જો ફેક્ટરી પોલિસી લોકેશન માંગતી હોય, તો પણ DPDP કાયદો તમને ના પાડવાનો હક આપે છે. ના પાડવાથી "ઓન્લી પંચ" મોડ મળશે.',
    agreeButton: 'પસંદ કરેલ સંમતિ સ્વીકારો અને આગળ વધો',
    declineNotice: 'બંને અસ્વીકાર કરશો તો પણ તમે PUNCH_ONLY મોડમાં હાજરી પૂરી શકશો.',
    withdrawalTitle: 'લોકેશન સંમતિ પાછી ખેંચો',
    withdrawalPrompt: 'કઈ લોકેશન સંમતિ રદ કરવી છે તે પસંદ કરો:',
    withdrawalConfirm: 'સંમતિ રદ કરવાની પુષ્ટિ કરો (૬૦ સેકન્ડમાં લાગુ)',
    withdrawalWarning: 'સંમતિ પાછી ખેંચ્યા પછી ટ્રેકિંગ તરત બંધ થઈ જશે. સુપરવાઇઝર તમારી નવી સંમતિ વિના તેને ફરી ચાલુ કરી શકતા નથી.',
    withdrawnSuccess: 'સંમતિ સફળતાપૂર્વક પાછી ખેંચાઈ ગઈ છે.',
    botCommandsInfo: 'વોટ્સએપ બોટ: ટ્રેકિંગ બંધ કરવા માટે "STOP LOCATION" અથવા "લોકેશન બંધ" લખી મોકલો.'
  }
};
