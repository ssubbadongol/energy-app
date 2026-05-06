# 🧠 Soft Focus

**Soft Focus** is a wellness and productivity platform designed specifically for **neurodiverse students and individuals**, built with empathy at its core.  
Created by neurodivergent developers, for neurodivergent users.

---

## 🌱 Inspiration

We wanted to build a platform that genuinely supports students — especially **neurodiverse students** who struggle with task management, executive dysfunction, and emotional overwhelm.

We are both on the spectrum: one with **ADHD** and the other with **Autism**. This made Soft Focus a deeply personal project, shaped by the real challenges we experience every day.

Traditional productivity tools often fail neurodiverse users. They focus on efficiency and pressure rather than **gentleness, flexibility, and emotional support**. Soft Focus exists to change that.

---

## 🚀 What It Does

Soft Focus is a **comprehensive wellness and productivity app** that combines task management, AI mentorship, community support, and focus tracking — all through an ADHD-friendly lens.

---

## ✅ Task Management (ADHD-Friendly by Design)

- **Today View**  
  Prioritized daily tasks with visual hierarchy and calming color coding

- **Life Tasks**  
  A separate space for recurring daily needs and long-term life management

- **Task Breakdown**  
  Break overwhelming tasks into manageable steps to reduce paralysis

- **Pinned Tasks**  
  Keep important tasks always visible to support working-memory challenges

---

## 🤖 AI-Powered Mentorship

- **Personalized AI Mentor**  
  An empathetic AI companion that adapts responses based on user tags (ADHD, Anxiety, etc.)

- **Conversation Memory**  
  Remembers past conversations for contextual, personalized support

- **Warm Personality**  
  Designed to feel like a supportive friend — not a cold chatbot

- **Quick Prompts**  
  One-tap access to common needs:
  - “I’m feeling overwhelmed”
  - “Help me focus on a task”

- **Optional Voice Support**  
  Text-to-speech responses for accessibility and immersion

---

## 🫂 Community Support (Community Pods)

- **Anonymous Connection**  
  Join temporary support pods (3–5 people) based on shared struggles

- **Safe, Ephemeral Spaces**  
  Pods last 24 hours or 7 days and then expire — no pressure, no permanence

- **Real-Time Chat**  
  Connect around topics like:
  - Focus & Motivation  
  - Overwhelm  
  - Anxiety  
  - Loneliness

- **Matched Support Styles**
  - Just listening  
  - Advice & tips  
  - Shared experiences  

---

## 🎯 Focus Mode with AI Attention Tracking

- **Camera-Based Focus Tracking**  
  Uses AI (Presage SDK) to monitor attention levels in real time

- **Color Overlay Mode**  
  Optional calming overlays to avoid the distraction of seeing yourself

- **Live Focus Metrics**  
  Real-time graph showing focus percentage during sessions

- **Session History**  
  Track focus patterns and improvement over time

- **6 Calming Focus Colors**
  - Calm Blue  
  - Forest Green  
  - Warm Beige  
  - Soft Purple  
  - Deep Gray  
  - Ocean Teal  

---

## 🛠️ How We Built It

Soft Focus was built rapidly with scalability and accessibility in mind.

### Tech Stack

**Frontend**
- React Native
- Expo & Expo Router
- TypeScript

**Backend**
- Firebase Authentication (anonymous auth for privacy)
- Firestore (real-time database)
- Cloud Storage

**AI & Voice**
- Google Gemini 2.0 Flash API (AI mentor)
- ElevenLabs API (text-to-speech)

**Focus Tracking**
- Presage SDK (native Android AI attention tracking)

**UI / UX**
- Lucide React Native icons
- React Native Chart Kit
- ADHD-friendly pastel color palette

The architecture is fully asynchronous with real-time syncing, local caching, and privacy-first defaults.

---

## ⚠️ Challenges We Faced

- **Expo Go limitations** with native SDKs (Presage required dev builds)
- **API rate limits** on free tiers (Gemini & ElevenLabs)
- **Environment variable handling** across Expo platforms
- **Firestore security rules** for safe conversation deletion
- **Real-time sync** without performance degradation
- **Camera permissions** across platforms
- **Audio playback complexity** for voice features
- **Balancing features vs cognitive load** for ADHD users

---

## 🏆 Accomplishments We’re Proud Of

- Fully functional **full-stack application**
- Empathetic, personality-driven AI mentor
- Anonymous, real-time community pods
- Innovative focus tracking with non-intrusive design
- Privacy-first architecture (anonymous auth, ephemeral data)
- Polished, accessible UI/UX
- Cross-platform support (Web, Android, iOS)
- Scalable Firebase backend

Most importantly:  
**We built something we would genuinely use every day.**

---

## 📚 What We Learned

- Integrating modern AI APIs into mobile apps
- Firebase real-time architecture & security rules
- Designing *for* neurodiversity, not around it
- When to use Expo Go vs development builds
- Prompt engineering for empathetic AI
- Managing cognitive load in UX design
- Privacy-preserving social features

---

## 🔮 What’s Next

### Short-Term
- Improve Presage focus accuracy
- Focus session analytics & insights
- AI-generated focus patterns (“You focus best in the morning”)
- Pomodoro + focus tracking
- Gentle achievements & streaks
- ADHD-friendly notifications

### Medium-Term
- Export AI conversations (journaling)
- Mood tracking
- Calendar integrations
- Optional social sharing
- Desktop focus mode
- Offline support with sync

### Long-Term Vision
- Therapist referral system
- Educational institution integration
- Research partnerships
- Community-driven strategies & content
- Guided CBT & mindfulness exercises
- Parent / educator dashboards (with consent)

---

## 💜 Our Mission

Soft Focus isn’t just an app.  
It’s a **companion**, a **support system**, and a **safe space** for neurodiverse individuals to thrive — not just survive.
