# WorkForcePro - React Web Adaptation

## Project Note
This project has been generated as a **React Web Application (PWA)** to adhere to the environment's ability to run standard web technologies immediately. It fulfills all the business logic requirements of the requested React Native application but runs in a browser.

### Features Implemented
1. **Authentication**: Simulated Phone/OTP login.
2. **Worker Management**: Add and list workers with details (Aadhar, wages).
3. **Attendance**: 
   - Uses `navigator.mediaDevices.getUserMedia` to access the device camera.
   - Simulates "Face Detection" with visual overlays and timeouts (replacing Google ML Kit for the web demo).
4. **Payroll**: Automated calculation based on attendance records.
5. **Persistence**: Uses `localStorage` to persist data across reloads, simulating Firestore offline capabilities.

### Mobile-First Design
The UI is built with Tailwind CSS specifically for mobile screens. Open the preview in a mobile view or resize your browser to see the intended layout.

### Libraries Used
- **React 18**
- **Tailwind CSS** (via CDN for zero-config styling)
- **Lucide React** (Icons)
- **Recharts** (Data Visualization)
